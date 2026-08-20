//
//  NewMeetingSheet.swift
//  trackr-mobile-ios
//
//  Web parity: NewMeetingDialog — title, date, a REQUIRED project link,
//  optional task, optional template that seeds the document.
//

import SwiftUI

struct NewMeetingSheet: View {
    @Bindable var model: AppModel
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var date = Date.now
    @State private var project = ""
    @State private var taskId: String?
    @State private var template = MeetingTemplate.all[0]

    private var projectOptions: [String] { model.projects.map(\.name) }
    private var taskOptions: [TaskItem] {
        model.tasks.filter { $0.project == project && $0.status != .done }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Meeting title", text: $title)
                        .font(.system(size: 20, weight: .semibold))
                    DatePicker("Date", selection: $date)
                }

                Section("Linked to") {
                    Picker("Project", selection: $project) {
                        ForEach(projectOptions, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Task", selection: $taskId) {
                        Text("None").tag(nil as String?)
                        ForEach(taskOptions) { task in
                            Text("\(task.id) · \(task.title)")
                                .lineLimit(1)
                                .tag(task.id as String?)
                        }
                    }
                }

                Section("Template") {
                    Picker("Template", selection: $template) {
                        ForEach(MeetingTemplate.all) { option in
                            Text("\(Image(systemName: option.icon))  \(option.name)")
                                .tag(option)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
            }
            .navigationTitle("New Meeting")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { create() }
                        .fontWeight(.semibold)
                        .disabled(
                            title.trimmingCharacters(in: .whitespaces).isEmpty || project.isEmpty
                        )
                }
            }
            .onAppear {
                if project.isEmpty { project = projectOptions.first ?? "" }
            }
            // A task belongs to its project — reset the link when it no
            // longer matches.
            .onChange(of: project) {
                if let taskId, !taskOptions.contains(where: { $0.id == taskId }) {
                    self.taskId = nil
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func create() {
        let note = NoteItem(
            id: "m-\(UUID().uuidString.prefix(8))",
            kind: .meeting,
            title: title.trimmingCharacters(in: .whitespaces),
            icon: "person.2",
            bodyHtml: template.bodyHtml,
            owner: TaskItem.sampleUsers[0],  // current user later
            meetingDate: date,
            project: project,
            taskId: taskId
        )
        model.notes.insert(note, at: 0)
        dismiss()
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        NewMeetingSheet(model: AppModel())
    }
}
