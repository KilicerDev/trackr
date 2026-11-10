//
//  RootView.swift
//  trackr-mobile-ios
//
//  Boot gate: restore the stored session → either the sign-in screen or the
//  tab shell. Owns the SyncEngine lifecycle, including the foreground/
//  background handoff that drives event-based refresh (never timers), and
//  the teardown + rebuild that a workspace switch is: a new AppModel and
//  SyncEngine for the new host, painted from that host's own cache.
//

import SwiftUI

struct RootView: View {
    var push: PushRegistrar? = nil
    /// `--sample-data` launch argument: skip sign-in and run the shell on
    /// the bundled sample data (design work, simulator screenshots).
    private static let sampleMode = ProcessInfo.processInfo.arguments.contains("--sample-data")
    @State private var auth = AuthSession()
    @State private var model: AppModel = {
        let model = AppModel(sampleData: RootView.sampleMode)
        // `--tab <name>` picks the initial surface (simulator screenshots
        // can't tap the tab bar from the CLI).
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: "--tab"), index + 1 < args.count,
           let tab = AppTab.allCases.first(where: { "\($0)" == args[index + 1] }) {
            model.selectedTab = tab
        }
        // `--open task:TRK-118` / `--open ticket:MEDI-14` pushes a sample
        // detail; `--session` starts a sample work session (mini bar).
        if let index = args.firstIndex(of: "--open"), index + 1 < args.count {
            let parts = args[index + 1].split(separator: ":", maxSplits: 1).map(String.init)
            if parts.count == 2, parts[0] == "task", let task = model.tasks.first(where: { $0.id == parts[1] }) {
                model.open(task)
            } else if parts.count == 2, parts[0] == "ticket", let ticket = model.tickets.first(where: { $0.id == parts[1] }) {
                model.open(ticket)
            } else if parts.count == 2, parts[0] == "project", let project = model.projects.first(where: { $0.key == parts[1] }) {
                model.selectedTab = .projects
                model.projectsPath.append(project)
            }
        }
        // `--create ticket|task|session` opens the create sheet.
        if let index = args.firstIndex(of: "--create"), index + 1 < args.count,
           let kind = CreateKind(rawValue: args[index + 1]) {
            model.presentCreate(kind: kind)
        }
        if args.contains("--session"), let task = model.tasks.first(where: { $0.status == .inProgress }) {
            model.startSession(for: task)
            model.showingPlayer = args.contains("--player")
        }
        return model
    }()
    @AppStorage("trackr.theme") private var theme = "system"
    @State private var engine: SyncEngine?
    @State private var attachmentStore: AttachmentStore?
    @State private var sessionActivity: SessionActivityController?
    /// Live Activity tap that cold-started the app — honored once the
    /// session has been restored.
    @State private var openPlayerWhenReady = false
    /// Push tap for a workspace that isn't active yet — opened after the
    /// switch to it has started its engine.
    @State private var pendingPushURL: String?
    /// A workspace switch is in flight: the skeleton covers the content
    /// area until the new engine has painted.
    @State private var switching = false
    @State private var switchStarted = Date.distantPast
    /// System bar placement (iPhone Duo's vertical strip) — probed by a
    /// UIKit view; the shell switches to system tabs when it's present.
    @State private var chrome = DeviceChrome()
    @Environment(\.scenePhase) private var scenePhase

    private var colorScheme: ColorScheme? {
        switch theme {
        case "dark": .dark
        case "light": .light
        default: nil
        }
    }

    var body: some View {
        Group {
            if Self.sampleMode {
                AppShell(model: model)
            } else {
                signedInOrOut
            }
        }
        .preferredColorScheme(colorScheme)
        .environment(chrome)
        .background(DeviceChromeReader(chrome: chrome).ignoresSafeArea())
    }

    private var signedInOrOut: some View {
        Group {
            switch auth.phase {
            case .launching:
                LaunchView()
            case .signedOut:
                ServerSetupView(auth: auth, prefill: auth.lastHost)
            case .ready:
                // First launch on this device has no snapshot cache to paint
                // from — keep the brand screen up until the first refresh
                // lands (capped in SyncEngine) instead of showing empty tabs.
                // A workspace switch instead crossfades the shell (keyed by
                // host) and shows a list skeleton under the new top bar until
                // the new workspace's cache has painted.
                ZStack {
                    AppShell(model: model, auth: auth)
                        .id(auth.serverURL)
                        .transition(.opacity)
                    if switching {
                        WorkspaceSwitchSkeleton()
                            .padding(.top, TKTopBar.height)
                            .padding(.bottom, chrome.hasRail ? 0 : TK.tabBarHeight)
                            .transition(.opacity)
                            .zIndex(1)
                    } else if engine?.isColdStarting == true {
                        LaunchView()
                            .transition(.opacity)
                            .zIndex(1)
                    }
                }
                .animation(.easeOut(duration: 0.35), value: engine?.isColdStarting)
                .animation(.easeInOut(duration: 0.3), value: switching)
                .animation(.easeInOut(duration: 0.25), value: auth.serverURL)
            }
        }
        // Drop the switch skeleton once the new engine painted its cache
        // (or finished the first refresh when there was none), but never
        // before it had a moment on screen — a 40 ms flash reads as a glitch.
        .onChange(of: engine?.isBootstrapped == true && engine?.isColdStarting == false) { _, painted in
            guard switching, painted else { return }
            let elapsed = Date.now.timeIntervalSince(switchStarted)
            Task {
                try? await Task.sleep(for: .seconds(max(0, 0.45 - elapsed)))
                switching = false
            }
        }
        .environment(\.attachmentStore, attachmentStore)
        .task { await auth.restore() }
        .onChange(of: auth.phase, initial: true) { _, phase in
            switch phase {
            case .ready: connect()
            case .signedOut:
                // Signing out of the last workspace also passed through the
                // serverURL change above — no shell to skeleton over.
                switching = false
                disconnect()
            case .launching: break
            }
        }
        // A workspace switch keeps the phase at .ready and swaps the host:
        // tear the old shell down and build one for the new host, staying
        // on the same root tab (My week / Tickets / Tasks) when it was one.
        .onChange(of: auth.serverURL) { _, host in
            if engine != nil, engine?.host != host {
                switching = true
                switchStarted = .now
                disconnect(keepingTab: true)
            }
            if host != nil, auth.phase == .ready { connect() }
        }
        // Live Activity follows the session: start with it, end with it,
        // and pick up title / note edits when the player closes.
        .onChange(of: model.session.startedAt) { _, startedAt in
            if startedAt != nil {
                sessionActivity?.start(model.session)
            } else {
                sessionActivity?.end()
            }
        }
        .onChange(of: model.showingPlayer) { _, showing in
            if !showing { sessionActivity?.update(model.session) }
        }
        .onChange(of: model.session.notes.count) {
            sessionActivity?.update(model.session)
        }
        .onChange(of: model.session.pauseStartedAt) {
            sessionActivity?.update(model.session)
        }
        // trackr://session — the Live Activity tap lands in the player.
        .onOpenURL { url in
            guard url == WorkSessionAttributes.openURL else { return }
            if auth.phase == .ready {
                model.showingPlayer = model.session.isRunning
            } else {
                openPlayerWhenReady = true
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard auth.phase == .ready else { return }
            switch phase {
            case .active: engine?.appDidForeground()
            case .background: engine?.appDidBackground()
            default: break
            }
        }
    }

    // MARK: - Shell lifecycle

    /// Builds the shell for the active workspace. Idempotent: a second call
    /// while an engine runs is a no-op.
    private func connect() {
        guard engine == nil, let client = auth.client, let host = auth.serverURL else { return }
        let fresh = SyncEngine(client: client, model: model, host: host)
        engine = fresh
        attachmentStore = AttachmentStore(client: client)
        let auth = self.auth
        model.onSignOut = { [weak auth, weak push] in
            push?.disable()
            Task { await auth?.signOut() }
        }
        model.onAccountsChanged = { [weak auth] in auth?.reloadAccounts() }
        auth.onRevoke = { [weak push] client in push?.unregister(from: client) }
        push?.enable(client: client)
        model.sessionStore = SessionStore(host: host)
        model.restoreSession()
        let activity = SessionActivityController(client: client)
        activity.reconcile(with: model.session)
        sessionActivity = activity
        if openPlayerWhenReady {
            openPlayerWhenReady = false
            model.showingPlayer = model.session.isRunning
        }
        // Notification taps deep-link into the entity; a tap that
        // cold-started the app is queued and consumed here. The device
        // stays registered with every signed-in workspace, so a tap may
        // belong to another host — switch there first.
        let model = self.model
        push?.onOpen = { url in openPush(url) }
        Task { [weak push] in
            await fresh.start()
            if let pending = pendingPushURL {
                pendingPushURL = nil
                model.handlePushURL(pending)
            } else if let pending = push?.consumePendingURL() {
                openPush(pending)
            }
        }
    }

    /// Tears the shell down (sign-out or the first half of a switch). The
    /// Live Activity ends with it; the session itself stays parked in the
    /// workspace's SessionStore and comes back on return. `keepingTab`
    /// (switch) carries a main root tab over so Tickets stays Tickets;
    /// anything deeper (a detail, Inbox, Projects…) is workspace-specific
    /// and starts over on My week.
    private func disconnect(keepingTab: Bool = false) {
        let tab = model.selectedTab
        engine?.stop()
        engine = nil
        attachmentStore = nil
        sessionActivity?.end()
        sessionActivity = nil
        model = AppModel(sampleData: false)
        if keepingTab, [.week, .tickets, .tasks].contains(tab) {
            model.selectedTab = tab
        }
    }

    /// Routes a push `url` (absolute, carries the server origin) to its
    /// workspace: the active one opens it directly, another signed-in one
    /// is switched to first.
    private func openPush(_ url: String) {
        if let target = URL(string: url),
           let account = auth.accounts.first(where: { $0.host.host() == target.host() }),
           account.host != auth.serverURL,
           auth.hasToken(for: account.host) {
            pendingPushURL = url
            Task { await auth.switchTo(account.host) }
        } else {
            model.handlePushURL(url)
        }
    }
}

#Preview {
    RootView()
}
