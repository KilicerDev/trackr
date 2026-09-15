//
//  LanguageSettingsView.swift
//  trackr-mobile-ios
//
//  App language selection — mirrors the web's paraglide locales (en + de)
//  and saves to the account preferences.
//

import SwiftUI

struct LanguageSettingsView: View {
    var model: AppModel? = nil

    @State private var selected = "en"

    // Server reality: paraglide ships exactly en + de.
    private let options: [(id: String, label: String, detail: String?)] = [
        ("en", "English", nil),
        ("de", "Deutsch", "German"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                TKSectionLabel("App language")
                    .padding(.leading, 2)
                VStack(spacing: 0) {
                    ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
                        if index > 0 { TKHairline(leading: 14) }
                        Button {
                            selected = option.id
                            model?.sync?.updatePreferences(
                                .init(locale: option.id),
                                apply: { $0.locale = option.id }
                            )
                        } label: {
                            TKRow(label: option.label, detail: option.detail) {
                                if selected == option.id {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(TK.accent)
                                }
                            }
                            .contentShape(.rect)
                        }
                        .buttonStyle(TKPressStyle())
                    }
                }
                .tkCard(padding: nil)
                Text("Applies to the app interface. Ticket replies and notes keep the language they were written in.")
                    .font(.system(size: 12))
                    .foregroundStyle(TK.text3)
                    .lineSpacing(2)
                    .padding(.leading, 2)
            }
            .padding(.horizontal, TK.gutter)
            .padding(.top, 12)
        }
        .navigationTitle("Language")
        .task {
            await model?.sync?.loadPreferences()
            if let saved = model?.sync?.preferences?.locale { selected = saved }
        }
    }
}

#Preview {
    NavigationStack {
        LanguageSettingsView()
            .tkDetailScreen()
    }
    .preferredColorScheme(.dark)
}
