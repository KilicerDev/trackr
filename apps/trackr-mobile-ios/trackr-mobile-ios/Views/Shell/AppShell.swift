//
//  AppShell.swift
//  trackr-mobile-ios
//
//  The signed-in container. No TabView: the selected surface is one of the
//  root screens (each owns a NavigationStack and applies `.tkRootScreen`,
//  which draws the shared top bar and the custom tab bar). The four main
//  tabs stay mounted so their scroll state survives switching; secondary
//  surfaces mount on first visit.
//
//  Shell-level overlays: workspace switcher, account menu, create sheet,
//  session sheet, toast.
//

import SwiftUI

struct AppShell: View {
    @Bindable var model: AppModel
    /// nil in previews — Sign Out needs it in the real app.
    var auth: AuthSession? = nil
    /// Optional so previews without a RootView still render.
    @Environment(DeviceChrome.self) private var chrome: DeviceChrome?
    @State private var mounted: Set<AppTab> = Set(AppTab.mainTabs)
    @State private var lastMainTab: AppTab = .week

    var body: some View {
        Group {
            if chrome?.hasRail == true {
                systemTabs
            } else {
                customTabs
            }
        }
        .background(TK.bg.ignoresSafeArea())
        .onChange(of: model.selectedTab, initial: true) { _, tab in
            mounted.insert(tab)
        }
        .overlay {
            if model.showingWorkspaces {
                WorkspaceSwitcher(model: model, auth: auth).zIndex(10)
            }
            if model.showingAccountMenu {
                AccountMenu(model: model).zIndex(10)
            }
        }
        .animation(.easeOut(duration: 0.15), value: model.showingWorkspaces)
        .animation(.easeOut(duration: 0.15), value: model.showingAccountMenu)
        .tkToast(model, bottomPadding: model.isShowingDetail ? 80 : (chrome?.hasRail == true ? 46 : TK.tabBarHeight + 46))
        .sheet(isPresented: $model.showingCreate, onDismiss: model.clearCreateSeeds) {
            CreateSheet(model: model)
        }
        .sheet(isPresented: $model.showingPlayer, onDismiss: model.clearSessionAfterDismiss) {
            SessionPlayerView(model: model)
        }
        // "Add workspace" / "Sign in again": a successful sign-in switches
        // the host, which rebuilds the shell — and this model with it.
        .sheet(isPresented: $model.showingAddWorkspace) {
            if let auth {
                ServerSetupView(auth: auth, prefill: model.addWorkspacePrefill) {
                    model.showingAddWorkspace = false
                }
            }
        }
    }

    /// Regular phones: no TabView — the selected surface is one of the root
    /// screens, the four main tabs stay mounted so their scroll state
    /// survives switching, and TKTabBar draws the bar.
    private var customTabs: some View {
        ZStack {
            ForEach(Array(mounted), id: \.self) { tab in
                surface(tab)
                    .opacity(model.selectedTab == tab ? 1 : 0)
                    .allowsHitTesting(model.selectedTab == tab)
                    .accessibilityHidden(model.selectedTab != tab)
                    .zIndex(model.selectedTab == tab ? 1 : 0)
            }
        }
    }

    /// Devices with a system vertical bar (iPhone Duo folded): a system
    /// TabView so iOS hosts the tabs — and pushed details' back button —
    /// in that bar itself. Only the four main tabs live in the TabView:
    /// UIKit asserts when a hidden tab is selected, so the secondary
    /// surfaces (inbox, projects, …) render as a layer above it while the
    /// bar keeps showing the last main tab. The raised "+" moves into the
    /// top bar (TKTopBar), since the bar isn't ours to style.
    private var systemTabs: some View {
        TabView(selection: mainSelection) {
            ForEach(AppTab.mainTabs, id: \.self) { tab in
                Tab(value: tab) {
                    // A secondary surface shows inside the main tab it was
                    // opened from (not above the TabView — that would cover
                    // the system bar too), the main surface kept mounted
                    // underneath so its scroll state survives.
                    ZStack {
                        surface(tab)
                            .opacity(secondarySurface == nil ? 1 : 0)
                            .allowsHitTesting(secondarySurface == nil)
                            .accessibilityHidden(secondarySurface != nil)
                        if let secondary = secondarySurface, tab == lastMainTab {
                            surface(secondary)
                                .background(TK.bg.ignoresSafeArea())
                                .transition(.opacity)
                                .zIndex(1)
                        }
                    }
                    .animation(.easeOut(duration: 0.15), value: secondarySurface)
                } label: {
                        // The system bar renders symbols in their .fill
                        // variant, which turns some of ours into solid blobs;
                        // keep the outlined glyphs the rest of the app uses.
                        Label(tab.title, systemImage: tab.systemImage)
                            .environment(\.symbolVariants, .none)
                    }
                }
            }
        .tint(TK.accent)
        .onChange(of: model.selectedTab, initial: true) { _, tab in
            if AppTab.mainTabs.contains(tab) { lastMainTab = tab }
        }
    }

    /// The secondary surface currently open (inbox, projects, …), nil on a
    /// main tab.
    private var secondarySurface: AppTab? {
        AppTab.mainTabs.contains(model.selectedTab) ? nil : model.selectedTab
    }

    /// The TabView's selection: the current tab when it's a main one, else
    /// the main tab the user was on before opening a secondary surface.
    private var mainSelection: Binding<AppTab> {
        Binding(
            get: { AppTab.mainTabs.contains(model.selectedTab) ? model.selectedTab : lastMainTab },
            set: { model.go($0) }
        )
    }

    @ViewBuilder
    private func surface(_ tab: AppTab) -> some View {
        switch tab {
        case .week: MyWeekView(model: model)
        case .tickets: TicketsView(model: model)
        case .tasks: TasksView(model: model)
        case .search: SearchView(model: model)
        case .inbox: InboxView(model: model)
        case .projects: ProjectsView(model: model)
        case .chat: ChatView(model: model)
        case .notes: NotesView(model: model)
        case .meetings: MeetingsView(model: model)
        case .wiki: WikiView(model: model)
        case .settings: SettingsView(model: model)
        }
    }
}

#Preview {
    AppShell(model: AppModel())
        .preferredColorScheme(.dark)
}
