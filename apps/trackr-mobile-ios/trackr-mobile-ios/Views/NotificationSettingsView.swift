//
//  NotificationSettingsView.swift
//  trackr-mobile-ios
//
//  Push notification preferences per feature area. Design phase —
//  toggles are local state until the push/API pass.
//

import SwiftUI

struct NotificationSettingsView: View {
    @State private var pushEnabled = true

    @State private var taskAssigned = true
    @State private var taskComments = true
    @State private var taskStatus = false
    @State private var taskDue = true

    @State private var ticketNew = true
    @State private var ticketReplies = true
    @State private var ticketSla = true

    @State private var meetingReminders = true
    @State private var meetingLead = 10

    var body: some View {
        Form {
            Section {
                Toggle("Push Notifications", isOn: $pushEnabled.animation())
            } footer: {
                Text("Master switch — turning this off silences everything below.")
            }

            Section("Tasks") {
                Toggle("Assigned to me", isOn: $taskAssigned)
                Toggle("Comments & mentions", isOn: $taskComments)
                Toggle("Status changes", isOn: $taskStatus)
                Toggle("Due reminders", isOn: $taskDue)
            }
            .disabled(!pushEnabled)

            Section("Tickets") {
                Toggle("New tickets", isOn: $ticketNew)
                Toggle("Customer replies", isOn: $ticketReplies)
                Toggle("SLA warnings", isOn: $ticketSla)
            }
            .disabled(!pushEnabled)

            Section("Meetings") {
                Toggle("Meeting reminders", isOn: $meetingReminders)
                if meetingReminders {
                    Picker("Remind me", selection: $meetingLead) {
                        Text("5 minutes before").tag(5)
                        Text("10 minutes before").tag(10)
                        Text("30 minutes before").tag(30)
                        Text("1 hour before").tag(60)
                    }
                }
            }
            .disabled(!pushEnabled)
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        NotificationSettingsView()
    }
}
