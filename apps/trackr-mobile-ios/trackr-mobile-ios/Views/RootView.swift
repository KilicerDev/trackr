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
    @State private var auth = AuthSession()
    @State private var model = AppModel(sampleData: false)
    @State private var engine: SyncEngine?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch auth.phase {
            case .launching:
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.webBackground)
            case .signedOut:
                ServerSetupView(auth: auth)
            case .ready:
                ContentView(model: model, auth: auth)
            }
        }
        .task { await auth.restore() }
        .onChange(of: auth.phase, initial: true) { _, phase in
            switch phase {
            case .ready:
                guard engine == nil, let client = auth.client, let host = auth.serverURL else { break }
                let fresh = SyncEngine(client: client, model: model, host: host)
                engine = fresh
                model.onSignOut = { [weak auth, weak push] in
                    push?.disable()
                    Task { await auth?.signOut() }
                }
                push?.enable(client: client)
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
                model = AppModel(sampleData: false)
            case .launching:
                break
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
