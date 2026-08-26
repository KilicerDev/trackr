//
//  WhatsNewView.swift
//  trackr-mobile-ios
//
//  Release notes, App-Store style: one card per release with feature
//  bullets. Content is maintained by hand per release.
//

import SwiftUI

struct WhatsNewView: View {
    private struct Feature: Identifiable {
        let id = UUID()
        var icon: String
        var title: String
        var detail: String
    }

    private struct Release: Identifiable {
        var version: String
        var name: String
        var date: String
        var features: [Feature]
        var id: String { version }
    }

    private let releases: [Release] = [
        Release(version: "1.0.1", name: "Projects Polish", date: "August 2026", features: [
            Feature(icon: "plus.circle.fill", title: "New Task from a Project",
                    detail: "Create tasks straight from a project's page — the project is preselected, and the empty state offers it too."),
            Feature(icon: "star.fill", title: "Swipe on Projects",
                    detail: "Swipe a project card to favorite it or open its history. Favorites show a star on the card."),
            Feature(icon: "clock.arrow.circlepath", title: "Live Project History",
                    detail: "The history sheet now shows the real activity feed from your server, and comments you write are posted to it."),
            Feature(icon: "hand.tap.fill", title: "Tap Anywhere on a Card",
                    detail: "Ticket and task cards open from any point, not only from their text — and empty conversations no longer draw a stray timeline bar."),
            Feature(icon: "person.badge.key.fill", title: "Sign-in Refresh",
                    detail: "A tidier sign-in screen with the button where your thumb is."),
        ]),
        Release(version: "1.0", name: "Design Preview", date: "August 2026", features: [
            Feature(icon: "play.circle.fill", title: "Work Sessions",
                    detail: "Start a session from a favorite project — the timer lives in the tab bar like a now-playing bar and becomes a logged task when you're done."),
            Feature(icon: "calendar", title: "Plan Your Week",
                    detail: "The my-week planner from the web, native: day capacities, project grouping and the unscheduled backlog."),
            Feature(icon: "ticket.fill", title: "Tickets",
                    detail: "The full support queue with SLA signals, internal notes and the activity timeline."),
            Feature(icon: "doc.text.fill", title: "Notes, Meetings & Wiki",
                    detail: "Quick capture on the go, meeting notes linked to projects, and the whole wiki rendered natively."),
            Feature(icon: "person.crop.circle.fill", title: "Your Account",
                    detail: "This sheet — settings, user management and logs, all in one place."),
        ]),
        Release(version: "0.9", name: "Foundations", date: "August 2026", features: [
            Feature(icon: "checklist", title: "Tasks",
                    detail: "Cards, filters, saved views and a detail page with editable chips."),
            Feature(icon: "square.grid.2x2.fill", title: "Projects",
                    detail: "Favorite projects on Home with gradient cards and project history."),
        ]),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                ForEach(releases) { release in
                    VStack(alignment: .leading, spacing: 16) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(release.name)
                                .font(.system(size: 19, weight: .bold))
                            Spacer()
                            Text("\(release.version) · \(release.date)")
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundStyle(.tertiary)
                        }
                        ForEach(release.features) { feature in
                            HStack(alignment: .top, spacing: 13) {
                                Image(systemName: feature.icon)
                                    .font(.system(size: 20))
                                    .foregroundStyle(Color.accentColor)
                                    .frame(width: 30)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(feature.title)
                                        .font(.system(size: 15, weight: .semibold))
                                    Text(feature.detail)
                                        .font(.system(size: 14))
                                        .lineSpacing(2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .padding(16)
                    .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 20))
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
        .background(Color.webBackground)
        .navigationTitle("What's New")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        WhatsNewView()
    }
}
