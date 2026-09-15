//
//  TimelineRow.swift
//  trackr-mobile-ios
//
//  Prototype activity row: 26pt avatar node (or an icon tile for system
//  events), then "**Name** action · mono date" on one 13pt line; the
//  optional content (a MessageCard) hangs below, indented past the node.
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
    /// Extra tinted word after the action ("internal note" in amber).
    var tag: (text: String, color: Color)? = nil
    @ViewBuilder var content: Content

    /// Width of the node column — content indents by this + spacing.
    static var nodeSize: CGFloat { 26 }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 10) {
                nodeView
                header
                    .lineLimit(2)
            }
            content
                .padding(.leading, Self.nodeSize + 10)
        }
    }

    private var header: some View {
        var line = Text(name).font(.system(size: 13, weight: .semibold)).foregroundColor(TK.text)
        line = line + Text(" \(action)").font(.system(size: 13)).foregroundColor(TK.mono(0.65))
        if let tag {
            line = line + Text(" \(tag.text)").font(.system(size: 13)).foregroundColor(tag.color)
        }
        line = line + Text(" · ").font(.system(size: 13)).foregroundColor(TK.mono(0.65))
        line = line + Text(date.formatted(.dateTime.day().month(.abbreviated)))
            .font(.tkMono(11)).foregroundColor(TK.text3)
        return line
    }

    @ViewBuilder
    private var nodeView: some View {
        switch node {
        case .avatar(let user):
            AvatarView(user: user, size: Self.nodeSize)
        case .icon(let systemImage):
            Image(systemName: systemImage)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(TK.text2)
                .frame(width: Self.nodeSize, height: Self.nodeSize)
                .background(TK.elevated2, in: .circle)
        }
    }
}

extension TimelineRow where Content == EmptyView {
    init(node: Node, name: String, action: String, date: Date,
         tag: (text: String, color: Color)? = nil) {
        self.init(node: node, name: name, action: action, date: date, tag: tag) { EmptyView() }
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 14) {
        TimelineRow(
            node: .avatar(TaskItem.sampleUsers[0]),
            name: "Max Muster", action: "replied", date: .now
        ) {
            MessageCard(text: "Looks good to me!")
        }
        TimelineRow(
            node: .avatar(TaskItem.sampleUsers[1]),
            name: "Mara Steiner", action: "added an", date: .now,
            tag: ("internal note", TK.amber)
        ) {
            MessageCard(text: "Linked to task SIWEB-78.", accent: TK.amber)
        }
        TimelineRow(
            node: .icon("clock"),
            name: "Mara Steiner", action: "logged 2h 30m", date: .now
        )
    }
    .padding()
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
