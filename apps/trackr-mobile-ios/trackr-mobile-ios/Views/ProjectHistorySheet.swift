//
//  ProjectHistorySheet.swift
//  trackr-mobile-ios
//
//  Web parity (projects/ProjectHistory.svelte): the project activity feed
//  as a bottom sheet — comments and typed events on the timeline rail,
//  comment composer below.
//

import SwiftUI

struct ProjectHistorySheet: View {
    @Bindable var model: AppModel
    let projectKey: String

    @State private var draft = ""

    private var events: [ProjectEvent] {
        (model.projects.first { $0.key == projectKey }?.history ?? [])
            .sorted { $0.date < $1.date }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if events.isEmpty {
                        Text("No activity yet.")
                            .font(.system(size: 14))
                            .foregroundStyle(.tertiary)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.top, 40)
                    }
                    ForEach(events) { event in
                        if event.isComment {
                            TimelineRow(
                                node: .avatar(event.user),
                                name: event.user.name,
                                action: "commented",
                                date: event.date
                            ) {
                                MessageCard(text: event.text)
                            }
                        } else {
                            TimelineRow(
                                node: .icon(event.icon ?? "circle"),
                                name: event.user.name,
                                action: event.text,
                                date: event.date
                            )
                        }
                    }
                }
                .background(alignment: .leading) {
                    Rectangle()
                        .fill(Color(.separator).opacity(0.5))
                        .frame(width: 1)
                        .offset(x: TimelineRow<EmptyView>.nodeSize / 2)
                        .padding(.vertical, 10)
                }
                .padding(16)
            }
            .defaultScrollAnchor(events.isEmpty ? .top : .bottom)
            .scrollDismissesKeyboard(.interactively)
            .background(Color(.systemGroupedBackground))
            .navigationTitle("History")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) {
                MessageComposer(text: $draft, placeholder: "Write a comment…", onSend: send)
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        model.addProjectComment(projectKey: projectKey, text: text)
        draft = ""
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        ProjectHistorySheet(model: AppModel(), projectKey: "TRK")
    }
}
