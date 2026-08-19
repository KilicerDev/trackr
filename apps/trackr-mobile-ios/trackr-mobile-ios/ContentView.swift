//
//  ContentView.swift
//  trackr-mobile-ios
//

import SwiftUI

struct ContentView: View {
    @State private var model = AppModel()

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.selectedTab) {
            Tab("Home", systemImage: "house.fill", value: AppTab.home) {
                HomeView(model: model)
            }
            Tab("Tickets", systemImage: "ticket.fill", value: AppTab.tickets) {
                TicketsView()
            }
            Tab("Tasks", systemImage: "checklist", value: AppTab.tasks) {
                TasksView(model: model)
            }
            Tab("Notes", systemImage: "note.text", value: AppTab.notes) {
                NotesView()
            }
            Tab(value: AppTab.search, role: .search) {
                SearchView()
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        // isEnabled variant: a conditional inside the builder leaves an
        // empty accessory pill behind when the session ends.
        .tabViewBottomAccessory(isEnabled: model.session.isRunning) {
            SessionBar(model: model)
        }
        // Full screen like Apple Music's player — a sheet leaves a black
        // strip above the top edge.
        .fullScreenCover(isPresented: $model.showingPlayer) {
            SessionPlayerView(model: model)
        }
    }
}

#Preview {
    ContentView()
}
