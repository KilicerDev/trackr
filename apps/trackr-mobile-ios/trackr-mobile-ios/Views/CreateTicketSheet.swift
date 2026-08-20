//
//  CreateTicketSheet.swift
//  trackr-mobile-ios
//
//  Quick ticket entry, mirroring the web CreateTicketModal essentials:
//  org, subject, message, category, priority, assignees.
//

import SwiftUI

struct CreateTicketSheet: View {
    /// Existing tickets — source for org options and the next display id.
    let tickets: [TicketItem]
    let onCreate: (TicketItem) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var subject = ""
    @State private var message = ""
    @State private var org: OrgRef?
    @State private var category: TicketCategory = .general
    @State private var priority: TaskPriority = .medium
    @State private var assignees: Set<UserRef> = []

    private var orgOptions: [OrgRef] {
        Array(Set(tickets.map(\.org))).sorted { $0.name < $1.name }
    }

    private var canCreate: Bool {
        !subject.trimmingCharacters(in: .whitespaces).isEmpty && org != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Subject", text: $subject)
                        .font(.system(size: 20, weight: .semibold))
                    TextField("Describe the issue…", text: $message, axis: .vertical)
                        .lineLimit(3...8)
                        .font(.system(size: 15))
                }

                Section("Details") {
                    Picker("Organization", selection: $org) {
                        Text("Select…").tag(nil as OrgRef?)
                        ForEach(orgOptions, id: \.self) { option in
                            Text(option.name).tag(option as OrgRef?)
                        }
                    }
                    Picker("Category", selection: $category) {
                        ForEach(TicketCategory.allCases) { Text($0.label).tag($0) }
                    }
                    Picker("Priority", selection: $priority) {
                        ForEach(TaskPriority.ticketCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    MultiSelectRow(
                        title: "Assignees",
                        options: TaskItem.sampleUsers.map { ($0, $0.name) },
                        selection: $assignees
                    )
                }
            }
            .navigationTitle("New Ticket")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Create") { create() }
                        .fontWeight(.semibold)
                        .disabled(!canCreate)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func create() {
        guard let org else { return }
        // Next number within the org's display-id namespace.
        let nextNumber = tickets
            .filter { $0.org == org }
            .compactMap { Int($0.id.split(separator: "-").last ?? "") }
            .max()
            .map { $0 + 1 } ?? 1
        let me = TaskItem.sampleUsers[0]  // current user later
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        let ticket = TicketItem(
            id: "\(org.key)-\(nextNumber)",
            subject: subject.trimmingCharacters(in: .whitespaces),
            status: .open,
            priority: priority,
            category: category,
            channel: .webForm,
            org: org,
            assignees: Array(assignees),
            messages: text.isEmpty ? [] : [TicketMessage(user: me, date: .now, text: text)],
            createdAt: .now
        )
        onCreate(ticket)
        dismiss()
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        CreateTicketSheet(tickets: TicketItem.samples) { _ in }
    }
}
