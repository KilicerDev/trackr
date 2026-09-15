//
//  ProjectDetailView.swift
//  trackr-mobile-ios
//
//  Project detail: tile + name header, status / lead chips, description,
//  a stats card, the team card and the project's tasks as flat hairline
//  rows. "Create task" seeds the shared create sheet with this project;
//  "Start session" starts a free session bound to the project.
//

import SwiftUI

struct ProjectDetailView: View {
    @Bindable var model: AppModel
    let project: ProjectItem

    @State private var showingHistory = false

    /// Live copy — `project` is a navigation-value snapshot.
    private var current: ProjectItem {
        model.projects.first { $0.key == project.key } ?? project
    }

    private var tasks: [TaskItem] {
        model.tasks.filter { $0.project == project.name }
    }

    private var openTasks: [TaskItem] {
        tasks.filter { $0.status != .done }
    }

    private var loggedMinutes: Int {
        tasks.reduce(0) { $0 + $1.loggedMinutes }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                chips
                if !current.about.isEmpty {
                    Text(current.about)
                        .font(.system(size: 15))
                        .lineSpacing(3)
                        .foregroundStyle(TK.textBody)
                }
                if !current.tags.isEmpty {
                    ChipFlow(spacing: 6) {
                        ForEach(current.tags, id: \.self) { TKTagChip(tag: $0) }
                    }
                }
                stats
                actions
                if !current.members.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        TKSectionLabel("Team")
                        teamCard
                    }
                }
                tasksSection
            }
            .padding(.horizontal, TK.gutter)
            .padding(.top, 12)
            .padding(.bottom, 32)
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: 6) {
                    Text(current.key)
                        .font(.tkMono(12))
                        .foregroundStyle(TK.text3)
                    TKDot(color: current.color, size: 6)
                    Text(current.name)
                        .font(.system(size: 13))
                        .foregroundStyle(TK.text2)
                        .lineLimit(1)
                }
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    model.toggleFavorite(projectKey: project.key)
                } label: {
                    Image(systemName: current.isFavorite ? "star.fill" : "star")
                        .foregroundStyle(current.isFavorite ? TK.amber : TK.text)
                }
                .accessibilityLabel(current.isFavorite ? "Unfavorite" : "Favorite")
                Menu {
                    Button { createTask() } label: { Label("Create task", systemImage: "plus") }
                    Button { startSession() } label: {
                        Label(model.session.isRunning ? "Show session" : "Start session", systemImage: "play.fill")
                    }
                    Button { showingHistory = true } label: {
                        Label("History", systemImage: "clock.arrow.circlepath")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .foregroundStyle(TK.text)
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if model.session.isRunning {
                TKSessionMiniBar(model: model)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 8)
            }
        }
        .sheet(isPresented: $showingHistory) {
            ProjectHistorySheet(model: model, projectKey: project.key)
        }
    }

    // MARK: - Actions

    /// The shared "+" sheet, scoped to this project.
    private func createTask() {
        model.presentCreate(kind: .task, projectName: project.name)
    }

    private func startSession() {
        if model.session.isRunning {
            model.showingPlayer = true
        } else {
            model.startSession(for: project.ref)
        }
    }

    // MARK: - Sections

    private var header: some View {
        HStack(spacing: 14) {
            ProjectTile(project: current, size: 56)
            VStack(alignment: .leading, spacing: 4) {
                Text(current.name)
                    .font(.tkDetailTitle)
                    .tkTitleTracking()
                    .foregroundStyle(TK.text)
                    .lineLimit(2)
                HStack(spacing: 6) {
                    Text(current.key)
                        .font(.tkMono(12))
                        .foregroundStyle(TK.text3)
                    Text("·")
                        .font(.system(size: 12))
                        .foregroundStyle(TK.text4)
                    Text("updated \(current.updatedAt.relativeShort)")
                        .font(.system(size: 12))
                        .foregroundStyle(TK.text3)
                }
            }
        }
    }

    private var chips: some View {
        ChipFlow {
            PropertyChip(leadingInset: 10) {
                TKDot(color: current.status.color)
                Text(current.status.label)
            }
            if let lead = current.lead {
                PropertyChip(leadingInset: 8) {
                    AvatarView(user: lead, size: 24)
                    Text("Lead")
                        .foregroundStyle(TK.text2)
                    Text(lead.name)
                }
            }
            PropertyChip {
                Image(systemName: "person.2")
                    .font(.system(size: 12))
                    .foregroundStyle(TK.text2)
                Text("\(current.members.count)")
                    .font(.tkMono(14))
            }
        }
    }

    private var stats: some View {
        HStack(spacing: 0) {
            stat("\(openTasks.count)", label: "Open")
            statDivider
            stat("\(tasks.count { $0.status == .inProgress })", label: "In progress")
            statDivider
            stat("\(tasks.count { $0.status == .done })", label: "Done")
            statDivider
            stat(loggedMinutes > 0 ? loggedMinutes.minutesFormatted : "0m", label: "Logged")
        }
        .frame(maxWidth: .infinity)
        .tkCard(padding: nil)
    }

    private var statDivider: some View {
        Rectangle().fill(TK.hairlineStrong).frame(width: 1, height: 36)
    }

    private func stat(_ value: String, label: String) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(.tkMono(18, weight: .semibold))
                .foregroundStyle(TK.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(TK.text3)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }

    private var actions: some View {
        HStack(spacing: 8) {
            TKSecondaryButton(
                title: model.session.isRunning ? "Session running" : "Start session",
                icon: "play.fill", fill: TK.card, height: 40, expand: true, action: startSession
            )
            TKSecondaryButton(title: "Create task", icon: "plus", fill: TK.card, height: 40, expand: true, action: createTask)
            TKCircleButton(systemImage: "clock.arrow.circlepath", size: 40, fill: TK.card, iconSize: 14) {
                showingHistory = true
            }
            .overlay(Circle().strokeBorder(TK.borderStrong, lineWidth: 1))
            .accessibilityLabel("History")
        }
    }

    private var teamCard: some View {
        VStack(spacing: 0) {
            ForEach(Array(current.members.enumerated()), id: \.element) { index, member in
                if index > 0 {
                    TKHairline(leading: 50)
                }
                HStack(spacing: 12) {
                    AvatarView(user: member, size: 26)
                    Text(member.name)
                        .font(.tkRow)
                        .foregroundStyle(TK.text)
                    Spacer()
                    if member == current.lead {
                        Text("Lead")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(TK.accent)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(TK.accentSoft, in: .capsule)
                    }
                }
                .padding(.horizontal, 12)
                .frame(minHeight: 46)
            }
        }
        .tkCard(padding: nil)
    }

    private var tasksSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                TKSectionLabel("Tasks")
                Text("\(openTasks.count) open")
                    .font(.tkMono(11))
                    .foregroundStyle(TK.text3)
            }
            if tasks.isEmpty {
                VStack(spacing: 0) {
                    TKEmptyState(text: "No tasks in this project yet.", padding: 28)
                    TKHairline()
                    Button(action: createTask) {
                        HStack(spacing: 8) {
                            Image(systemName: "plus")
                                .font(.system(size: 13, weight: .semibold))
                            Text("Create task")
                                .font(.system(size: 14, weight: .medium))
                        }
                        .foregroundStyle(TK.accent)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .contentShape(.rect)
                    }
                    .buttonStyle(TKPressStyle())
                }
                .tkCard(padding: nil)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(tasks.enumerated()), id: \.element.id) { index, task in
                        if index > 0 {
                            TKHairline()
                        }
                        NavigationLink(value: task) {
                            ProjectTaskRow(task: task)
                        }
                        .buttonStyle(TKPressStyle())
                        .taskContextMenu(for: task, model: model)
                    }
                }
                .tkCard(padding: nil)
            }
        }
    }
}

