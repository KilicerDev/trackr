//
//  CreateProjectSheet.swift
//  trackr-mobile-ios
//
//  Web parity (projects/CreateProjectModal.svelte): name, key, description,
//  color, status. Icon derives from the name; org selection comes with the
//  API.
//

import SwiftUI

struct CreateProjectSheet: View {
    let projects: [ProjectItem]
    let onCreate: (ProjectItem) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var key = ""
    @State private var keyEdited = false
    @State private var about = ""
    @State private var color = Self.palette[0]
    @State private var status: ProjectStatus = .active

    private static let palette: [Color] = [
        0xFF4867, 0x7A9CF0, 0x7FC8A9, 0xF0A85C, 0xC08BD6, 0xB591E3, 0xE9C46A, 0xEF7A6D, 0x9AA4B2,
    ].map { Color(hex: $0) }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespaces) }
    private var trimmedKey: String { key.trimmingCharacters(in: .whitespaces).uppercased() }
    private var keyTaken: Bool { projects.contains { $0.key == trimmedKey } }
    private var canCreate: Bool { !trimmedName.isEmpty && !trimmedKey.isEmpty && !keyTaken }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Project name", text: $name)
                        .font(.system(size: 20, weight: .semibold))
                        .onChange(of: name) {
                            // Suggest a key from the name until the user
                            // edits the key themselves — like the web modal.
                            guard !keyEdited else { return }
                            key = String(
                                name.uppercased().filter(\.isLetter).prefix(3)
                            )
                        }
                    HStack {
                        Text("Key")
                            .foregroundStyle(.secondary)
                        TextField("TRK", text: $key)
                            .font(.system(size: 15, design: .monospaced))
                            .multilineTextAlignment(.trailing)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.characters)
                            .onChange(of: key) { _, newValue in
                                if newValue != String(name.uppercased().filter(\.isLetter).prefix(3)) {
                                    keyEdited = true
                                }
                            }
                    }
                    TextField("What is this project about?", text: $about, axis: .vertical)
                        .lineLimit(2...5)
                        .font(.system(size: 15))
                } footer: {
                    if keyTaken {
                        Text("The key \(trimmedKey) is already in use.")
                            .foregroundStyle(Color(hex: 0xEF4F5E))
                    }
                }

                Section("Color") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(Array(Self.palette.enumerated()), id: \.offset) { _, option in
                                Button {
                                    color = option
                                } label: {
                                    Circle()
                                        .fill(option)
                                        .frame(width: 30, height: 30)
                                        .overlay {
                                            if option == color {
                                                Circle()
                                                    .strokeBorder(.white, lineWidth: 2)
                                                    .padding(3)
                                            }
                                        }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section {
                    Picker("Status", selection: $status) {
                        ForEach(ProjectStatus.allCases) { Text($0.label).tag($0) }
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("New Project")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        onCreate(ProjectItem(
                            key: trimmedKey,
                            name: trimmedName,
                            color: color,
                            about: about.trimmingCharacters(in: .whitespacesAndNewlines),
                            status: status,
                            lead: TaskItem.sampleUsers[0],  // current user later
                            members: [TaskItem.sampleUsers[0]]
                        ))
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .disabled(!canCreate)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        CreateProjectSheet(projects: ProjectItem.samples) { _ in }
    }
}
