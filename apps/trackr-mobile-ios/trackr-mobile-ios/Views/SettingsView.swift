//
//  SettingsView.swift
//  trackr-mobile-ios
//
//  The Account surface (top-bar avatar menu → Account settings), DESIGN.md
//  §5 "Account": profile card, APPEARANCE (theme + language),
//  NOTIFICATIONS (the most-used in-app toggles, full page behind them),
//  What's new / Sign out, version footer. Theme lives in
//  @AppStorage("trackr.theme") (RootView applies it) and is mirrored to the
//  server preferences like the web's setting.
//

import SwiftUI

/// Pages pushed from the Account root.
enum ProfileRoute: Hashable {
    case account, notifications, appearance, language, whatsNew
}

struct SettingsView: View {
    @Bindable var model: AppModel

    @AppStorage("trackr.theme") private var theme = "system"
    /// Local mirror of the server preferences (nil until loaded; sample
    /// mode keeps a default set so the toggles render).
    @State private var prefs: API.Preferences?

    private static let themes = ["dark", "light", "system"]

    private var host: String? { ServerConfig.savedHost?.host() }

    private var version: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
        return short
    }

    private var localeLabel: String {
        switch prefs?.locale ?? "en" {
        case "de": "Deutsch"
        default: "English"
        }
    }

    var body: some View {
        NavigationStack(path: $model.settingsPath) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    TKPageHeader("Account")
                        .padding(.horizontal, -TK.gutter)

                    profileCard

                    section("Appearance") {
                        VStack(spacing: 0) {
                            TKRow(label: "Theme") {
                                TKSegmented(Self.themes, selection: $theme) { $0.capitalized }
                            }
                            TKHairline(leading: 14)
                            NavigationLink(value: ProfileRoute.language) {
                                TKRow(label: "Language") {
                                    HStack(spacing: 8) {
                                        Text(localeLabel)
                                            .font(.tkRow)
                                            .foregroundStyle(TK.text2)
                                        TKDisclosure()
                                    }
                                }
                                .contentShape(.rect)
                            }
                            .buttonStyle(TKPressStyle())
                        }
                        .tkCard(padding: nil)
                    }

                    section("Notifications") {
                        VStack(spacing: 0) {
                            toggleRow("Assigned to me", detail: "Tasks and tickets", key: "taskAssigned",
                                      also: "ticketAssigned")
                            TKHairline(leading: 14)
                            toggleRow("Mentions", detail: "Anywhere your name is used", key: "taskMentioned",
                                      also: "ticketMentioned")
                            TKHairline(leading: 14)
                            toggleRow("Ticket messages", detail: "New replies from clients", key: "ticketMessage")
                            TKHairline(leading: 14)
                            TKRow(label: "Quiet hours", detail: quietHoursDetail) {
                                TKToggle(isOn: quietHoursBinding)
                            }
                            TKHairline(leading: 14)
                            NavigationLink(value: ProfileRoute.notifications) {
                                TKRow(label: "All notification settings") { TKDisclosure() }
                                    .contentShape(.rect)
                            }
                            .buttonStyle(TKPressStyle())
                        }
                        .tkCard(padding: nil)
                    }

                    VStack(spacing: 0) {
                        NavigationLink(value: ProfileRoute.whatsNew) {
                            TKRow(label: "What's new", detail: "Version \(version)") { TKDisclosure() }
                                .contentShape(.rect)
                        }
                        .buttonStyle(TKPressStyle())
                        if let host {
                            TKHairline(leading: 14)
                            TKRow(label: "Server") {
                                Text(host)
                                    .font(.tkMono(12))
                                    .foregroundStyle(TK.text3)
                                    .lineLimit(1)
                            }
                        }
                        TKHairline(leading: 14)
                        Button {
                            model.onSignOut?()
                        } label: {
                            HStack {
                                Text("Sign out")
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(TK.accent)
                                Spacer()
                                Image(systemName: "rectangle.portrait.and.arrow.right")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(TK.accent)
                            }
                            .padding(.horizontal, 14)
                            .frame(minHeight: 52)
                            .contentShape(.rect)
                        }
                        .buttonStyle(TKPressStyle())
                    }
                    .tkCard(padding: nil)

                    Text("Trackr for iOS · \(version)")
                        .font(.system(size: 12))
                        .foregroundStyle(TK.text4)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 4)
                }
                .padding(.horizontal, TK.gutter)
                .padding(.bottom, 24)
            }
            .tkRootScreen(model)
            .navigationDestination(for: ProfileRoute.self) { route in
                Group {
                    switch route {
                    case .account: AccountView(model: model)
                    case .notifications: NotificationSettingsView(model: model)
                    case .appearance: AppearanceSettingsView(model: model)
                    case .language: LanguageSettingsView(model: model)
                    case .whatsNew: WhatsNewView()
                    }
                }
                .tkDetailScreen()
            }
            .task { await loadPreferences() }
            .onChange(of: theme) { _, fresh in
                model.sync?.updatePreferences(.init(theme: fresh), apply: { $0.theme = fresh })
            }
        }
    }

    // MARK: - Pieces

    private var profileCard: some View {
        NavigationLink(value: ProfileRoute.account) {
            HStack(spacing: 14) {
                AvatarView(user: model.me, size: 48)
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.me.name)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(TK.text)
                        .lineLimit(1)
                    Text(model.currentUserEmail.isEmpty ? "Account details" : model.currentUserEmail)
                        .font(.system(size: 13))
                        .foregroundStyle(TK.text2)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                TKDisclosure()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .tkCard(padding: 14)
            .contentShape(.rect)
        }
        .buttonStyle(TKScaleStyle())
    }

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            TKSectionLabel(title)
                .padding(.leading, 2)
            content()
        }
    }

    // MARK: - Notification toggles (same store as NotificationSettingsView)

    private func toggleRow(_ label: String, detail: String, key: String, also: String? = nil) -> some View {
        TKRow(label: label, detail: detail) {
            TKToggle(isOn: Binding(
                get: { channel(key).inApp },
                set: { on in
                    setInApp(key, on)
                    if let also { setInApp(also, on) }
                }
            ))
        }
    }

    private func channel(_ key: String) -> API.NotificationChannelPref {
        prefs?.notifications[key] ?? API.NotificationChannelPref(email: "off", inApp: true)
    }

    private func setInApp(_ key: String, _ on: Bool) {
        let value = API.NotificationChannelPref(email: channel(key).email, inApp: on)
        if prefs == nil { prefs = Self.defaultPreferences }
        prefs?.notifications[key] = value
        model.sync?.updatePreferences(
            .init(notifications: [key: value]),
            apply: { $0.notifications[key] = value }
        )
    }

    private var quietHoursDetail: String {
        let quiet = prefs?.quietHours ?? Self.defaultPreferences.quietHours
        return quiet.enabled ? "\(quiet.start) – \(quiet.end)" : "Off"
    }

    private var quietHoursBinding: Binding<Bool> {
        Binding(
            get: { (prefs?.quietHours ?? Self.defaultPreferences.quietHours).enabled },
            set: { on in
                var fresh = prefs?.quietHours ?? Self.defaultPreferences.quietHours
                fresh.enabled = on
                if prefs == nil { prefs = Self.defaultPreferences }
                prefs?.quietHours = fresh
                model.sync?.updatePreferences(.init(quietHours: fresh), apply: { $0.quietHours = fresh })
            }
        )
    }

    private func loadPreferences() async {
        guard let sync = model.sync else {
            if prefs == nil { prefs = Self.defaultPreferences }
            return
        }
        await sync.loadPreferences()
        prefs = sync.preferences
        // Web parity: the account's theme setting follows the user across
        // devices; the device pushes its own choice on change.
        if let saved = sync.preferences?.theme, Self.themes.contains(saved), saved != theme {
            theme = saved
        }
    }

    /// Sample-mode / not-yet-loaded defaults (mirror the server defaults).
    static let defaultPreferences = API.Preferences(
        theme: "system", density: "comfortable", defaultLanding: "week", weekStartsOn: 1, locale: "en",
        notifications: [
            "taskAssigned": .init(email: "instant", inApp: true),
            "taskMentioned": .init(email: "instant", inApp: true),
            "ticketMessage": .init(email: "instant", inApp: true),
        ],
        quietHours: API.QuietHours(enabled: false, start: "20:00", end: "08:00", weekends: true),
        digest: API.DigestConfig(frequency: "daily", hour: 9),
        notificationScope: API.NotificationScope(tickets: "all", chat: "all")
    )
}

#Preview {
    SettingsView(model: AppModel())
        .preferredColorScheme(.dark)
}
