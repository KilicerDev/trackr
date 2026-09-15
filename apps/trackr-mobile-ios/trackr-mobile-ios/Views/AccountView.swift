//
//  AccountView.swift
//  trackr-mobile-ios
//
//  The user's own account page, pushed from the Account root's profile
//  card. Server reality: only `name` (and an avatar URL) are editable;
//  email is fixed, passwords go through the forgot-password email flow,
//  and account deletion is admin-only — so none of those are offered here.
//

import SwiftUI

struct AccountView: View {
    var model: AppModel? = nil

    @State private var name = ""
    @State private var savedName = ""

    private var me: UserRef { model?.me ?? TaskItem.sampleUsers[0] }
    private var email: String { model?.currentUserEmail ?? "" }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespaces) }
    private var canSave: Bool {
        !trimmedName.isEmpty && trimmedName.count <= 80 && trimmedName != savedName
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(spacing: 10) {
                    AvatarView(user: me, size: 84)
                    Text(savedName.isEmpty ? me.name : savedName)
                        .font(.system(size: 21, weight: .semibold))
                        .foregroundStyle(TK.text)
                    if !email.isEmpty {
                        Text(email)
                            .font(.system(size: 13))
                            .foregroundStyle(TK.text2)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)

                VStack(alignment: .leading, spacing: 10) {
                    TKSectionLabel("Name")
                        .padding(.leading, 2)
                    HStack(spacing: 10) {
                        TKTextInput(text: $name, placeholder: "Name", font: .system(size: 16))
                            .onSubmit(save)
                        if canSave {
                            TKAccentButton(title: "Save", action: save)
                                .transition(.opacity)
                        }
                    }
                    .animation(.snappy(duration: 0.2), value: canSave)
                    Text("Your name is visible to teammates on tasks, tickets and notes.")
                        .font(.system(size: 12))
                        .foregroundStyle(TK.text3)
                        .padding(.leading, 2)
                }

                VStack(alignment: .leading, spacing: 10) {
                    TKSectionLabel("Account")
                        .padding(.leading, 2)
                    VStack(spacing: 0) {
                        TKRow(label: "Email") { value(email.isEmpty ? "—" : email) }
                        if let host = ServerConfig.savedHost?.host() {
                            TKHairline(leading: 14)
                            TKRow(label: "Server") { value(host, mono: true) }
                        }
                    }
                    .tkCard(padding: nil)
                    Text("Password changes go through the \"Forgot password\" email flow on the web sign-in page.")
                        .font(.system(size: 12))
                        .foregroundStyle(TK.text3)
                        .padding(.leading, 2)
                }
            }
            .padding(.horizontal, TK.gutter)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Account")
        .onAppear {
            name = me.name
            savedName = me.name
        }
    }

    private func value(_ text: String, mono: Bool = false) -> some View {
        Text(text)
            .font(mono ? .tkMono(12) : .system(size: 14))
            .foregroundStyle(TK.text2)
            .lineLimit(1)
            .truncationMode(.middle)
    }

    private func save() {
        guard canSave else { return }
        savedName = trimmedName
        model?.sync?.updateProfile(name: trimmedName)
    }
}

#Preview {
    NavigationStack {
        AccountView(model: AppModel())
            .tkDetailScreen()
    }
    .preferredColorScheme(.dark)
}
