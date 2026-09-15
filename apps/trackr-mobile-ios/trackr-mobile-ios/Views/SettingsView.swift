//
//  SettingsView.swift
//  trackr-mobile-ios
//
//  The Account surface (top-bar avatar menu → Account settings). Interim
//  shell root: pushes the existing settings pages.
//

import SwiftUI

struct SettingsView: View {
    @Bindable var model: AppModel

    var body: some View {
        NavigationStack(path: $model.settingsPath) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    TKPageHeader("Account")
                    VStack(spacing: 0) {
                        NavigationLink(value: ProfileRoute.account) {
                            TKRow(label: "Profile") { TKDisclosure() }
                        }
                        TKHairline()
                        NavigationLink(value: ProfileRoute.appearance) {
                            TKRow(label: "Appearance") { TKDisclosure() }
                        }
                        TKHairline()
                        NavigationLink(value: ProfileRoute.notifications) {
                            TKRow(label: "Notifications") { TKDisclosure() }
                        }
                        TKHairline()
                        NavigationLink(value: ProfileRoute.language) {
                            TKRow(label: "Language") { TKDisclosure() }
                        }
                    }
                    .buttonStyle(.plain)
                    .tkCard(padding: nil)
                    .padding(.horizontal, TK.gutter)
                }
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
        }
    }
}

#Preview {
    SettingsView(model: AppModel())
        .preferredColorScheme(.dark)
}