/// Flat task row inside the project: status glyph · title · key + due.
private struct ProjectTaskRow: View {
    let task: TaskItem

    private var done: Bool { task.status == .done }

    private var due: (text: String, color: Color)? {
        if let countdown = task.dueCountdown {
            return (countdown.label, countdown.tone.color ?? TK.text3)
        }
        guard let date = task.due else { return nil }
        return (date.formatted(.dateTime.day().month(.abbreviated)), TK.text3)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            StatusDot(status: task.status, size: 16)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 4) {
                Text(task.title)
                    .font(.tkRow)
                    .foregroundStyle(done ? TK.text2 : TK.text)
                    .strikethrough(done, color: TK.text3)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                HStack(spacing: 8) {
                    Text(task.id)
                        .font(.tkMono(11))
                        .foregroundStyle(TK.text3)
                    if task.checklistTotal > 0 {
                        Text("☑ \(task.checklistDone)/\(task.checklistTotal)")
                            .font(.tkMono(11))
                            .foregroundStyle(TK.text3)
                    }
                    Spacer(minLength: 0)
                    if let due {
                        Text(due.text)
                            .font(.system(size: 11))
                            .foregroundStyle(due.color)
                    }
                }
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(TK.text5)
                .padding(.top, 4)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .opacity(done ? 0.55 : 1)
        .contentShape(.rect)
    }
}

#Preview {
    NavigationStack {
        ProjectDetailView(model: AppModel(), project: ProjectItem.samples[0])
            .tkDetailScreen()
    }
    .preferredColorScheme(.dark)
}
