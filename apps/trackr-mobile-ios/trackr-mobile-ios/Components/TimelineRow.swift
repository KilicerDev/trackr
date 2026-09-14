//
//  TimelineRow.swift
//  trackr-mobile-ios
//
//  Web parity (Inspector activity timeline): an event on the vertical
//  rail — avatar node for authored events, icon node for system events,
//  header line "Name action · date", optional content below.
//
//  Reusable for task comments, ticket messages, and chat.
//

import SwiftUI

struct TimelineRow<Content: View>: View {
    enum Node {
        case avatar(UserRef)
        case icon(String)
    }

    let node: Node
    let name: String
    let action: String
    let date: Date
    @ViewBuilder var content: Content

    /// Width of the node column — the rail line should run at half this.
    static var nodeSize: CGFloat { 24 }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            nodeView
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 5) {
                    Text(name)
                        .font(.system(size: 14, weight: .medium))
                    Text(action)
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                    Text("· \(date.formatted(.dateTime.day().month(.abbreviated)))")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.tertiary)
                }
                .padding(.top, 3)
                .lineLimit(1)
                content
            }
        }
    }

    @ViewBuilder
    private var nodeView: some View {
        switch node {
        case .avatar(let user):
            AvatarView(user: user, size: Self.nodeSize)
                .overlay(
                    Circle().strokeBorder(Color.webBackground, lineWidth: 2)
                )
        case .icon(let systemImage):
            Image(systemName: systemImage)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .frame(width: Self.nodeSize, height: Self.nodeSize)
                .background(Color(.secondarySystemGroupedBackground), in: .circle)
                .overlay(Circle().strokeBorder(Color(.separator).opacity(0.5), lineWidth: 0.5))
        }
    }
}

extension TimelineRow where Content == EmptyView {
    init(node: Node, name: String, action: String, date: Date) {
        self.init(node: node, name: name, action: action, date: date) { EmptyView() }
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 18) {
        TimelineRow(
            node: .avatar(TaskItem.sampleUsers[0]),
            name: "Max Muster", action: "commented", date: .now
        ) {
            MessageCard(text: "Looks good to me!")
        }
        TimelineRow(
            node: .icon("clock"),
            name: "Mara Steiner", action: "logged 2h 30m", date: .now
        )
    }
    .padding()
    .background(Color.webBackground)
}
