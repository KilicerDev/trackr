//
//  CreateProjectSheet.swift
//  trackr-mobile-ios
//
//  Web parity (projects/CreateProjectModal.svelte): name, key, description,
//  color, status. The key is suggested from the name until edited; the
//  status opens a TKPickerSheet. Icon derives from the name; org selection
//  comes with the API.
//

import SwiftUI

struct CreateProjectSheet: View {
    let projects: [ProjectItem]
    /// The signed-in user — becomes the lead and first member.
    var lead: UserRef = TaskItem.sampleUsers[0]
    let onCreate: (ProjectItem) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var key = ""
    @State private var keyEdited = false
    @State private var about = ""
    @State private var color = Self.palette[0]
    @State private var status: ProjectStatus = .active
    @State private var pickingStatus = false
    @FocusState private var nameFocused: Bool

    private static let palette: [Color] = [
        0xFF4867, 0x7A9CF0, 0x7FC8A9, 0xF0A85C, 0xC08BD6, 0xB591E3, 0xE9C46A, 0xEF7A6D, 0x9AA4B2,
    ].map { Color(hex: $0) }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespaces) }
    private var trimmedKey: String { key.trimmingCharacters(in: .whitespaces).uppercased() }
    private var keyTaken: Bool { projects.contains { $0.key == trimmedKey } }
    private var canCreate: Bool { !trimmedName.isEmpty && !trimmedKey.isEmpty && !keyTaken }

    private var suggestedKey: String {
        String(name.uppercased().filter(\.isLetter).prefix(3))
    }

    var body: some View {
        VStack(spacing: 0) {
            TKSheetHeader(title: "New project")

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 12) {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(color)
                            .frame(width: 44, height: 44)
                            .overlay(
                                Text(trimmedName.isEmpty ? "?" : String(trimmedName.prefix(1)))
                                    .font(.system(size: 20, weight: .bold))
                                    .foregroundStyle(.white)
                            )
                            .animation(.snappy(duration: 0.2), value: color)
                        TextField("Project name", text: $name)
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(TK.text)
                            .focused($nameFocused)
                            .submitLabel(.next)
                            .onChange(of: name) {
                                // Suggest a key from the name until the user
                                // edits the key themselves — like the web modal.
                                guard !keyEdited else { return }
                                key = suggestedKey
                            }
                    }

                    VStack(spacing: 0) {
                        HStack(spacing: 12) {
                            Text("Key")
                                .font(.tkRow)
                                .foregroundStyle(TK.text2)
                            Spacer()
                            TextField("TRK", text: $key)
                                .font(.tkMono(15, weight: .medium))
                                .foregroundStyle(keyTaken ? TK.danger : TK.text)
                                .multilineTextAlignment(.trailing)
                                .autocorrectionDisabled()
                                .textInputAutocapitalization(.characters)
                                .onChange(of: key) { _, newValue in
                                    if newValue != suggestedKey { keyEdited = true }
                                }
                        }
                        .padding(.horizontal, 14)
                        .frame(minHeight: 50)
                        TKHairline(color: TK.hairlineStrong)
                        TextField("What is this project about?", text: $about, axis: .vertical)
                            .lineLimit(2...5)
                            .font(.system(size: 15))
                            .foregroundStyle(TK.textBody)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 14)
                    }
                    .background(TK.card, in: .rect(cornerRadius: TK.rInput))
                    .overlay(RoundedRectangle(cornerRadius: TK.rInput).strokeBorder(TK.borderInput, lineWidth: 1))

                    if keyTaken {
                        Text("The key \(trimmedKey) is already in use.")
                            .font(.system(size: 12))
                            .foregroundStyle(TK.danger)
                            .padding(.top, -10)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        TKSectionLabel("Color")
                        HStack(spacing: 10) {
                            ForEach(Array(Self.palette.enumerated()), id: \.offset) { _, option in
                                Button {
                                    color = option
                                } label: {
                                    Circle()
                                        .fill(option)
                                        .frame(width: 28, height: 28)
                                        .overlay {
                                            if option == color {
                                                Circle().strokeBorder(.white, lineWidth: 2).padding(3)
                                            }
                                        }
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        TKSectionLabel("Status")
                        Button {
                            pickingStatus = true
                        } label: {
                            PropertyChip(chevron: true, leadingInset: 10) {
                                TKDot(color: status.color)
                                Text(status.label)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, TK.gutter)
                .padding(.top, 18)
                .padding(.bottom, 20)
            }
            .scrollDismissesKeyboard(.interactively)

            HStack(spacing: 10) {
                TKSecondaryButton(title: "Cancel") { dismiss() }
                Spacer()
                TKAccentButton(title: "Create project", enabled: canCreate, action: create)
            }
            .padding(.horizontal, TK.gutter)
            .padding(.vertical, 12)
            .overlay(alignment: .top) { TKHairline(color: TK.border) }
        }
        .tkSheet(background: TK.bgRaised, detents: [.large])
        .onAppear { nameFocused = true }
        .sheet(isPresented: $pickingStatus) {
            TKPickerSheet(
                title: "Status",
                options: ProjectStatus.allCases.map { option in
                    TKPickerOption(option, label: option.label) { TKPickerIcon.dot(option.color) }
                },
                selected: status
            ) { status = $0 }
        }
    }

    private func create() {
        guard canCreate else { return }
        onCreate(ProjectItem(
            key: trimmedKey,
            name: trimmedName,
            color: color,
            about: about.trimmingCharacters(in: .whitespacesAndNewlines),
            status: status,
            lead: lead,
            members: [lead]
        ))
        dismiss()
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        CreateProjectSheet(projects: ProjectItem.samples) { _ in }
    }
    .preferredColorScheme(.dark)
}
