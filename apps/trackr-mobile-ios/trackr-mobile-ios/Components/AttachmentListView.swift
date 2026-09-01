//
//  AttachmentListView.swift
//  trackr-mobile-ios
//
//  The shared render surface for attachment metadata rows (web parity:
//  AttachmentList.svelte) — thumbnail or type icon, name, size, tap-to-
//  preview via QuickLook, share and delete in the context menu. Embedded by
//  the task/ticket detail cards, message bubbles and the attachments sheet.
//

import QuickLook
import SwiftUI

struct AttachmentListView: View {
    var attachments: [AttachmentItem]
    /// Delete entry in the context menu; the caller owns the server call
    /// (and optimistic model update). Nil hides the action.
    var onDelete: ((AttachmentItem) -> Void)? = nil

    @Environment(\.attachmentStore) private var store
    @State private var previewURL: URL?
    @State private var shareFile: ShareFile?
    @State private var busyId: String?
    @State private var confirmDelete: AttachmentItem?
    @State private var loadError: String?

    var body: some View {
        VStack(spacing: 0) {
            ForEach(attachments) { attachment in
                row(attachment)
                if attachment.id != attachments.last?.id {
                    Divider().padding(.leading, 56)
                }
            }
        }
        .quickLookPreview($previewURL)
        .sheet(item: $shareFile) { file in
            ShareSheet(url: file.url)
                .presentationDetents([.medium, .large])
        }
        .confirmationDialog(
            "Delete \(confirmDelete?.filename ?? "attachment")?",
            isPresented: Binding(
                get: { confirmDelete != nil },
                set: { if !$0 { confirmDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let target = confirmDelete { onDelete?(target) }
                confirmDelete = nil
            }
        }
        .alert("Couldn't load file", isPresented: Binding(
            get: { loadError != nil },
            set: { if !$0 { loadError = nil } }
        )) {
            Button("OK") { loadError = nil }
        } message: {
            Text(loadError ?? "")
        }
    }

    private func row(_ attachment: AttachmentItem) -> some View {
        Button {
            open(attachment) { previewURL = $0 }
        } label: {
            HStack(spacing: 12) {
                thumbnail(attachment)
                VStack(alignment: .leading, spacing: 2) {
                    Text(attachment.filename)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Text("\(attachment.sizeFormatted) · \(attachment.createdAt.relativeShort)")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                if busyId == attachment.id {
                    ProgressView().controlSize(.small)
                }
            }
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                open(attachment) { shareFile = ShareFile(url: $0) }
            } label: {
                Label("Share", systemImage: "square.and.arrow.up")
            }
            if onDelete != nil {
                Button(role: .destructive) {
                    confirmDelete = attachment
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
        }
    }

    @ViewBuilder
    private func thumbnail(_ attachment: AttachmentItem) -> some View {
        Group {
            if attachment.hasThumbnail {
                RemoteAttachmentImage(source: .attachment(id: attachment.id, thumb: true))
            } else {
                ZStack {
                    Color(.systemGray6)
                    Image(systemName: attachment.systemIcon)
                        .font(.system(size: 17))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(width: 44, height: 44)
        .clipShape(.rect(cornerRadius: 8))
    }

    /// Download (or reuse) the local copy, then hand it to the caller —
    /// QuickLook and the share sheet both want a file URL with the real name.
    private func open(_ attachment: AttachmentItem, then present: @escaping (URL) -> Void) {
        guard let store, busyId == nil else { return }
        busyId = attachment.id
        Task {
            defer { busyId = nil }
            do {
                present(try await store.localFile(id: attachment.id, filename: attachment.filename))
            } catch {
                loadError = error.localizedDescription
            }
        }
    }
}

struct ShareFile: Identifiable {
    let url: URL
    var id: String { url.path }
}

struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

#Preview {
    AttachmentListView(attachments: [
        AttachmentItem(
            id: "1", filename: "quote-workstations.pdf", mimeType: "application/pdf",
            sizeBytes: 482_000, width: nil, height: nil, hasThumbnail: false,
            uploadedById: nil, createdAt: .now
        ),
        AttachmentItem(
            id: "2", filename: "screenshot.png", mimeType: "image/png",
            sizeBytes: 1_240_000, width: 1290, height: 2796, hasThumbnail: true,
            uploadedById: nil, createdAt: .now.addingTimeInterval(-7200)
        ),
    ], onDelete: { _ in })
    .padding()
}
