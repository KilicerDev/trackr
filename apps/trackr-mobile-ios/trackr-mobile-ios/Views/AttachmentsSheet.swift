//
//  AttachmentsSheet.swift
//  trackr-mobile-ios
//
//  Attachment sources + attached files for one task/ticket. The list reads
//  live off the shared model row, so uploads land in place; files upload
//  one at a time through SyncEngine.
//

import SwiftUI

struct AttachmentsSheet: View {
    let entityType: AttachmentEntityType
    let entityId: String
    /// nil in previews and for sample rows without a server id — sources
    /// disable and the empty state stands in.
    var model: AppModel? = nil
    /// Tickets: the server refuses external-user deletes, so callers gate
    /// the action on staff. Uploads stay open to everyone.
    var canDelete = true

    @Environment(\.dismiss) private var dismiss
    @State private var showingPhotos = false
    @State private var showingFiles = false
    @State private var showingCamera = false
    @State private var pending: [PickedFile] = []
    @State private var uploading = false
    @State private var errorMessage: String?

    /// The entity's live attachment list, resolved by server id.
    private var attachments: [AttachmentItem] {
        switch entityType {
        case .task:
            model?.tasks.first { $0.uuid == entityId }?.attachments ?? []
        case .ticket:
            model?.tickets.first { $0.uuid == entityId }?.attachments ?? []
        default:
            []
        }
    }

    private var canUpload: Bool {
        model?.sync != nil && !entityId.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button {
                        showingPhotos = true
                    } label: {
                        AttachmentSourceLabel(title: "Photo Library", systemImage: "photo.on.rectangle")
                    }
                    Button {
                        showingFiles = true
                    } label: {
                        AttachmentSourceLabel(title: "Choose Files", systemImage: "folder")
                    }
                    if AttachmentCameraView.isAvailable {
                        Button {
                            showingCamera = true
                        } label: {
                            AttachmentSourceLabel(title: "Take Photo", systemImage: "camera")
                        }
                    }
                }
                .disabled(!canUpload)

                if !pending.isEmpty {
                    Section("Uploading") {
                        ForEach(pending) { file in
                            HStack(spacing: 12) {
                                ProgressView()
                                    .controlSize(.small)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(file.filename)
                                        .font(.system(size: 14, weight: .medium))
                                        .lineLimit(1)
                                        .truncationMode(.middle)
                                    Text(file.sizeFormatted)
                                        .font(.system(size: 12))
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                Section("Attached") {
                    if attachments.isEmpty {
                        Text("No files attached.")
                            .font(.system(size: 14))
                            .foregroundStyle(.secondary)
                    } else {
                        AttachmentListView(
                            attachments: attachments,
                            onDelete: canDelete ? { attachment in
                                model?.sync?.deleteAttachment(
                                    attachment, entityType: entityType, entityId: entityId
                                )
                            } : nil
                        )
                    }
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
            .attachmentPickers(
                photos: $showingPhotos,
                files: $showingFiles,
                camera: $showingCamera
            ) { files in
                enqueue(files)
            }
            .alert("Couldn't attach", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
        .presentationDetents([.medium, .large])
    }

    /// Queue size-checked files and drain sequentially — one failed file
    /// surfaces in the alert but never stops the rest.
    private func enqueue(_ files: [PickedFile]) {
        let oversize = files.filter(\.exceedsSizeLimit)
        if let first = oversize.first {
            errorMessage = oversize.count == 1
                ? "\(first.filename) is larger than 25 MB and was skipped."
                : "\(oversize.count) files are larger than 25 MB and were skipped."
        }
        pending.append(contentsOf: files.filter { !$0.exceedsSizeLimit })
        drainUploads()
    }

    private func drainUploads() {
        guard !uploading else { return }
        guard let sync = model?.sync, !entityId.isEmpty else {
            pending.removeAll()
            return
        }
        uploading = true
        Task {
            while let file = pending.first {
                do {
                    _ = try await sync.uploadAttachment(
                        entityType: entityType,
                        entityId: entityId,
                        data: file.data,
                        filename: file.filename,
                        mimeType: file.mimeType
                    )
                } catch {
                    errorMessage = error.localizedDescription
                }
                pending.removeFirst()
            }
            uploading = false
        }
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        AttachmentsSheet(entityType: .task, entityId: "")
    }
}
