//
//  HomeView.swift
//  trackr-mobile-ios
//
//  Favorite projects as gradient cards with a play button that starts a
//  work session (the trackr "now playing").
//

import SwiftUI

struct HomeView: View {
    @Bindable var model: AppModel

    private func openTasks(in project: ProjectRef) -> Int {
        model.tasks.count { $0.project == project.name && $0.status != .done }
    }

    /// Time-of-day greeting with the current user's first name.
    private var greeting: String {
        let name = TaskItem.sampleUsers[0].name  // current user later
        let firstName = name.split(separator: " ").first.map(String.init) ?? name
        switch Calendar.current.component(.hour, from: .now) {
        case 5..<12: return "Good morning, \(firstName)"
        case 12..<18: return "Hello, \(firstName)"
        default: return "Good evening, \(firstName)"
        }
    }

    private var loggedTodayMinutes: Int {
        model.tasks
            .flatMap(\.timeLogs)
            .filter { Calendar.current.isDateInToday($0.date) }
            .reduce(0) { $0 + $1.minutes }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    LazyVGrid(
                        columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())],
                        spacing: 12
                    ) {
                        StatCard(
                            label: "Open Tasks",
                            value: "\(model.tasks.count { $0.status != .done })",
                            icon: "tray.full",
                            color: Color(hex: 0x7A9CF0)
                        )
                        StatCard(
                            label: "In Progress",
                            value: "\(model.tasks.count { $0.status == .inProgress })",
                            icon: "play.circle",
                            color: Color(hex: 0xF0A85C)
                        )
                        StatCard(
                            label: "Due Soon",
                            value: "\(model.tasks.count { $0.dueCountdown != nil })",
                            icon: "calendar.badge.exclamationmark",
                            color: Color(hex: 0xEF4F5E)
                        )
                        StatCard(
                            label: "Logged Today",
                            value: loggedTodayMinutes > 0 ? loggedTodayMinutes.minutesFormatted : "0m",
                            icon: "clock",
                            color: Color(hex: 0x7FC8A9)
                        )
                    }

                    HStack(alignment: .firstTextBaseline) {
                        Text("Favorite Projects")
                            .font(.title3.bold())
                        Spacer()
                        NavigationLink(value: HomeRoute.allProjects) {
                            Text("All Projects")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                    .padding(.horizontal, 4)
                    LazyVGrid(
                        columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())],
                        spacing: 12
                    ) {
                        ForEach(model.projects.filter(\.isFavorite)) { project in
                            NavigationLink(value: project) {
                                ProjectCard(
                                    project: project.ref,
                                    openTasks: openTasks(in: project.ref),
                                    isActive: model.session.isRunning
                                        && model.session.project == project.ref
                                ) {
                                    if model.session.isRunning {
                                        model.showingPlayer = true
                                    } else {
                                        model.startSession(for: project.ref)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground))
            // All Home-stack destinations live here at the stack root —
            // registering them inside pushed views scrambles push order.
            .navigationDestination(for: HomeRoute.self) { route in
                switch route {
                case .allProjects: ProjectsView(model: model)
                }
            }
            .navigationDestination(for: ProjectItem.self) { project in
                ProjectDetailView(model: model, project: project)
            }
            .navigationDestination(for: TaskItem.self) { task in
                TaskDetailView(task: task)
            }
            .navigationTitle(greeting)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        // Profile — wired up later
                    } label: {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.title2)
                    }
                }
            }
        }
    }
}

private struct ProjectCard: View {
    let project: ProjectRef
    let openTasks: Int
    let isActive: Bool
    let onPlay: () -> Void

    var body: some View {
        LinearGradient(
            colors: [project.color.opacity(0.85), project.color.opacity(0.45)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .frame(height: 140)
        .clipShape(.rect(cornerRadius: 18))
        .overlay(alignment: .topLeading) {
            VStack(alignment: .leading, spacing: 3) {
                Text(project.name)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                Text("\(openTasks) open tasks")
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.85))
            }
            .padding(13)
        }
        .overlay(alignment: .bottomTrailing) {
            Button(action: onPlay) {
                Image(systemName: isActive ? "waveform" : "play.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .symbolEffect(.variableColor.iterative, isActive: isActive)
                    .frame(width: 42, height: 42)
                    .background(.white.opacity(0.22), in: .circle)
            }
            .buttonStyle(.plain)
            .padding(10)
        }
    }
}

#Preview {
    HomeView(model: AppModel())
}
