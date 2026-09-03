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
        Release(version: "1.0.5", name: "Sort & Saved Views", date: "September 2026", features: [
            Feature(icon: "arrow.up.arrow.down", title: "Sort Tasks and Tickets",
                    detail: "The filter sheet has a Sort by row — tasks by due date, priority, last updated, created or title; tickets by priority, last activity, created or subject. Tap the arrow to flip the direction."),
            Feature(icon: "arrow.triangle.2.circlepath", title: "Update a Saved View",
                    detail: "Changed your filters? Long-press a saved view or swipe it from the left to overwrite it with the current settings instead of saving a new one."),
            Feature(icon: "icloud.and.arrow.up.fill", title: "Sort Syncs with the Web",
                    detail: "Your sort order travels with the rest of the view state, so the list looks the same on the phone and in the browser."),
            Feature(icon: "bolt.fill", title: "Faster, Steadier Launch",
                    detail: "The app opens straight from its local cache and checks your session in the background — no more hanging on a spinner when the first connection is slow."),
            Feature(icon: "sparkles", title: "New Launch Screen",
                    detail: "The stock spinner is gone; the trackr mark now greets you while things load."),
        ]),
        Release(version: "1.0.4", name: "Reliability", date: "September 2026", features: [
            Feature(icon: "exclamationmark.triangle.fill", title: "Create Failures Are Visible",
                    detail: "When a new ticket or task can't reach the server, the app logs why instead of failing silently — no more phantom items that vanish on the next refresh."),
            Feature(icon: "server.rack", title: "Server Boot Fix",
                    detail: "A server-side start-up bug that could keep a fresh deployment restarting has been fixed. Update your Trackr server alongside this build."),
        ]),
        Release(version: "1.0.3", name: "Images on Create", date: "September 2026", features: [
            Feature(icon: "paperclip.badge.ellipsis", title: "Attach While Creating a Ticket",
                    detail: "The new-ticket sheet has an Attachments section — add screenshots from your library or files from the Files app before you tap Create."),
            Feature(icon: "arrow.up.doc.fill", title: "One Upload, Not Many",
                    detail: "Files now travel in the same request as the ticket, task, reply or comment they belong to, so they're there the moment the item exists."),
            Feature(icon: "link", title: "Image URLs in Webhooks",
                    detail: "Outgoing webhooks for new tickets, tasks and messages list the attached files with their URLs, ready for automations like n8n."),
            Feature(icon: "slider.horizontal.3", title: "Priority & Category on Create",
                    detail: "Priority, category and assignees you pick in the new-ticket sheet are saved with the ticket itself instead of in a second step."),
        ]),
        Release(version: "1.0.2", name: "Attachments", date: "September 2026", features: [
            Feature(icon: "paperclip", title: "Files on Tasks & Tickets",
                    detail: "Attach photos and documents from the paperclip — from your library, the Files app or straight from the camera — and see everything that's already attached."),
            Feature(icon: "photo.on.rectangle.angled", title: "Attachments in Conversations",
                    detail: "Send images and files with ticket replies, task comments and chat messages. Photos show up in the bubble immediately while they upload."),
            Feature(icon: "eye.fill", title: "Preview & Share",
                    detail: "Tap any attachment to open it in Quick Look — PDFs, images, spreadsheets, archives — or share it to another app."),
            Feature(icon: "doc.richtext.fill", title: "Notes & Wiki Media",
                    detail: "Images embedded in notes and wiki pages now render, and attached files appear as tappable chips."),
            Feature(icon: "arrow.triangle.2.circlepath", title: "Ticket → Task",
                    detail: "Convert a ticket into a linked project task; checklist and attachments carry over, and both sides link back to each other."),
            Feature(icon: "magnifyingglass", title: "Project Picker with Search",
                    detail: "Choosing a project when creating a task is a searchable list with favorites and recents — built for long project lists."),
        ]),
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
