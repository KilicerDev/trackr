//
//  HomeView.swift
//  trackr-mobile-ios
//
//  Favorite projects as gradient cards with a play button that starts a
//  work session (the trackr "now playing"), plus Apple-Music-style quick
//  links into the content areas (notes, meetings, wiki).
//

import SwiftUI

struct HomeView: View {
    @Bindable var model: AppModel
    @State private var showingProfile = false

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

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
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

                    QuickLinksList()
                        .padding(.top, 8)
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground))
            // All Home-stack destinations live here at the stack root —
            // registering them inside pushed views scrambles push order.
            .navigationDestination(for: HomeRoute.self) { route in
                switch route {
                case .allProjects: ProjectsView(model: model)
                case .notes: NotesView(model: model)
                case .meetings: MeetingsView(model: model)
                case .wiki: WikiView(model: model)
                case .chat: ChatView(model: model)
                }
            }
            .navigationDestination(for: ProjectItem.self) { project in
                ProjectDetailView(model: model, project: project)
            }
            .navigationDestination(for: TaskItem.self) { task in
                TaskDetailView(task: task)
            }
            .navigationDestination(for: NoteItem.self) { note in
                NoteDetailView(model: model, note: note)
            }
            .navigationDestination(for: WikiPageItem.self) { page in
                WikiPageView(page: page)
            }
            .navigationDestination(for: ChatThread.self) { thread in
                ChatThreadView(model: model, threadId: thread.id)
            }
            .navigationDestination(for: TicketItem.self) { ticket in
                TicketDetailView(ticket: ticket)
            }
            .navigationTitle(greeting)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingProfile = true
                    } label: {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.title2)
                    }
                }
            }
            .sheet(isPresented: $showingProfile) {
                ProfileSheet()
            }
        }
    }
}

/// Apple-Music-style link rows: tinted icon, plain label, chevron, hairline
/// separators — deliberately flat next to the card-based sections.
private struct QuickLinksList: View {
    private let links: [(route: HomeRoute, icon: String, label: String)] = [
        (.chat, "bubble.left.and.bubble.right.fill", "Chat"),
        (.notes, "note.text", "Notes"),
        (.meetings, "person.2.fill", "Meetings"),
        (.wiki, "books.vertical.fill", "Wiki"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(links, id: \.route) { link in
                NavigationLink(value: link.route) {
                    HStack(spacing: 14) {
                        Image(systemName: link.icon)
                            .font(.system(size: 19))
                            .foregroundStyle(Color.accentColor)
                            .frame(width: 28)
                        Text(link.label)
                            .font(.system(size: 17))
                            .foregroundStyle(Color(.label))
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color(.tertiaryLabel))
                    }
                    .padding(.vertical, 13)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                Divider()
                    .padding(.leading, 42)
            }
        }
        .padding(.horizontal, 4)
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
