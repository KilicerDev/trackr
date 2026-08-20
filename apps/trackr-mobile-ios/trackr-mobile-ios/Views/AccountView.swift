//
//  AccountView.swift
//  trackr-mobile-ios
//
//  The user's own account page, pushed from the profile sheet's account
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
        Form {
            Section {
                VStack(spacing: 10) {
                    AvatarView(user: me, size: 84)
                    Text(me.name)
                        .font(.system(size: 21, weight: .semibold))
                    if !email.isEmpty {
                        Text(email)
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .listRowBackground(Color.clear)
            }

            Section {
                TextField("Name", text: $name)
                    .onSubmit(save)
                if canSave {
                    Button("Save", action: save)
                        .fontWeight(.semibold)
                }
            } header: {
                Text("Name")
            } footer: {
                Text("Your name is visible to teammates on tasks, tickets and notes.")
            }

            Section("Account") {
                valueRow("Email", email.isEmpty ? "—" : email)
                if let host = ServerConfig.savedHost?.host() {
                    valueRow("Server", host)
                }
            }

            Section {
            } footer: {
                Text("Password changes go through the \"Forgot password\" email flow on the web sign-in page.")
            }
        }
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            name = me.name
            savedName = me.name
        }
    }

    private func save() {
        guard canSave else { return }
        savedName = trimmedName
        model?.sync?.updateProfile(name: trimmedName)
    }

    private func valueRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    NavigationStack {
        AccountView()
    }
}
