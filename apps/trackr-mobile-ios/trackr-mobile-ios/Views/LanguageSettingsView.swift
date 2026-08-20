//
//  LanguageSettingsView.swift
//  trackr-mobile-ios
//
//  App language selection — mirrors the web's paraglide locales.
//  Design phase: local state only.
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
        Form {
            Section {
                ForEach(options, id: \.id) { option in
                    Button {
                        selected = option.id
                        model?.sync?.updatePreferences(
                            .init(locale: option.id),
                            apply: { $0.locale = option.id }
                        )
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(option.label)
                                    .foregroundStyle(Color(.label))
                                if let detail = option.detail {
                                    Text(detail)
                                        .font(.system(size: 12))
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            if selected == option.id {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Color.accentColor)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            } footer: {
                Text("Applies to the app interface. Ticket replies and notes keep the language they were written in.")
            }
        }
        .navigationTitle("Language")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await model?.sync?.loadPreferences()
            if let saved = model?.sync?.preferences?.locale { selected = saved }
        }
    }
}

#Preview {
    NavigationStack {
        LanguageSettingsView()
    }
}
