//
//  AttachmentListView.swift
//  trackr-mobile-ios
//
//  The shared render surface for attachment metadata rows (web parity:
//  AttachmentList.svelte) — 32pt thumbnail or icon tile, filename 13,
//  mono size · age, chevron; tap-to-preview via QuickLook, share and
//  delete in the context menu. Embedded by the task/ticket detail cards,
//  message cards and the attachments sheet.
//

import QuickLook
import SwiftUI

struct AttachmentListView: View {
    var attachments: [AttachmentItem]
    /// Horizontal row inset — 0 when embedded flush in a padded card,
    /// 12 inside a bg card on the attachments sheet.
    var inset: CGFloat = 0
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
                    TKHairline(leading: inset + 44)
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
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(TK.text)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Text("\(attachment.sizeFormatted) · \(attachment.createdAt.relativeShort)")
                        .font(.tkMono(11))
                        .foregroundStyle(TK.text3)
                }
                Spacer(minLength: 0)
                if busyId == attachment.id {
                    ProgressView()
                        .controlSize(.small)
                        .tint(TK.text2)
                } else {
                    TKDisclosure()
                }
            }
            .padding(.horizontal, inset)
            .padding(.vertical, 8)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(TKPressStyle(radius: inset > 0 ? 0 : 8))
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
        if attachment.hasThumbnail {
            RemoteAttachmentImage(source: .attachment(id: attachment.id, thumb: true))
                .frame(width: 32, height: 32)
                .clipShape(.rect(cornerRadius: 9))
                .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(TK.border, lineWidth: 1))
        } else {
            TKIconTile(systemImage: attachment.systemIcon, size: 32)
        }
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
    ], inset: 12, onDelete: { _ in })
    .tkCard(padding: nil, fill: TK.bg)
    .padding()
    .background(TK.card)
    .preferredColorScheme(.dark)
}
