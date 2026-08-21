//
//  MeetingsView.swift
//  trackr-mobile-ios
//
//  Meeting notes bucketed by day, newest first — the web NotesSidebar's
//  Apple-Calendar-style Meetings tab. Pushed from the Home quick links.
//

import SwiftUI

struct MeetingsView: View {
    @Bindable var model: AppModel
    @State private var showingCreate = false

    private var dayGroups: [(label: String, items: [NoteItem])] {
        let meetings = model.notes.filter { $0.kind == .meeting }
        let grouped = Dictionary(grouping: meetings) { note in
            (note.meetingDate ?? note.updatedAt).startOfDay
        }
        return grouped.keys.sorted(by: >).map { day in
            let items = (grouped[day] ?? [])
                .sorted { ($0.meetingDate ?? $0.updatedAt) > ($1.meetingDate ?? $1.updatedAt) }
            return (dayLabel(day), items)
        }
    }

    private func dayLabel(_ day: Date) -> String {
        if Calendar.current.isDateInToday(day) { return "Today" }
        if Calendar.current.isDateInYesterday(day) { return "Yesterday" }
        return day.formatted(.dateTime.weekday(.wide).day().month(.abbreviated))
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                ForEach(dayGroups, id: \.label) { group in
                    Text(group.label.uppercased())
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(0.6)
                        .foregroundStyle(.secondary)
                        .padding(.top, 14)
                        .padding(.leading, 4)
                    ForEach(group.items) { meeting in
                        NavigationLink(value: meeting) {
                            NoteCard(
                                icon: meeting.icon,
                                title: meeting.title,
                                subtitle: meeting.project ?? "",
                                trailing: meeting.meetingDate?
                                    .formatted(.dateTime.hour().minute())
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                if dayGroups.isEmpty {
                    ContentUnavailableView(
                        "No meetings yet",
                        systemImage: "person.2",
                        description: Text("Create a meeting note with the plus button.")
                    )
                    .padding(.top, 60)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Color.webBackground)
        .navigationTitle("Meetings")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingCreate = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingCreate) {
            NewMeetingSheet(model: model)
        }
    }
}

#Preview {
    NavigationStack {
        MeetingsView(model: AppModel())
    }
}
