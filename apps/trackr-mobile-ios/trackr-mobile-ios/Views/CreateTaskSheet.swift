//
//  CreateTaskSheet.swift
//  trackr-mobile-ios
//
//  Quick task entry: essentials visible at medium height, everything else
//  reachable by expanding or scrolling the sheet. Field set mirrors the
//  web's CreateTaskModal (minus tags/plannedFor for now).
//

import SwiftUI

struct CreateTaskSheet: View {
    /// Existing tasks — source for project options and the next task id.
    let tasks: [TaskItem]
    var model: AppModel? = nil
    /// Preselected project name (e.g. when opened from a project's page).
    var initialProject: String? = nil
    /// Seeds for flows that prefill the sheet (ticket → task conversion).
    var initialTitle: String? = nil
    var initialPriority: TaskPriority? = nil
    /// Footer under the title section (the conversion hint); nil hides it.
    var footer: String? = nil
    var navTitle: String = "New Task"
    /// Conversion hides staging — the convert endpoint has no file leg
    /// (the server carries the ticket's own attachments over instead).
    var allowsAttachments: Bool = true
    /// Staged files ride along in the same create request (multipart), so
    /// the server can list them in the `task.created` webhook.
    let onCreate: (TaskItem, [PickedFile]) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var seeded = false

    @State private var title = ""
    @State private var details = ""
    @State private var type: TaskType = .task
    @State private var status: TaskStatus = .todo
    @State private var priority: TaskPriority = .none
    @State private var project = ""
    @State private var assignees: Set<UserRef> = []
    @State private var hasDue = false
    @State private var due = Date.now
    @State private var estimate: Int?
    @State private var staging = FileStaging()

    private var projectOptions: [String] {
        if let model, !model.projects.isEmpty {
            return model.projects
                .filter { $0.status != .archived }
                .map(\.name)
        }
        return Set(tasks.map(\.project)).sorted()
    }
    /// Rich picker rows (color + favorite) when a model backs the sheet;
    /// bare names for previews/sample data.
    private var projectChoices: [ProjectChoice] {
        if let model, !model.projects.isEmpty {
            return model.projects
                .filter { $0.status != .archived }
                .map { ProjectChoice(name: $0.name, color: $0.color, isFavorite: $0.isFavorite) }
        }
        return projectOptions.map { ProjectChoice(name: $0) }
    }
    /// Projects with the most recent task activity — the list arrives
    /// server-ordered by recency, so first-seen distinct names suffice.
    private var recentProjectNames: [String] {
        var seen = Set<String>()
        var out: [String] = []
        for item in tasks where !item.project.isEmpty && seen.insert(item.project).inserted {
            out.append(item.project)
            if out.count == 5 { break }
        }
        return out
    }
    private var userOptions: [UserRef] {
        if let model, !model.assignableUsers.isEmpty { return model.assignableUsers }
        return Array(Set(tasks.flatMap(\.assignees))).sorted { $0.name < $1.name }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Task title", text: $title)
                        .font(.system(size: 20, weight: .semibold))
                    TextField("Add description…", text: $details, axis: .vertical)
                        .lineLimit(3...8)
                        .font(.system(size: 15))
                } footer: {
                    if let footer { Text(footer) }
                }

                Section("Details") {
                    // 50+ projects in production: a pushed, searchable list
                    // (favorites + recents first) instead of an endless Menu.
                    NavigationLink {
                        ProjectPickerScreen(
                            choices: projectChoices,
                            recents: recentProjectNames,
                            selection: $project
                        )
                    } label: {
                        HStack {
                            Text("Project")
                            Spacer()
                            Text(project.isEmpty ? "Choose" : project)
                                .foregroundStyle(Color(.secondaryLabel))
                                .lineLimit(1)
                        }
                    }
                    Picker("Type", selection: $type) {
                        ForEach(TaskType.allCases) { type in
                            // Icon interpolated into the Text so the
                            // collapsed value gets proper icon-to-text
                            // spacing (a Label crams them together there).
                            Text("\(Image(systemName: type.systemImage))  \(type.label)")
                                .tag(type)
                        }
                    }
                    Picker("Status", selection: $status) {
                        ForEach(TaskStatus.allCases) { Text($0.label).tag($0) }
                    }
                    Picker("Priority", selection: $priority) {
                        ForEach(TaskPriority.allCases) { Text($0.label).tag($0) }
                    }
                    MultiSelectRow(
                        title: "Assignees",
                        options: userOptions.map { ($0, $0.name) },
                        selection: $assignees
                    )
                }

                Section("Schedule") {
                    Toggle("Due date", isOn: $hasDue.animation())
                    if hasDue {
                        DatePicker("Due", selection: $due, displayedComponents: .date)
                    }
                    Picker("Estimate", selection: $estimate) {
                        ForEach(EstimateOptions.all, id: \.minutes) { option in
                            Text(option.label).tag(option.minutes)
                        }
                    }
                }

                if allowsAttachments {
                    StagedFilesSection(staging: $staging)
                }
            }
            .fileStaging($staging, noun: "task")
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(navTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        onCreate(makeTask(), staging.files)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                if !seeded {
                    seeded = true
                    if let initialTitle { title = initialTitle }
                    if let initialPriority { priority = initialPriority }
                }
                if project.isEmpty {
                    project = initialProject ?? projectOptions.first ?? ""
                }
                // Web parity: the creator is the default assignee (the server
                // falls back to them anyway — preselect so the UI matches).
                if assignees.isEmpty, let me = model?.currentUser {
                    let match = userOptions.first { $0.serverId == me.serverId } ?? me
                    assignees = [match]
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func makeTask() -> TaskItem {
        let nextNumber = tasks
            .compactMap { Int($0.id.split(separator: "-").last ?? "") }
            .max()
            .map { $0 + 1 } ?? 1
        return TaskItem(
            id: "TRK-\(nextNumber)",
            title: title.trimmingCharacters(in: .whitespaces),
            status: status,
            priority: priority,
            type: type,
            project: project,
            details: details.trimmingCharacters(in: .whitespacesAndNewlines),
            due: hasDue ? due : nil,
            estimate: estimate,
            assignees: assignees.sorted { $0.name < $1.name }
        )
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        CreateTaskSheet(tasks: TaskItem.samples) { _, _ in }
    }
}
