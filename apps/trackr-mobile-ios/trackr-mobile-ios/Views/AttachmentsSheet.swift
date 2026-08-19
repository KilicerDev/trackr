//
//  AttachmentsSheet.swift
//  trackr-mobile-ios
//
//  Attachment sources + attached files. Pickers are placeholders until
//  the API exists.
//

import SwiftUI

struct AttachmentsSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button {
                        // PhotosPicker — wired up later
                    } label: {
                        Label("Photo Library", systemImage: "photo.on.rectangle")
                    }
                    Button {
                        // Document picker — wired up later
                    } label: {
                        Label("Choose Files", systemImage: "folder")
                    }
                    Button {
                        // Document scanner — wired up later
                    } label: {
                        Label("Scan Document", systemImage: "doc.viewfinder")
                    }
                }

                Section("Attached") {
                    Text("No files attached.")
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Attachments")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        AttachmentsSheet()
    }
}
