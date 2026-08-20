//
//  UserManagementView.swift
//  trackr-mobile-ios
//
//  Workspace members and portal users — the admin view. Role changes
//  and removal via context menu, local state until the API pass.
//

import SwiftUI

struct UserManagementView: View {
    private struct Member: Identifiable {
        let user: UserRef
        var role: String
        var id: String { user.name }
    }

    @State private var members: [Member] = zip(
        TaskItem.sampleUsers, ["Admin", "Member", "Member"]
    ).map { Member(user: $0, role: $1) }

    private let portalUsers: [(user: UserRef, org: String)] = zip(
        TicketItem.sampleCustomers, TicketItem.sampleOrgs.map(\.name)
    ).map { ($0, $1) }

    var body: some View {
        List {
            Section("Team") {
                ForEach(members) { member in
                    HStack(spacing: 12) {
                        AvatarView(user: member.user, size: 34)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(member.user.name)
                                .font(.system(size: 15, weight: .medium))
                            Text(member.role)
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .contentShape(.rect)
                    .contextMenu {
                        Picker("Role", selection: roleBinding(for: member.id)) {
                            Text("Admin").tag("Admin")
                            Text("Member").tag("Member")
                            Text("Viewer").tag("Viewer")
                        }
                        Divider()
                        Button(role: .destructive) {
                            members.removeAll { $0.id == member.id }
                        } label: {
                            Label("Remove from Workspace", systemImage: "person.badge.minus")
                        }
                    }
                }
            }

            Section {
                ForEach(portalUsers, id: \.user.name) { entry in
                    HStack(spacing: 12) {
                        AvatarView(user: entry.user, size: 34)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.user.name)
                                .font(.system(size: 15, weight: .medium))
                            Text(entry.org)
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                }
            } header: {
                Text("Portal Users")
            } footer: {
                Text("Portal users sign in through the client portal and only see their organization's tickets.")
            }
        }
        .navigationTitle("User Management")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func roleBinding(for id: String) -> Binding<String> {
        Binding(
            get: { members.first { $0.id == id }?.role ?? "Member" },
            set: { newRole in
                guard let index = members.firstIndex(where: { $0.id == id }) else { return }
                members[index].role = newRole
            }
        )
    }
}

#Preview {
    NavigationStack {
        UserManagementView()
    }
}
