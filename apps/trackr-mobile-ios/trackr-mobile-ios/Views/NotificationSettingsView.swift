//
//  NotificationSettingsView.swift
//  trackr-mobile-ios
//
//  The server's real notification model (user_preferences.notifications):
//  14 event keys grouped by surface, each with an in-app toggle and a
//  three-way email mode (off / instant / digest), plus quiet hours and the
//  digest cadence. Mirrors the web /me/settings notification section —
//  saves are merge-tolerant PATCHes to /api/v1/me/preferences.
//

import SwiftUI

struct NotificationSettingsView: View {
    var model: AppModel? = nil

    @State private var prefs: API.Preferences?

    private struct EventRow {
        let key: String
        let label: String
    }

    private let groups: [(title: String, events: [EventRow])] = [
        ("Tasks", [
            EventRow(key: "taskAssigned", label: "Assigned to me"),
            EventRow(key: "taskMentioned", label: "Mentioned"),
            EventRow(key: "taskCommented", label: "Comments"),
            EventRow(key: "taskStatusChanged", label: "Status changes"),
            EventRow(key: "taskDueSoon", label: "Due soon"),
        ]),
        ("Tickets", [
            EventRow(key: "ticketCreated", label: "New tickets"),
            EventRow(key: "ticketAssigned", label: "Assigned to me"),
            EventRow(key: "ticketStatusChanged", label: "Status changes"),
            EventRow(key: "ticketMessage", label: "New messages"),
            EventRow(key: "ticketMentioned", label: "Mentioned"),
        ]),
        ("Chat", [
            EventRow(key: "chatMessage", label: "New messages"),
            EventRow(key: "chatMentioned", label: "Mentioned"),
        ]),
        ("Projects", [
            EventRow(key: "projectMentioned", label: "Mentioned"),
        ]),
        ("Wiki", [
            EventRow(key: "wikiUpdated", label: "Page updates"),
        ]),
    ]

    var body: some View {
        Form {
            if prefs == nil {
                Section {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                }
            }

            ForEach(groups, id: \.title) { group in
                Section(group.title) {
                    ForEach(group.events, id: \.key) { event in
                        eventRow(event)
                    }
                }
            }

            quietHoursSection
            digestSection
        }
        .disabled(prefs == nil)
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await model?.sync?.loadPreferences()
            prefs = model?.sync?.preferences
        }
    }

    // MARK: - Event rows

    private func channel(_ key: String) -> API.NotificationChannelPref {
        prefs?.notifications[key] ?? API.NotificationChannelPref(email: "off", inApp: false)
    }

    private func setChannel(_ key: String, _ value: API.NotificationChannelPref) {
        guard var prefs else { return }
        prefs.notifications[key] = value
        self.prefs = prefs
        model?.sync?.updatePreferences(
            .init(notifications: [key: value]),
            apply: { $0.notifications[key] = value }
        )
    }

    private func eventRow(_ event: EventRow) -> some View {
        let current = channel(event.key)
        return HStack {
            Toggle(event.label, isOn: Binding(
                get: { channel(event.key).inApp },
                set: { on in
                    setChannel(event.key, API.NotificationChannelPref(email: current.email, inApp: on))
                }
            ))
            Menu {
                Picker("Email", selection: Binding(
                    get: { channel(event.key).email },
                    set: { mode in
                        setChannel(
                            event.key,
                            API.NotificationChannelPref(email: mode, inApp: current.inApp)
                        )
                    }
                )) {
                    Text("Email off").tag("off")
                    Text("Email instantly").tag("instant")
                    Text("Email digest").tag("digest")
                }
            } label: {
                Image(systemName: emailIcon(current.email))
                    .font(.system(size: 15))
                    .foregroundStyle(
                        current.email == "off" ? Color(.tertiaryLabel) : Color.accentColor
                    )
                    .frame(width: 30)
            }
        }
    }

    private func emailIcon(_ mode: String) -> String {
        switch mode {
        case "instant": "envelope.fill"
        case "digest": "tray.full.fill"
        default: "envelope"
        }
    }

    // MARK: - Quiet hours & digest

    private var quietHoursBinding: Binding<API.QuietHours> {
        Binding(
            get: {
                prefs?.quietHours
                    ?? API.QuietHours(enabled: false, start: "20:00", end: "08:00", weekends: true)
            },
            set: { fresh in
                prefs?.quietHours = fresh
                model?.sync?.updatePreferences(
                    .init(quietHours: fresh),
                    apply: { $0.quietHours = fresh }
                )
            }
        )
    }

    private var quietHoursSection: some View {
        Section {
            Toggle("Quiet hours", isOn: Binding(
                get: { quietHoursBinding.wrappedValue.enabled },
                set: { on in
                    var fresh = quietHoursBinding.wrappedValue
                    fresh.enabled = on
                    quietHoursBinding.wrappedValue = fresh
                }
            ))
            if quietHoursBinding.wrappedValue.enabled {
                timeRow("From", keyPath: \.start)
                timeRow("Until", keyPath: \.end)
                Toggle("Include weekends", isOn: Binding(
                    get: { quietHoursBinding.wrappedValue.weekends },
                    set: { on in
                        var fresh = quietHoursBinding.wrappedValue
                        fresh.weekends = on
                        quietHoursBinding.wrappedValue = fresh
                    }
                ))
            }
        } footer: {
            Text("Instant email inside quiet hours is held for your next digest instead of being sent.")
        }
    }

    private func timeRow(_ label: String, keyPath: WritableKeyPath<API.QuietHours, String>) -> some View {
        DatePicker(
            label,
            selection: Binding(
                get: { Self.time(from: quietHoursBinding.wrappedValue[keyPath: keyPath]) },
                set: { date in
                    var fresh = quietHoursBinding.wrappedValue
                    fresh[keyPath: keyPath] = Self.timeString(from: date)
                    quietHoursBinding.wrappedValue = fresh
                }
            ),
            displayedComponents: .hourAndMinute
        )
    }

    private var digestSection: some View {
        let digest = prefs?.digest ?? API.DigestConfig(frequency: "daily", hour: 9)
        return Section {
            Picker("Digest frequency", selection: Binding(
                get: { digest.frequency },
                set: { frequency in
                    let fresh = API.DigestConfig(frequency: frequency, hour: digest.hour)
                    prefs?.digest = fresh
                    model?.sync?.updatePreferences(.init(digest: fresh), apply: { $0.digest = fresh })
                }
            )) {
                Text("Hourly").tag("hourly")
                Text("Daily").tag("daily")
            }
            if digest.frequency == "daily" {
                Picker("Send at", selection: Binding(
                    get: { digest.hour },
                    set: { hour in
                        let fresh = API.DigestConfig(frequency: digest.frequency, hour: hour)
                        prefs?.digest = fresh
                        model?.sync?.updatePreferences(.init(digest: fresh), apply: { $0.digest = fresh })
                    }
                )) {
                    ForEach(0..<24, id: \.self) { Text(String(format: "%02d:00", $0)).tag($0) }
                }
            }
        } footer: {
            Text("Events set to \"Email digest\" are batched into one rollup email.")
        }
    }

    // MARK: - Time helpers

    private static func time(from string: String) -> Date {
        let parts = string.split(separator: ":").compactMap { Int($0) }
        let components = DateComponents(hour: parts.first ?? 0, minute: parts.count > 1 ? parts[1] : 0)
        return Calendar.current.date(from: components) ?? .now
    }

    private static func timeString(from date: Date) -> String {
        let components = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", components.hour ?? 0, components.minute ?? 0)
    }
}

#Preview {
    NavigationStack {
        NotificationSettingsView()
    }
}
