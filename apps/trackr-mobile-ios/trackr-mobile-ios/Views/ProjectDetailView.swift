//
//  ProjectDetailView.swift
//  trackr-mobile-ios
//
//  Project detail: header with icon tile and status, description, stats,
//  team, and the project's tasks.
//

import SwiftUI

struct ProjectDetailView: View {
    @Bindable var model: AppModel
    let project: ProjectItem

    @State private var showingHistory = false

    private var tasks: [TaskItem] {
        model.tasks.filter { $0.project == project.name }
    }

    private var loggedMinutes: Int {
        tasks.reduce(0) { $0 + $1.loggedMinutes }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                header

                LazyVGrid(
                    columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())],
                    spacing: 12
                ) {
                    StatCard(
                        label: "Open Tasks",
                        value: "\(tasks.count { $0.status != .done })",
                        icon: "tray.full",
                        color: Color(hex: 0x7A9CF0)
                    )
                    StatCard(
                        label: "In Progress",
                        value: "\(tasks.count { $0.status == .inProgress })",
                        icon: "play.circle",
                        color: Color(hex: 0xF0A85C)
                    )
                    StatCard(
                        label: "Done",
                        value: "\(tasks.count { $0.status == .done })",
                        icon: "checkmark.circle",
                        color: Color(hex: 0x7FC8A9)
                    )
                    StatCard(
                        label: "Logged",
                        value: loggedMinutes > 0 ? loggedMinutes.minutesFormatted : "0m",
                        icon: "clock",
                        color: Color(hex: 0xC08BD6)
                    )
                }

                if !project.members.isEmpty {
                    section("Team") { teamCard }
                }

                section("Tasks") {
                    if tasks.isEmpty {
                        Text("No tasks in this project yet.")
                            .font(.system(size: 14))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .cardStyle()
                    } else {
                        LazyVStack(spacing: 10) {
                            ForEach(tasks) { task in
                                NavigationLink(value: task) {
                                    TaskCard(task: task)
                                }
                                .buttonStyle(.plain)
                                .taskContextMenu(for: task, model: model)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Color.webBackground)
        .navigationTitle(project.key)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    model.toggleFavorite(projectKey: project.key)
                } label: {
                    Image(systemName: isFavorite ? "star.fill" : "star")
                }
                .tint(isFavorite ? .yellow : nil)
                Button {
                    showingHistory = true
                } label: {
                    Image(systemName: "clock.arrow.circlepath")
                }
            }
            ToolbarSpacer(.fixed, placement: .topBarTrailing)
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    if model.session.isRunning {
                        model.showingPlayer = true
                    } else {
                        model.startSession(for: project.ref)
                    }
                } label: {
                    Image(systemName: "play.fill")
                }
            }
        }
        .sheet(isPresented: $showingHistory) {
            ProjectHistorySheet(model: model, projectKey: project.key)
        }
    }

    /// Live favorite state — `project` is a navigation-value copy.
    private var isFavorite: Bool {
        model.projects.first { $0.key == project.key }?.isFavorite ?? false
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 13)
                    .fill(
                        LinearGradient(
                            colors: [project.color, project.color.opacity(0.55)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 56, height: 56)
                    .overlay(
                        Text(project.initial)
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundStyle(.white)
                    )
                VStack(alignment: .leading, spacing: 3) {
                    Text(project.name)
                        .font(.system(size: 22, weight: .semibold))
                    HStack(spacing: 5) {
                        Circle()
                            .fill(project.status.color)
                            .frame(width: 8, height: 8)
                        Text(project.status.label)
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                        Text("· updated \(project.updatedAt.formatted(.relative(presentation: .named)))")
                            .font(.system(size: 13))
                            .foregroundStyle(.tertiary)
                    }
                }
            }
            if !project.about.isEmpty {
                Text(project.about)
                    .font(.system(size: 15))
                    .foregroundStyle(.secondary)
                    .lineSpacing(3)
            }
        }
        .padding(.top, 8)
    }

    private var teamCard: some View {
        VStack(spacing: 0) {
            ForEach(Array(project.members.enumerated()), id: \.element) { index, member in
                if index > 0 {
                    Divider().padding(.leading, 14)
                }
                HStack(spacing: 10) {
                    AvatarView(user: member, size: 26)
                    Text(member.name)
                        .font(.system(size: 14))
                    Spacer()
                    if member == project.lead {
                        Text("Lead")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Color.accentColor)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.accentColor.opacity(0.12), in: .capsule)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            }
        }
        .cardStyle(padded: false)
    }

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(.secondary)
                .padding(.leading, 4)
            content()
        }
    }
}

#Preview {
    NavigationStack {
        ProjectDetailView(model: AppModel(), project: ProjectItem.samples[0])
    }
}
