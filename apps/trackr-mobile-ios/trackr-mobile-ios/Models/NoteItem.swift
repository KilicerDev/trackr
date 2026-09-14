//
//  NoteItem.swift
//  trackr-mobile-ios
//
//  Web parity: note / wiki_page rows served by /api/v1 — the mobile app
//  reads the derived body_html read model (editing is desktop-only for
//  now; quick capture posts plain text).
//

import SwiftUI

enum NoteKind: String {
    case quick, meeting
}

struct NoteItem: Identifiable, Hashable {
    let id: String
    var kind: NoteKind
    var title: String
    var icon: String  // SF Symbol; server icon names get mapped on wiring
    var pinned = false
    var sharedBy: UserRef?  // set on quick notes shared with me
    var bodyHtml = ""
    var owner: UserRef?
    var updatedAt = Date.now
    // Meeting-only (nil for quick notes).
    var meetingDate: Date?
    var project: String?
    var taskId: String?
}

struct WikiPageItem: Identifiable, Hashable {
    let id: String
    var parentId: String?
    var title: String
    var icon: String
    var isFolder = false
    var bodyHtml = ""
    var updatedAt = Date.now
    var updatedBy: UserRef?
    var sortOrder = 0
}

/// Web parity: note_template — HTML skeletons seeding new meeting notes.
struct MeetingTemplate: Identifiable, Hashable {
    let id: String
    var name: String
    var icon: String
    var bodyHtml: String

    static let all: [MeetingTemplate] = [
        MeetingTemplate(id: "blank", name: "Blank", icon: "doc", bodyHtml: ""),
        MeetingTemplate(
            id: "standup", name: "Standup", icon: "figure.stand",
            bodyHtml: #"<h2>Yesterday</h2><p></p><h2>Today</h2><p></p><h2>Blockers</h2><p></p>"#
        ),
        MeetingTemplate(
            id: "client", name: "Client Meeting", icon: "person.2",
            bodyHtml: #"<h2>Agenda</h2><ul><li><p></p></li></ul><h2>Notes</h2><p></p><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>"#
        ),
        MeetingTemplate(
            id: "retro", name: "Retro", icon: "arrow.uturn.backward",
            bodyHtml: #"<h2>Went well</h2><ul><li><p></p></li></ul><h2>Could be better</h2><ul><li><p></p></li></ul><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p></p></div></li></ul>"#
        ),
    ]
}

// MARK: - Sample data (UI design phase only — replaced by /api/v1 later)

