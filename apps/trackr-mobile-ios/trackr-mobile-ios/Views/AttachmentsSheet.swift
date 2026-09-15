//
//  AttachmentsSheet.swift
//  trackr-mobile-ios
//
//  Attachment sources + attached files for one task/ticket. The list reads
//  live off the shared model row, so uploads land in place; files upload
//  one at a time through SyncEngine. Sheet chrome: header, source buttons
//  (Photos / Files / Camera), UPLOADING + ATTACHED sections in bg cards.
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
        VStack(spacing: 0) {
            TKSheetHeader(title: "Attachments")
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    sources
                        .padding(.bottom, 8)

                    if !pending.isEmpty {
                        TKSectionLabel("Uploading")
                        VStack(spacing: 0) {
                            ForEach(pending) { file in
                                pendingRow(file)
                                if file.id != pending.last?.id {
                                    TKHairline(leading: 56)
                                }
                            }
                        }
                        .tkCard(radius: TK.rCardSm, padding: nil, fill: TK.bg)
                        .padding(.bottom, 8)
                    }

                    HStack(alignment: .firstTextBaseline) {
                        TKSectionLabel("Attached")
                        Spacer()
                        Text("\(attachments.count)")
                            .font(.tkMono(11))
                            .foregroundStyle(TK.text4)
                    }
                    Group {
                        if attachments.isEmpty {
                            TKEmptyState(text: "No files attached.", padding: 28)
                        } else {
                            AttachmentListView(
                                attachments: attachments,
                                inset: 12,
                                onDelete: canDelete ? { attachment in
                                    model?.sync?.deleteAttachment(
                                        attachment, entityType: entityType, entityId: entityId
                                    )
                                } : nil
                            )
                        }
                    }
                    .tkCard(radius: TK.rCardSm, padding: nil, fill: TK.bg)
                }
                .padding(.horizontal, TK.gutter)
                .padding(.top, 14)
                .padding(.bottom, 24)
            }
        }
        .tkSheet(detents: [.medium, .large])
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

    // MARK: - Pieces

    private var sources: some View {
        HStack(spacing: 8) {
            TKSecondaryButton(title: "Photos", icon: "photo.on.rectangle", fill: TK.bg, expand: true) {
                showingPhotos = true
            }
            TKSecondaryButton(title: "Files", icon: "folder", fill: TK.bg, expand: true) {
                showingFiles = true
            }
            if AttachmentCameraView.isAvailable {
                TKSecondaryButton(title: "Camera", icon: "camera", fill: TK.bg, expand: true) {
                    showingCamera = true
                }
            }
        }
        .disabled(!canUpload)
        .opacity(canUpload ? 1 : 0.45)
    }

    private func pendingRow(_ file: PickedFile) -> some View {
        HStack(spacing: 12) {
            ProgressView()
                .controlSize(.small)
                .tint(TK.text2)
                .frame(width: 32, height: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(file.filename)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(TK.text)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Text(file.sizeFormatted)
                    .font(.tkMono(11))
                    .foregroundStyle(TK.text3)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(minHeight: 48)
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
    .preferredColorScheme(.dark)
}
