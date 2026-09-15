//
//  MeetingsView.swift
//  trackr-mobile-ios
//
//  Meeting notes root, bucketed by day newest first: day bands
//  (TKGroupBand with the mono date on the right, today in accent) and
//  flat rows — mono time · title · project / task · attendees. Owns the
//  meetings navigation stack.
//

import SwiftUI

struct MeetingsView: View {
    @Bindable var model: AppModel
    @State private var showingCreate = false
    @State private var openedFirst = false

    private struct DayGroup: Identifiable {
        let day: Date
        let items: [NoteItem]
        var id: Date { day }
    }

    private var meetings: [NoteItem] { model.notes.filter { $0.kind == .meeting } }

    private var dayGroups: [DayGroup] {
        let grouped = Dictionary(grouping: meetings) { note in
            (note.meetingDate ?? note.updatedAt).startOfDay
        }
        return grouped.keys.sorted(by: >).map { day in
            let items = (grouped[day] ?? [])
                .sorted { ($0.meetingDate ?? $0.updatedAt) > ($1.meetingDate ?? $1.updatedAt) }
            return DayGroup(day: day, items: items)
        }
    }

    private func dayLabel(_ day: Date) -> String {
        if Calendar.current.isDateInToday(day) { return "Today" }
        if Calendar.current.isDateInYesterday(day) { return "Yesterday" }
        return day.formatted(.dateTime.weekday(.wide))
    }

    var body: some View {
        NavigationStack(path: $model.meetingsPath) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    TKPageHeader("Meetings") {
                        HStack(spacing: 10) {
                            Text("\(meetings.count) meetings")
                                .font(.tkMono(12))
                                .foregroundStyle(TK.text3)
                            TKPlusButton(label: "New meeting") { showingCreate = true }
                        }
                    }
                    .padding(.bottom, 8)
                    if dayGroups.isEmpty {
                        TKEmptyState(text: "No meetings yet.\nCreate a meeting note with +.")
                    }
                    ForEach(dayGroups) { group in
                        let today = Calendar.current.isDateInToday(group.day)
                        TKGroupBand(
                            title: dayLabel(group.day),
                            count: group.items.count,
                            titleColor: today ? TK.accent : TK.text,
                            trailing: group.day.formatted(.dateTime.day().month(.abbreviated))
                        )
                        ForEach(group.items) { meeting in
                            NavigationLink(value: meeting) {
                                MeetingRow(
                                    meeting: meeting,
                                    projectColor: model.projects.first { $0.name == meeting.project }?.color
                                )
                            }
                            .buttonStyle(TKPressStyle())
                        }
                    }
                }
                .padding(.bottom, 24)
            }
            .tkRootScreen(model)
            .refreshable { await model.sync?.refreshNotes() }
            .navigationDestination(for: NoteItem.self) { note in
                NoteDetailView(model: model, note: note)
            }
            .sheet(isPresented: $showingCreate) {
                NewMeetingSheet(model: model)
            }
            .onAppear(perform: openFirstIfAsked)
        }
    }

    /// `--open-first` launch argument (simulator screenshots).
    private func openFirstIfAsked() {
        let args = ProcessInfo.processInfo.arguments
        if args.contains("--sheet") { showingCreate = true }
        guard !openedFirst, args.contains("--open-first"),
              model.meetingsPath.isEmpty, let meeting = dayGroups.first?.items.first else { return }
        openedFirst = true
        // Deferred: a path push during the first onAppear can be dropped.
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(600))
            model.meetingsPath.append(meeting)
        }
    }
}

// MARK: - Row

private struct MeetingRow: View {
    let meeting: NoteItem
    var projectColor: Color?

    private var attendees: [UserRef] {
        [meeting.owner, meeting.sharedBy].compactMap { $0 }
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(meeting.meetingDate?.formatted(.dateTime.hour().minute()) ?? "—")
                .font(.tkMono(12))
                .foregroundStyle(TK.text3)
                .frame(width: 44, alignment: .leading)
            VStack(alignment: .leading, spacing: 3) {
                Text(meeting.title)
                    .font(.system(size: 15))
                    .foregroundStyle(TK.text)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let project = meeting.project {
                        TKDot(color: projectColor ?? Color(hex: 0x7C7C84), size: 6)
                        Text(project)
                            .font(.system(size: 11))
                            .foregroundStyle(TK.text3)
                            .lineLimit(1)
                    }
                    if let taskId = meeting.taskId {
                        Text("· \(taskId)")
                            .font(.tkMono(11))
                            .foregroundStyle(TK.text3)
                    }
                }
            }
            Spacer(minLength: 8)
            if !attendees.isEmpty {
                AvatarStack(users: attendees, size: 24)
            }
            TKDisclosure()
        }
        .padding(.horizontal, TK.gutter)
        .padding(.vertical, 12)
        .frame(minHeight: 56)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { TKHairline() }
        .contentShape(.rect)
    }
}

#Preview {
    MeetingsView(model: AppModel())
        .preferredColorScheme(.dark)
}
