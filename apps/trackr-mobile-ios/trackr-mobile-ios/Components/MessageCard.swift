//
//  MessageCard.swift
//  trackr-mobile-ios
//
//  Web parity (Inspector comment body): bordered card, not a chat bubble.
//  Reusable for task comments and ticket messages. Attachments render under
//  the text — images as tappable thumbnails, other files as metadata rows.
//

import QuickLook
import SwiftUI
import UIKit

struct MessageCard: View {
    let text: String
    /// Tinted variant, e.g. the ticket internal-note yellow — nil keeps the
    /// standard elevated look.
    var accent: Color?
    var attachments: [AttachmentItem] = []
    /// Files of an optimistic message that are still uploading — previewed
    /// from their local bytes with a progress badge until the server copy
    /// (with real attachments) replaces the row.
    var pendingFiles: [PickedFile] = []

    @Environment(\.attachmentStore) private var store
    @State private var previewURL: URL?

    private var imageAttachments: [AttachmentItem] {
        attachments.filter { $0.isImage && $0.hasThumbnail }
    }

    private var fileAttachments: [AttachmentItem] {
        attachments.filter { !($0.isImage && $0.hasThumbnail) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !text.isEmpty {
                if MarkdownParser.hasBlockSyntax(text) {
                    RichContentView(markdown: text)
                } else {
                    Text(MarkdownParser.inline(text))
                        .font(.system(size: 15))
                        .foregroundStyle(TK.mono(0.88))
                        .lineSpacing(3)
                }
            }
            if !imageAttachments.isEmpty {
                imageRow
            }
            if !fileAttachments.isEmpty {
                AttachmentListView(attachments: fileAttachments)
            }
            if !pendingFiles.isEmpty {
                pendingRow
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            accent?.opacity(0.07) ?? TK.card,
            in: .rect(cornerRadius: 12)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(accent?.opacity(0.40) ?? TK.border, lineWidth: 1)
        )
        .quickLookPreview($previewURL)
    }

    private var imageRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(imageAttachments) { attachment in
                    Button {
                        open(attachment)
                    } label: {
                        RemoteAttachmentImage(source: .attachment(id: attachment.id, thumb: true))
                            .frame(width: 96, height: 96)
                            .clipShape(.rect(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var pendingRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(pendingFiles) { file in
                    ZStack {
                        if file.isImage, let image = UIImage(data: file.data) {
                            Image(uiImage: image)
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        } else {
                            TK.elevated
                            VStack(spacing: 4) {
                                Image(systemName: "doc")
                                    .font(.system(size: 20))
                                    .foregroundStyle(.secondary)
                                Text(file.filename)
                                    .font(.system(size: 10))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                                    .padding(.horizontal, 6)
                            }
                        }
                        ProgressView()
                            .controlSize(.small)
                            .padding(6)
                            .background(.thinMaterial, in: .circle)
                    }
                    .frame(width: 96, height: 96)
                    .clipShape(.rect(cornerRadius: 10))
                    .opacity(0.85)
                }
            }
        }
    }

    /// Full-size original via the store's local copy — QuickLook wants a
    /// file URL with the real name.
    private func open(_ attachment: AttachmentItem) {
        guard let store else { return }
        Task {
            previewURL = try? await store.localFile(id: attachment.id, filename: attachment.filename)
        }
    }
}

#Preview {
    MessageCard(text: "Root cause: Outlook inverts any background darker than #333.")
        .padding()
        .background(TK.bg)
        .preferredColorScheme(.dark)
}
