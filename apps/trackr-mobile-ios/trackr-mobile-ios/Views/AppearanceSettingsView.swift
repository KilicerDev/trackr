//
//  AppearanceSettingsView.swift
//  trackr-mobile-ios
//
//  Theme only. The setting is @AppStorage("trackr.theme") — RootView
//  applies it — and is mirrored to the account preferences so the web app
//  follows the same choice. (The design-phase accent / app-icon pickers
//  were placeholders that persisted nothing and are gone.)
//

import SwiftUI

struct AppearanceSettingsView: View {
    var model: AppModel? = nil

    @AppStorage("trackr.theme") private var theme = "system"

    private static let themes = ["dark", "light", "system"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                TKSectionLabel("Theme")
                    .padding(.leading, 2)
                VStack(spacing: 0) {
                    TKRow(label: "Theme") {
                        TKSegmented(Self.themes, selection: $theme) { $0.capitalized }
                    }
                }
                .tkCard(padding: nil)
                Text("Synced with your trackr account — the web app follows the same setting.")
                    .font(.system(size: 12))
                    .foregroundStyle(TK.text3)
                    .padding(.leading, 2)
            }
            .padding(.horizontal, TK.gutter)
            .padding(.top, 12)
        }
        .navigationTitle("Appearance")
        .task {
            await model?.sync?.loadPreferences()
            if let saved = model?.sync?.preferences?.theme, Self.themes.contains(saved) { theme = saved }
        }
        .onChange(of: theme) { _, fresh in
            model?.sync?.updatePreferences(.init(theme: fresh), apply: { $0.theme = fresh })
        }
    }
}

#Preview {
    NavigationStack {
        AppearanceSettingsView()
            .tkDetailScreen()
    }
    .preferredColorScheme(.dark)
}
