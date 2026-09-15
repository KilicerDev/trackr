//
//  CreateTaskSheet.swift
//  trackr-mobile-ios
//
//  Thin wrapper over the unified create form (`CreateEntityForm`) pinned to
//  the task kind — the ticket → task conversion and the project page "+"
//  present it pre-seeded. Field set mirrors the web's CreateTaskModal.
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

    var body: some View {
        CreateEntityForm(
            model: model,
            tasks: tasks,
            tickets: model?.tickets ?? [],
            initialKind: .task,
            allowsKindSwitch: false,
            initialProject: initialProject,
            initialTitle: initialTitle,
            initialPriority: initialPriority,
            footer: footer,
            kindLabel: navTitle,
            allowsAttachments: allowsAttachments,
            onCreateTask: onCreate
        )
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        CreateTaskSheet(
            tasks: TaskItem.samples,
            model: AppModel(),
            initialTitle: "Outlook renders the newsletter without rounded corners",
            initialPriority: .high,
            footer: "Open checklist items and attachments carry over; an internal note links the task on the ticket.",
            navTitle: "Create Task",
            allowsAttachments: false
        ) { _, _ in }
    }
    .preferredColorScheme(.dark)
}
