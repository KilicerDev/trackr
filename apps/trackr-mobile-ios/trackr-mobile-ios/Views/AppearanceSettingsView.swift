//
//  AppearanceSettingsView.swift
//  trackr-mobile-ios
//
//  Theme, accent and app icon. Design phase — selections are local
//  state; the theme override gets applied for real with the settings
//  persistence pass.
//

import SwiftUI

struct AppearanceSettingsView: View {
    var model: AppModel? = nil

    @State private var theme = "system"
    @State private var accent: UInt32 = 0xFF4867
    @State private var appIcon = "default"

    private let accents: [(name: String, hex: UInt32)] = [
        ("Trackr", 0xFF4867),
        ("Sky", 0x7A9CF0),
        ("Mint", 0x7FC8A9),
        ("Amber", 0xF0A85C),
        ("Lilac", 0xB591E3),
    ]

    var body: some View {
        Form {
            Section {
                Picker("Theme", selection: $theme) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            } header: {
                Text("Theme")
            } footer: {
                Text("Synced with your trackr account — the web app follows the same setting.")
            }

            Section {
                HStack(spacing: 14) {
                    ForEach(accents, id: \.hex) { option in
                        Button {
                            accent = option.hex
                        } label: {
                            Circle()
                                .fill(Color(hex: option.hex))
                                .frame(width: 34, height: 34)
                                .overlay {
                                    if accent == option.hex {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 13, weight: .bold))
                                            .foregroundStyle(.white)
                                    }
                                }
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                }
                .padding(.vertical, 4)
            } header: {
                Text("Accent Color")
            } footer: {
                Text("The web app follows the workspace accent — this only changes the app on this device.")
            }

            Section("App Icon") {
                iconRow("default", label: "Default", background: Color(hex: 0xFF4867), mark: .white)
                iconRow("dark", label: "Dark", background: Color(hex: 0x1C1C1E),
                        mark: Color(hex: 0xFF4867))
                iconRow("mono", label: "Mono", background: Color(hex: 0x8E8E93), mark: .white)
            }
        }
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await model?.sync?.loadPreferences()
            if let saved = model?.sync?.preferences?.theme { theme = saved }
        }
        .onChange(of: theme) { _, fresh in
            model?.sync?.updatePreferences(.init(theme: fresh), apply: { $0.theme = fresh })
        }
    }

    private func iconRow(
        _ id: String, label: String, background: Color, mark: Color
    ) -> some View {
        Button {
            appIcon = id
        } label: {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(background)
                    .frame(width: 48, height: 48)
                    .overlay {
                        BrandMark(color: mark)
                            .frame(width: 20)
                    }
                Text(label)
                    .foregroundStyle(Color(.label))
                Spacer()
                if appIcon == id {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.accentColor)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    NavigationStack {
        AppearanceSettingsView()
    }
}
