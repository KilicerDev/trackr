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
    @State private var mounted: Set<AppTab> = Set(AppTab.mainTabs)

    var body: some View {
        ZStack {
            ForEach(Array(mounted), id: \.self) { tab in
                surface(tab)
                    .opacity(model.selectedTab == tab ? 1 : 0)
                    .allowsHitTesting(model.selectedTab == tab)
                    .accessibilityHidden(model.selectedTab != tab)
                    .zIndex(model.selectedTab == tab ? 1 : 0)
            }
        }
        .background(TK.bg.ignoresSafeArea())
        .onChange(of: model.selectedTab, initial: true) { _, tab in
            mounted.insert(tab)
        }
        .overlay {
            if model.showingWorkspaces {
                WorkspaceSwitcher(model: model).zIndex(10)
            }
            if model.showingAccountMenu {
                AccountMenu(model: model).zIndex(10)
            }
        }
        .animation(.easeOut(duration: 0.15), value: model.showingWorkspaces)
        .animation(.easeOut(duration: 0.15), value: model.showingAccountMenu)
        .tkToast(model, bottomPadding: model.isShowingDetail ? 80 : TK.tabBarHeight + 46)
        .sheet(isPresented: $model.showingCreate) {
            CreateSheet(model: model)
        }
        .sheet(isPresented: $model.showingPlayer, onDismiss: model.clearSessionAfterDismiss) {
            SessionPlayerView(model: model)
        }
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
