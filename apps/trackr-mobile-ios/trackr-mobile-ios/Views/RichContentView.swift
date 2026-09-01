//
//  RichContentView.swift
//  trackr-mobile-ios
//
//  Native renderer for the wiki/notes document schema — real SwiftUI
//  blocks (no web view): app fonts, dark mode, text selection, tappable
//  task checkboxes. Read-only apart from local checkbox state; writes
//  come with the checkbox-toggle API later.
//

import QuickLook
import SwiftUI

struct RichContentView: View {
    let html: String
    // Parsed via .task(id: html), NOT in init: @State's initial value only
    // counts on the first render of a view identity — detail screens fetch
    // the body *after* first render, and an init-time parse would keep
    // showing the initial empty state forever.
    @State private var blocks: [NoteBlock] = []

    init(html: String) {
        self.html = html
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach($blocks) { $block in
                blockView($block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
        .tint(.accentColor)
        .task(id: html) {
            blocks = RichContentParser.parse(html)
        }
    }

    @ViewBuilder
    private func blockView(_ block: Binding<NoteBlock>) -> some View {
        switch block.wrappedValue.kind {
        case .heading(let level, let text):
            heading(level: level, text: text)
        case .paragraph(let text):
            Text(text)
                .font(.system(size: 15))
                .lineSpacing(3)
        case .list(let entries, let ordered):
            listView(entries, ordered: ordered)
        case .taskList(let entries):
            taskListView(entries) { block.wrappedValue.kind = .taskList(entries: $0) }
        case .quote(let text):
            quoteView(text)
        case .code(let code):
            codeView(code)
        case .divider:
            Divider()
                .padding(.vertical, 2)
        case .image(let src, let alt):
            RichContentImage(src: src, alt: alt)
        case .file(let id, let filename, let sizeBytes):
            RichContentFileChip(id: id, filename: filename, sizeBytes: sizeBytes)
        }
    }

    private func heading(level: Int, text: AttributedString) -> some View {
        let font: Font = switch level {
        case 1: .system(size: 24, weight: .bold)
        case 2: .system(size: 19, weight: .bold)
        default: .system(size: 16, weight: .semibold)
        }
        return Text(text)
            .font(font)
            .padding(.top, level == 1 ? 8 : 6)
    }

    private func listView(_ entries: [ListEntry], ordered: Bool) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            ForEach(entries) { entry in
                HStack(alignment: .firstTextBaseline, spacing: 9) {
                    Text(entry.ordinal.map { "\($0)." } ?? "•")
                        .font(.system(size: entry.ordinal == nil ? 15 : 13, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .frame(minWidth: 14, alignment: .trailing)
                    Text(entry.text)
                        .font(.system(size: 15))
                        .lineSpacing(3)
                }
                .padding(.leading, CGFloat(entry.depth) * 20)
            }
        }
    }

    private func taskListView(
        _ entries: [ListEntry], onChange: @escaping ([ListEntry]) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            ForEach(entries) { entry in
                Button {
                    var next = entries
                    if let index = next.firstIndex(where: { $0.id == entry.id }) {
                        next[index].checked = !(next[index].checked ?? false)
                    }
                    onChange(next)
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 9) {
                        Image(systemName: entry.checked == true ? "checkmark.square.fill" : "square")
                            .font(.system(size: 16))
                            .foregroundStyle(
                                entry.checked == true ? Color.accentColor : Color(.tertiaryLabel)
                            )
                        Text(entry.text)
                            .font(.system(size: 15))
                            .lineSpacing(3)
                            .strikethrough(entry.checked == true)
                            .foregroundStyle(
                                entry.checked == true ? Color(.tertiaryLabel) : Color.primary
                            )
                        Spacer(minLength: 0)
                    }
                    .padding(.leading, CGFloat(entry.depth) * 20)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func quoteView(_ text: AttributedString) -> some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color.accentColor.opacity(0.5))
                .frame(width: 3)
            Text(text)
                .font(.system(size: 15))
                .italic()
                .lineSpacing(3)
                .foregroundStyle(.secondary)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func codeView(_ code: String) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Text(code)
                .font(.system(size: 13, design: .monospaced))
                .lineSpacing(2)
                .padding(12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
        )
    }
}

/// Inline note/wiki image. Renders through RemoteAttachmentImage (auth
/// header, relative src) and, when the src is an attachment, taps open the
/// full-size original in QuickLook. External images render without a tap.
private struct RichContentImage: View {
    let src: String
    let alt: String?

    @Environment(\.attachmentStore) private var store
    @State private var previewURL: URL?
    @State private var downloading = false

    var body: some View {
        Group {
            if let id = AttachmentStore.attachmentId(fromSrc: src) {
                Button {
                    open(id: id)
                } label: {
                    image
                }
                .buttonStyle(.plain)
            } else {
                image
            }
        }
        .quickLookPreview($previewURL)
    }

    private var image: some View {
        RemoteAttachmentImage(source: .src(src), contentMode: .fit)
            .frame(maxHeight: 300)
            .clipShape(.rect(cornerRadius: 12))
            .overlay {
                if downloading {
                    ProgressView()
                        .controlSize(.small)
                        .padding(8)
                        .background(.thinMaterial, in: .rect(cornerRadius: 8))
                }
            }
    }

    private func open(id: String) {
        guard let store, !downloading else { return }
        downloading = true
        Task {
            defer { downloading = false }
            // Failure stays quiet — the inline render already shows the image
            // (or its failure glyph); a broken preview tap just does nothing.
            previewURL = try? await store.localFile(id: id, filename: alt ?? "image")
        }
    }
}

/// Block file chip — web parity with the editor's `.wiki-file` attachment
/// node. Tap downloads the original and opens it in QuickLook.
private struct RichContentFileChip: View {
    let id: String
    let filename: String
    let sizeBytes: Int?

    @Environment(\.attachmentStore) private var store
    @State private var previewURL: URL?
    @State private var downloading = false
    @State private var failed = false

    var body: some View {
        Button {
            open()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: failed ? "exclamationmark.triangle" : icon)
                    .font(.system(size: 17))
                    .foregroundStyle(failed ? AnyShapeStyle(.orange) : AnyShapeStyle(.secondary))
                    .frame(width: 22)
                Text(filename)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if let size = sizeFormatted {
                    Text(size)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .layoutPriority(1)
                }
                if downloading {
                    ProgressView()
                        .controlSize(.small)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
            )
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .quickLookPreview($previewURL)
    }

    private var icon: String {
        switch (filename as NSString).pathExtension.lowercased() {
        case "pdf": "doc.richtext"
        case "zip": "doc.zipper"
        case "xls", "xlsx": "tablecells"
        case "xml": "chevron.left.forwardslash.chevron.right"
        case "txt": "doc.plaintext"
        default: "doc"
        }
    }

    /// Web parity: the editor chip hides a zero/unknown size too.
    private var sizeFormatted: String? {
        guard let sizeBytes, sizeBytes > 0 else { return nil }
        return ByteCountFormatter.string(fromByteCount: Int64(sizeBytes), countStyle: .file)
    }

    private func open() {
        guard let store, !downloading else { return }
        downloading = true
        failed = false
        Task {
            defer { downloading = false }
            do {
                previewURL = try await store.localFile(id: id, filename: filename)
            } catch {
                failed = true
            }
        }
    }
}

#Preview {
    ScrollView {
        RichContentView(html: WikiPageItem.samples[3].bodyHtml)
            .padding(16)
    }
    .background(Color.webBackground)
}
