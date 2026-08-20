//
//  ProfileSheet.swift
//  trackr-mobile-ios
//
//  Apple-Music-style account sheet from the Home profile button. The
//  sheet owns its own NavigationStack: the custom header lives on the
//  root (nav bar hidden there), settings rows push real pages inside
//  the sheet. Design phase — persistence comes with the API.
//

import SwiftUI

enum ProfileRoute: Hashable {
    case account, notifications, appearance, language, whatsNew
}

struct ProfileSheet: View {
    var model: AppModel? = nil
    @Environment(\.dismiss) private var dismiss

    private var me: UserRef { model?.me ?? TaskItem.sampleUsers[0] }
    private var host: String { ServerConfig.savedHost?.host() ?? "trackr" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    accountCard
                        .padding(.top, 12)
                    caption("Your name and photo are visible to teammates on tasks, tickets and notes.")

                    settingsCard
                        .padding(.top, 22)

                    accentCard("Sign Out", role: .destructive)
                        .padding(.top, 22)
                    caption("Signed in as \(me.name) on \(host).")

                    shortcutRow
                        .padding(.top, 26)

                    Text("trackr for iOS · design preview")
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 28)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
            .background(Color(.systemGroupedBackground))
            // Header lives in the nav bar (Apple Music style) — keeping the
            // bar visible on the root means pushed pages don't reflow when
            // their bar would otherwise animate back in.
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // Principal = the title slot: renders as plain content (no
                // glass button chrome) and doesn't morph into the back
                // button on push like a leading item does.
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        BrandMark(color: .accentColor)
                            .frame(width: 17)
                        Text("Trackr Account")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(Color(.label))
                    }
                    .fixedSize()
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                    }
                }
            }
            .navigationDestination(for: ProfileRoute.self) { route in
                switch route {
                case .account: AccountView(model: model)
                case .notifications: NotificationSettingsView(model: model)
                case .appearance: AppearanceSettingsView(model: model)
                case .language: LanguageSettingsView(model: model)
                case .whatsNew: WhatsNewView()
                }
            }
        }
        .presentationDragIndicator(.hidden)
    }

    // MARK: - Sections

    private var accountCard: some View {
        NavigationLink(value: ProfileRoute.account) {
            HStack(spacing: 14) {
                AvatarView(user: me, size: 62)
                VStack(alignment: .leading, spacing: 3) {
                    Text(me.name)
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(Color(.label))
                    Text("Account information and settings")
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                chevron
            }
            .padding(16)
            .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 20))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    private var settingsCard: some View {
        VStack(spacing: 0) {
            settingsRow("Notifications", route: .notifications)
            rowDivider
            settingsRow("Appearance", route: .appearance)
            rowDivider
            settingsRow("Language", route: .language)
        }
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 20))
    }

    private func settingsRow(_ label: String, route: ProfileRoute) -> some View {
        NavigationLink(value: route) {
            HStack {
                Text(label)
                    .font(.system(size: 17))
                    .foregroundStyle(Color(.label))
                Spacer()
                chevron
            }
            .padding(.horizontal, 16)
            .frame(height: 54)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    private func accentCard(_ label: String, role: ButtonRole? = nil) -> some View {
        Button(role: role) {
            if label == "Sign Out" {
                dismiss()
                model?.onSignOut?()
            }
        } label: {
            Text(label)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(role == .destructive ? Color(hex: 0xEF4F5E) : Color.accentColor)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .frame(height: 54)
                .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 20))
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    private var shortcutRow: some View {
        HStack(spacing: 12) {
            shortcut(icon: "questionmark.circle", label: "Help Center")
            shortcut(icon: "paperplane", label: "Send Feedback")
            NavigationLink(value: ProfileRoute.whatsNew) {
                shortcutLabel(icon: "sparkles", label: "What's New")
            }
            .buttonStyle(.plain)
        }
    }

    private func shortcut(icon: String, label: String) -> some View {
        Button {
            // Wired up later
        } label: {
            shortcutLabel(icon: icon, label: label)
        }
        .buttonStyle(.plain)
    }

    private func shortcutLabel(icon: String, label: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .medium))
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .multilineTextAlignment(.center)
        }
        .foregroundStyle(Color.accentColor)
        .frame(maxWidth: .infinity)
        .frame(height: 76)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 26))
        .contentShape(.rect)
    }

    private func caption(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13))
            .lineSpacing(2)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 16)
            .padding(.top, 10)
    }

    private var rowDivider: some View {
        Divider().padding(.leading, 16)
    }

    private var chevron: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Color(.tertiaryLabel))
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        ProfileSheet()
    }
}
