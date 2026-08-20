//
//  AccountView.swift
//  trackr-mobile-ios
//
//  The user's own account page, pushed from the profile sheet's account
//  card. Design phase — values are sample data, actions are no-ops.
//

import SwiftUI

struct AccountView: View {
    private let me = TaskItem.sampleUsers[0]  // current user later

    var body: some View {
        Form {
            Section {
                VStack(spacing: 10) {
                    AvatarView(user: me, size: 84)
                    Text(me.name)
                        .font(.system(size: 21, weight: .semibold))
                    Text("Admin · KiloHertz IT")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .listRowBackground(Color.clear)
            }

            Section("Account") {
                valueRow("Name", me.name)
                valueRow("Email", "ertugul@kilohertz.dev")
                valueRow("Role", "Admin")
                valueRow("Workspace", "KiloHertz IT")
                valueRow("Member since", "Jan 2025")
            }

            Section {
                Button("Change Password") {
                    // Wired up later
                }
                Button("Change Profile Photo") {
                    // Wired up later
                }
            }

            Section {
                Button("Delete Account", role: .destructive) {
                    // Wired up later
                }
            } footer: {
                Text("Deleting your account removes your access but keeps your work attributed to your name.")
            }
        }
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
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
