//
//  LanguageSettingsView.swift
//  trackr-mobile-ios
//
//  App language selection — mirrors the web's paraglide locales.
//  Design phase: local state only.
//

import SwiftUI

struct LanguageSettingsView: View {
    @State private var selected = "system"

    private let options: [(id: String, label: String, detail: String?)] = [
        ("system", "System Default", nil),
        ("en", "English", nil),
        ("de", "Deutsch", "German"),
        ("tr", "Türkçe", "Turkish"),
    ]

    var body: some View {
        Form {
            Section {
                ForEach(options, id: \.id) { option in
                    Button {
                        selected = option.id
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
    }
}

#Preview {
    NavigationStack {
        LanguageSettingsView()
    }
}
