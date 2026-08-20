//
//  TaskCommentsView.swift
//  trackr-mobile-ios
//
//  Activity timeline for a task: comments and time logs on a vertical
//  rail, newest at the bottom, composer pinned below — web Inspector
//  activity, adapted to a full screen.
//

import SwiftUI

struct TaskCommentsView: View {
    @Binding var task: TaskItem
    var model: AppModel? = nil
    @State private var draft = ""

    private enum Event: Identifiable {
        case comment(TaskComment)
        case time(TimeLog)
        case activity(ActivityEvent)

        var id: String {
            switch self {
            case .comment(let c): c.id
            case .time(let t): t.id
            case .activity(let a): a.id.uuidString
            }
        }

        var date: Date {
            switch self {
            case .comment(let c): c.date
            case .time(let t): t.date
            case .activity(let a): a.date
            }
        }
    }

    private var events: [Event] {
        (task.comments.map(Event.comment)
            + task.timeLogs.map(Event.time)
            + task.activity.map(Event.activity))
            .sorted { $0.date < $1.date }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    ForEach(events) { event in
                        row(for: event).id(event.id)
                    }
                }
                // The rail: a hairline behind the node column.
                .background(alignment: .leading) {
                    Rectangle()
                        .fill(Color(.separator).opacity(0.5))
                        .frame(width: 1)
                        .offset(x: TimelineRow<EmptyView>.nodeSize / 2)
                        .padding(.vertical, 10)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: task.comments.count) {
                if let last = events.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Comments")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            MessageComposer(text: $draft, onAttach: {
                // Attachments — wired up later
            }, onSend: send)
        }
    }

    @ViewBuilder
    private func row(for event: Event) -> some View {
        switch event {
        case .comment(let comment):
            TimelineRow(
                node: .avatar(comment.user),
                name: comment.user.name,
                action: "commented",
                date: comment.date
            ) {
                MessageCard(text: comment.text)
            }
        case .time(let log):
            TimelineRow(
                node: .icon("clock"),
                name: log.user.name,
                action: "logged \(log.minutes.minutesFormatted)",
                date: log.date
            ) {
                if let note = log.note {
                    Text(note)
                        .font(.system(size: 14))
                        .italic()
                        .foregroundStyle(.secondary)
                }
            }
        case .activity(let event):
            TimelineRow(
                node: .icon(event.icon),
                name: event.user.name,
                action: event.text,
                date: event.date
            )
        }
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        task.comments.append(
            TaskComment(user: model?.me ?? TaskItem.sampleUsers[0], date: .now, text: text)
        )
        draft = ""
        if let uuid = task.uuid {
            model?.sync?.sendTaskComment(taskUUID: uuid, text: text)
        }
    }
}

#Preview {
    @Previewable @State var task = TaskItem.samples[0]
    NavigationStack {
        TaskCommentsView(task: $task)
    }
}
