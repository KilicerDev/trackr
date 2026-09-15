//
//  RootView.swift
//  trackr-mobile-ios
//
//  Boot gate: restore the stored session → either the sign-in screen or the
//  tab shell. Owns the SyncEngine lifecycle, including the foreground/
//  background handoff that drives event-based refresh (never timers).
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
    }

    private var signedInOrOut: some View {
        Group {
            switch auth.phase {
            case .launching:
                LaunchView()
            case .signedOut:
                ServerSetupView(auth: auth)
            case .ready:
                // First launch on this device has no snapshot cache to paint
                // from — keep the brand screen up until the first refresh
                // lands (capped in SyncEngine) instead of showing empty tabs.
                ZStack {
                    AppShell(model: model, auth: auth)
                    if engine?.isColdStarting == true {
                        LaunchView()
                            .transition(.opacity)
                            .zIndex(1)
                    }
                }
                .animation(.easeOut(duration: 0.35), value: engine?.isColdStarting)
            }
        }
        .environment(\.attachmentStore, attachmentStore)
        .task { await auth.restore() }
        .onChange(of: auth.phase, initial: true) { _, phase in
            switch phase {
            case .ready:
                guard engine == nil, let client = auth.client, let host = auth.serverURL else { break }
                let fresh = SyncEngine(client: client, model: model, host: host)
                engine = fresh
                attachmentStore = AttachmentStore(client: client)
                model.onSignOut = { [weak auth, weak push] in
                    push?.disable()
                    Task { await auth?.signOut() }
                }
                push?.enable(client: client)
                model.restoreSession()
                let activity = SessionActivityController(client: client)
                activity.reconcile(with: model.session)
                sessionActivity = activity
                if openPlayerWhenReady {
                    openPlayerWhenReady = false
                    model.showingPlayer = model.session.isRunning
                }
                // Notification taps deep-link into the entity; a tap that
                // cold-started the app is queued and consumed here.
                let model = self.model
                push?.onOpen = { url in model.handlePushURL(url) }
                Task { [weak push] in
                    await fresh.start()
                    if let pending = push?.consumePendingURL() {
                        model.handlePushURL(pending)
                    }
                }
            case .signedOut:
                engine?.stop()
                engine = nil
                attachmentStore = nil
                sessionActivity?.end()
                sessionActivity = nil
                model = AppModel(sampleData: false)
            case .launching:
                break
            }
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
}

#Preview {
    RootView()
}
