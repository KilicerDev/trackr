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
    /// Event whose email mode picker is open.
    @State private var emailPicker: EventRow?
    @State private var pickingDigestHour = false

    struct EventRow: Identifiable {
        let key: String
        let label: String
        var id: String { key }
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

    private static let emailModes: [(id: String, label: String, icon: String)] = [
        ("off", "Email off", "envelope"),
        ("instant", "Email instantly", "envelope.fill"),
        ("digest", "Email digest", "tray.full.fill"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if prefs == nil {
                    ProgressView()
                        .tint(TK.text3)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                }

                HStack(spacing: 14) {
                    legend("bell", "In app")
                    legend("envelope.fill", "Instant email")
                    legend("tray.full.fill", "Digest")
                }
                .padding(.leading, 2)

                ForEach(groups, id: \.title) { group in
                    section(group.title) {
                        VStack(spacing: 0) {
                            ForEach(Array(group.events.enumerated()), id: \.element.key) { index, event in
                                if index > 0 { TKHairline(leading: 14) }
                                eventRow(event)
                            }
                        }
                        .tkCard(padding: nil)
                    }
                }

                quietHoursSection
                digestSection
            }
            .padding(.horizontal, TK.gutter)
            .padding(.top, 12)
            .padding(.bottom, 32)
        }
        .disabled(prefs == nil)
        .opacity(prefs == nil ? 0.6 : 1)
        .navigationTitle("Notifications")
        .task {
            await model?.sync?.loadPreferences()
            prefs = model?.sync?.preferences ?? (model?.sync == nil ? SettingsView.defaultPreferences : nil)
        }
        .sheet(item: $emailPicker) { event in
            TKPickerSheet(
                title: "Email · \(event.label)",
                options: Self.emailModes.map { mode in
                    TKPickerOption(mode.id, label: mode.label) { TKPickerIcon.symbol(mode.icon) }
                },
                selected: channel(event.key).email
            ) { mode in
                setChannel(event.key, API.NotificationChannelPref(email: mode, inApp: channel(event.key).inApp))
            }
        }
        .sheet(isPresented: $pickingDigestHour) {
            let digest = prefs?.digest ?? API.DigestConfig(frequency: "daily", hour: 9)
            TKPickerSheet(
                title: "Send digest at",
                options: (0..<24).map { TKPickerOption($0, label: String(format: "%02d:00", $0)) },
                selected: digest.hour
            ) { hour in
                setDigest(API.DigestConfig(frequency: digest.frequency, hour: hour))
            }
        }
    }

    // MARK: - Pieces

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            TKSectionLabel(title)
                .padding(.leading, 2)
            content()
        }
    }

    private func legend(_ icon: String, _ label: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .medium))
            Text(label)
                .font(.system(size: 11))
        }
        .foregroundStyle(TK.text3)
    }

    private func footnote(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12))
            .foregroundStyle(TK.text3)
            .lineSpacing(2)
            .padding(.leading, 2)
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
        let mode = Self.emailModes.first { $0.id == current.email } ?? Self.emailModes[0]
        return TKRow(label: event.label) {
            HStack(spacing: 12) {
                Button {
                    emailPicker = event
                } label: {
                    Image(systemName: mode.icon)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(current.email == "off" ? TK.text4 : TK.accent)
                        .frame(width: 36, height: 36)
                        .background(current.email == "off" ? TK.mono(0.06) : TK.accentSoft, in: .rect(cornerRadius: TK.rChip))
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(mode.label)
                TKToggle(isOn: Binding(
                    get: { channel(event.key).inApp },
                    set: { on in
                        setChannel(event.key, API.NotificationChannelPref(email: current.email, inApp: on))
                    }
                ))
            }
        }
    }

    // MARK: - Quiet hours & digest

    private var quietHours: API.QuietHours {
        prefs?.quietHours ?? API.QuietHours(enabled: false, start: "20:00", end: "08:00", weekends: true)
    }

    private func setQuietHours(_ fresh: API.QuietHours) {
        prefs?.quietHours = fresh
        model?.sync?.updatePreferences(.init(quietHours: fresh), apply: { $0.quietHours = fresh })
    }

    private var quietHoursSection: some View {
        section("Quiet hours") {
            VStack(spacing: 0) {
                TKRow(label: "Quiet hours", detail: "Hold instant email for the next digest") {
                    TKToggle(isOn: Binding(
                        get: { quietHours.enabled },
                        set: { on in
                            var fresh = quietHours
                            fresh.enabled = on
                            withAnimation(.snappy(duration: 0.2)) { setQuietHours(fresh) }
                        }
                    ))
                }
                if quietHours.enabled {
                    TKHairline(leading: 14)
                    timeRow("From", keyPath: \.start)
                    TKHairline(leading: 14)
                    timeRow("Until", keyPath: \.end)
                    TKHairline(leading: 14)
                    TKRow(label: "Include weekends") {
                        TKToggle(isOn: Binding(
                            get: { quietHours.weekends },
                            set: { on in
                                var fresh = quietHours
                                fresh.weekends = on
                                setQuietHours(fresh)
                            }
                        ))
                    }
                }
            }
            .tkCard(padding: nil)
        }
    }

    private func timeRow(_ label: String, keyPath: WritableKeyPath<API.QuietHours, String>) -> some View {
        TKRow(label: label) {
            DatePicker(
                label,
                selection: Binding(
                    get: { Self.time(from: quietHours[keyPath: keyPath]) },
                    set: { date in
                        var fresh = quietHours
                        fresh[keyPath: keyPath] = Self.timeString(from: date)
                        setQuietHours(fresh)
                    }
                ),
                displayedComponents: .hourAndMinute
            )
            .labelsHidden()
            .tint(TK.accent)
        }
    }

    private func setDigest(_ fresh: API.DigestConfig) {
        prefs?.digest = fresh
        model?.sync?.updatePreferences(.init(digest: fresh), apply: { $0.digest = fresh })
    }

    private var digestSection: some View {
        let digest = prefs?.digest ?? API.DigestConfig(frequency: "daily", hour: 9)
        return section("Digest") {
            VStack(spacing: 0) {
                TKRow(label: "Frequency") {
                    TKSegmented(["hourly", "daily"], selection: Binding(
                        get: { digest.frequency },
                        set: { setDigest(API.DigestConfig(frequency: $0, hour: digest.hour)) }
                    )) { $0.capitalized }
                }
                if digest.frequency == "daily" {
                    TKHairline(leading: 14)
                    Button {
                        pickingDigestHour = true
                    } label: {
                        TKRow(label: "Send at") {
                            HStack(spacing: 6) {
                                Text(String(format: "%02d:00", digest.hour))
                                    .font(.tkMono(15))
                                    .foregroundStyle(TK.text2)
                                TKChevron()
                            }
                        }
                        .contentShape(.rect)
                    }
                    .buttonStyle(TKPressStyle())
                }
            }
            .tkCard(padding: nil)
            footnote("Events set to \"Email digest\" are batched into one rollup email.")
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
        NotificationSettingsView(model: AppModel())
            .tkDetailScreen()
    }
    .preferredColorScheme(.dark)
}
