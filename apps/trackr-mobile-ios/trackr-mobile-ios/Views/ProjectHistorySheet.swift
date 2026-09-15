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
    @State private var loaded = false

    private var events: [ProjectEvent] {
        (model.projects.first { $0.key == projectKey }?.history ?? [])
            .sorted { $0.date < $1.date }
    }

    var body: some View {
        VStack(spacing: 0) {
            TKSheetHeader(title: "History")
                .padding(.bottom, 8)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if events.isEmpty, !loaded {
                        ProgressView()
                            .tint(TK.text3)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 40)
                    } else if events.isEmpty {
                        TKEmptyState(text: "No activity yet.", padding: 40)
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
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(alignment: .leading) {
                    if !events.isEmpty {
                        Rectangle()
                            .fill(TK.border)
                            .frame(width: 1)
                            .offset(x: TimelineRow<EmptyView>.nodeSize / 2)
                            .padding(.vertical, 10)
                    }
                }
                .padding(.horizontal, TK.gutter)
                .padding(.vertical, 12)
            }
            .defaultScrollAnchor(events.isEmpty ? .top : .bottom)
            .scrollDismissesKeyboard(.interactively)
            .task {
                await model.sync?.loadProjectHistory(projectKey: projectKey)
                loaded = true
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                MessageComposer(text: $draft, placeholder: "Write a comment…", onSend: send)
                    .overlay(alignment: .top) { TKHairline(color: TK.border) }
            }
        }
        .tkSheet(detents: [.medium, .large])
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
    .preferredColorScheme(.dark)
}