extension NoteItem {
    static let samples: [NoteItem] = {
        let cal = Calendar.current
        let users = TaskItem.sampleUsers
        func ago(hours: Int) -> Date {
            cal.date(byAdding: .hour, value: -hours, to: .now)!
        }
        func day(_ offset: Int, hour: Int) -> Date {
            let base = cal.date(byAdding: .day, value: offset, to: .now)!
            return cal.date(bySettingHour: hour, minute: 0, second: 0, of: base)!
        }
        return [
            // ── Quick notes ────────────────────────────────────────────
            NoteItem(id: "n-access", kind: .quick, title: "Server room access",
                     icon: "key.fill", pinned: true,
                     bodyHtml: #"<p>Codes rotate on the <strong>1st of each month</strong> — check the vault first.</p><ul><li><p>Building A: vault entry <em>infra/access-a</em></p></li><li><p>Building C: physical key at reception</p></li></ul><blockquote><p>Never share codes in chat — vault links only.</p></blockquote>"#,
                     owner: users[0], updatedAt: ago(hours: 5)),
            NoteItem(id: "n-ideas", kind: .quick, title: "Ideas for trackr mobile",
                     icon: "lightbulb",
                     bodyHtml: #"<p>Things to explore after the design phase:</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox"></label><div><p>Work sessions as the killer feature</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Widget with today&#39;s planned tasks</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Push notifications for ticket replies</p></div></li></ul>"#,
                     owner: users[0], updatedAt: ago(hours: 26)),
            NoteItem(id: "n-snippets", kind: .quick, title: "Postgres maintenance snippets",
                     icon: "terminal",
                     bodyHtml: #"""
<p>Quick checks before any maintenance window:</p><pre><code>SELECT pid, state, query_start
FROM pg_stat_activity
WHERE state != 'idle';</code></pre><p>Kill long-running queries only after checking with <strong>#infra</strong>.</p>
"""#,
                     owner: users[0], updatedAt: ago(hours: 80)),
            NoteItem(id: "n-offsite", kind: .quick, title: "Offsite planning",
                     icon: "airplane", sharedBy: users[1],
                     bodyHtml: #"<h2>Options</h2><ol><li><p>Hamburg — office + harbor tour</p></li><li><p>Black Forest — cabin, offline day</p></li></ol><p>Budget cap is <strong>450€</strong> per person, travel included.</p>"#,
                     owner: users[1], updatedAt: ago(hours: 50)),

            // ── Meeting notes ──────────────────────────────────────────
            NoteItem(id: "m-infra-sync", kind: .meeting, title: "Weekly Infra Sync",
                     icon: "person.2",
                     bodyHtml: #"<h2>Agenda</h2><ul><li><p>Mail ingestion cutover status</p></li><li><p>Postgres 17 upgrade window</p></li></ul><h2>Notes</h2><p>IMAP poll worker is stable on staging — <strong>no dropped messages</strong> in 7 days. Cutover plan needs a rollback path before we schedule it.</p><blockquote><p>Decision: upgrade staging Postgres this Friday, production the week after.</p></blockquote><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox"></label><div><p>Write rollback plan for the cutover</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Announce staging maintenance window</p></div></li></ul>"#,
                     owner: users[1], updatedAt: ago(hours: 3),
                     meetingDate: day(0, hour: 10),
                     project: "Infrastructure", taskId: "TRK-118"),
            NoteItem(id: "m-design-review", kind: .meeting, title: "Mobile app design review",
                     icon: "iphone",
                     bodyHtml: #"<h2>Notes</h2><p>Walked through Home, Plan and Tickets on device. Cards read well; the sticky day headers fixed the my-week separation issue.</p><ul><li><p>Quick links land — keep the Apple Music look</p></li><li><p>Ticket SLA labels need shorter copy on small screens</p></li></ul><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Notes, meetings and wiki screens next</p></div></li></ul>"#,
                     owner: users[0], updatedAt: ago(hours: 22),
                     meetingDate: day(-1, hour: 14),
                     project: "Mobile App", taskId: "TRK-142"),
            NoteItem(id: "m-siweb", kind: .meeting, title: "Siweb quarterly check-in",
                     icon: "cart",
                     bodyHtml: #"<h2>Agenda</h2><ul><li><p>Shop checkout incidents</p></li><li><p>Relaunch kickoff</p></li></ul><h2>Notes</h2><p>Two checkout outages this quarter, both on the payment-gateway side. Renée wants a <em>monthly status mail</em> going forward.</p>"#,
                     owner: users[2], updatedAt: ago(hours: 70),
                     meetingDate: day(-3, hour: 9),
                     project: "Siweb Shop Relaunch", taskId: nil),
            NoteItem(id: "m-q3", kind: .meeting, title: "Q3 planning",
                     icon: "calendar",
                     bodyHtml: #"<h2>Focus</h2><ol><li><p>Native mobile app to TestFlight</p></li><li><p>Mail ingestion cutover</p></li><li><p>Siweb shop relaunch build</p></li></ol><hr><p>Budget review moved to the next finance sync.</p>"#,
                     owner: users[0], updatedAt: ago(hours: 200),
                     meetingDate: day(-8, hour: 11),
                     project: "Trackr Web", taskId: nil),
        ]
    }()
}

extension WikiPageItem {
    static let samples: [WikiPageItem] = {
        let cal = Calendar.current
        let users = TaskItem.sampleUsers
        func ago(hours: Int) -> Date {
            cal.date(byAdding: .hour, value: -hours, to: .now)!
        }
        return [
            WikiPageItem(id: "w-handbook", parentId: nil, title: "Team Handbook",
                         icon: "book.closed",
                         bodyHtml: #"<h1>Team Handbook</h1><p>How we work at <strong>the agency</strong> — short, honest, always current.</p><h2>Principles</h2><ul><li><p>Tickets before chat — if it matters, it has a number</p></li><li><p>Every change has a rollback path</p></li><li><p>Client-facing replies within <strong>4 hours</strong> on business days</p></li></ul><h2>Tools</h2><p>Trackr for everything: <a href="https://trackr.example/tasks">tasks</a>, tickets, notes and this wiki.</p>"#,
                         updatedAt: ago(hours: 30), updatedBy: users[0], sortOrder: 0),
            WikiPageItem(id: "w-onboarding", parentId: nil, title: "Onboarding Checklist",
                         icon: "checklist",
                         bodyHtml: #"<h1>Onboarding Checklist</h1><p>Everything a new teammate needs in week one.</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox"></label><div><p>AD account + vault access</p></div></li><li data-type="taskItem" data-checked="true"><label><input type="checkbox"></label><div><p>Notebook setup from the base image</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Shadow one on-site client visit</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Read the runbooks folder</p></div></li></ul>"#,
                         updatedAt: ago(hours: 100), updatedBy: users[1], sortOrder: 1),
            WikiPageItem(id: "w-runbooks", parentId: nil, title: "Runbooks",
                         icon: "folder", isFolder: true, sortOrder: 2),
            WikiPageItem(id: "w-postgres", parentId: "w-runbooks", title: "Postgres 17 Upgrade",
                         icon: "cylinder.split.1x2",
                         bodyHtml: #"""
<h1>Postgres 17 Upgrade</h1><p>Runbook for staging first, then production. <strong>Always snapshot first.</strong></p><h2>Steps</h2><ol><li><p>Create VM snapshot</p></li><li><p>Run the <code>pg_upgrade</code> check</p></li><li><p>Upgrade the cluster</p></li><li><p>Verify app connectivity, then switch traffic</p></li></ol><pre><code>sudo systemctl stop postgresql
pg_upgradecluster 15 main
sudo systemctl start postgresql</code></pre><hr><p>Questions go to <strong>#infra</strong> — never upgrade alone on a Friday.</p>
"""#,
                         updatedAt: ago(hours: 12), updatedBy: users[1], sortOrder: 0),
            WikiPageItem(id: "w-mail", parentId: "w-runbooks", title: "Mail Ingestion Setup",
                         icon: "envelope",
                         bodyHtml: #"<h1>Mail Ingestion Setup</h1><p>Our own mail stack replacing the external provider — IMAP-poll based ingestion into trackr tickets.</p><h2>Architecture</h2><ul><li><p>One mailbox per environment</p></li><li><p>Poll worker checks <code>INBOX</code> every 30s</p></li><li><p>Messages become ticket replies via the threading headers</p></li></ul><blockquote><p>The poll worker must be idempotent — messages may be seen twice.</p></blockquote>"#,
                         updatedAt: ago(hours: 45), updatedBy: users[1], sortOrder: 1),
            WikiPageItem(id: "w-clients", parentId: nil, title: "Clients",
                         icon: "folder", isFolder: true, sortOrder: 3),
            WikiPageItem(id: "w-siweb", parentId: "w-clients", title: "Siweb — Shop Platform",
                         icon: "cart",
                         bodyHtml: #"<h1>Siweb — Shop Platform</h1><p>Vendor-hosted shop system, we own the infrastructure around it.</p><h2>Known issues</h2><ul><li><p>Checkout freezes when the payment gateway pushes updates mid-day — <em>always reproduce before escalating</em></p></li><li><p>Editor sessions leak on hard cache resets</p></li></ul><h2>Contacts</h2><p>Escalation: gateway hotline, then <strong>Renée Carter</strong> for scheduling downtime.</p>"#,
                         updatedAt: ago(hours: 60), updatedBy: users[2], sortOrder: 0),
            WikiPageItem(id: "w-webim", parentId: "w-clients", title: "webim — Landing Page Hosting",
                         icon: "network",
                         bodyHtml: #"""
<h1>webim — Landing Page Hosting</h1><p>Campaign landing pages for ~20 parallel campaigns, static hosting behind a CDN.</p><h2>Config</h2><pre><code>cache-control: max-age=300
stale-while-revalidate: 600
form-timeout: 60</code></pre><p>The <strong>form timeout fix</strong> from ticket WEBIM-31 lives in the base config since August.</p>
"""#,
                         updatedAt: ago(hours: 8), updatedBy: users[1], sortOrder: 1),
        ]
    }()
}
