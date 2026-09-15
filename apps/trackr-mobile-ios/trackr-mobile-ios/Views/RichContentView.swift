//
//  RichContentView.swift
//  trackr-mobile-ios
//
//  Native renderer for the wiki/notes document schema — real SwiftUI
//  blocks (no web view) on the TK tokens: 15pt body, semibold headings,
//  mono list markers, code on the page surface, task items with the kit
//  checkbox. Read-only apart from local checkbox state; writes come with
//  the checkbox-toggle API later.
//

import QuickLook
import SwiftUI

struct RichContentView: View {
    enum Source: Hashable {
        case html(String)
        case markdown(String)
    }

    let source: Source
    /// Drop a leading h1 when the screen already draws the title above
    /// the document (wiki pages carry their title as the first heading).
    var hidesLeadingHeading = false
    // Parsed via .task(id: html), NOT in init: @State's initial value only
    // counts on the first render of a view identity — detail screens fetch
    // the body *after* first render, and an init-time parse would keep
    // showing the initial empty state forever.
    @State private var blocks: [NoteBlock] = []

    init(html: String, hidesLeadingHeading: Bool = false) {
        self.source = .html(html)
        self.hidesLeadingHeading = hidesLeadingHeading
    }

    /// Task / ticket descriptions and comment bodies (markdown).
    init(markdown: String) {
        self.source = .markdown(markdown)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach($blocks) { $block in
                blockView($block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
        .tint(TK.accent)
        .task(id: source) {
            var parsed: [NoteBlock] = switch source {
            case .html(let html): RichContentParser.parse(html)
            case .markdown(let markdown): MarkdownParser.parse(markdown)
            }
            if hidesLeadingHeading, let first = parsed.first,
               case .heading(let level, _) = first.kind, level == 1 {
                parsed.removeFirst()
            }
            blocks = parsed
        }
    }

    @ViewBuilder
    private func blockView(_ block: Binding<NoteBlock>) -> some View {
        switch block.wrappedValue.kind {
        case .heading(let level, let text):
            heading(level: level, text: text)
        case .paragraph(let text):
            bodyText(text)
        case .list(let entries, let ordered):
            listView(entries, ordered: ordered)
        case .taskList(let entries):
            taskListView(entries) { block.wrappedValue.kind = .taskList(entries: $0) }
        case .quote(let text):
            quoteView(text)
        case .code(let code):
            codeView(code)
        case .divider:
            TKHairline(color: TK.border)
                .padding(.vertical, 4)
        case .image(let src, let alt):
            RichContentImage(src: src, alt: alt)
        case .file(let id, let filename, let sizeBytes):
            RichContentFileChip(id: id, filename: filename, sizeBytes: sizeBytes)
        }
    }

    /// 15pt body copy at ~1.5 line height.
    private func bodyText(_ text: AttributedString) -> some View {
        Text(text)
            .font(.system(size: 15))
            .lineSpacing(5)
            .foregroundStyle(TK.textBody)
    }

    private func heading(level: Int, text: AttributedString) -> some View {
        let size: CGFloat = switch level {
        case 1: 20
        case 2: 17
        default: 15
        }
        return Text(text)
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(TK.text)
            .padding(.top, level == 1 ? 6 : 4)
    }

    private func listView(_ entries: [ListEntry], ordered: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(entries) { entry in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Group {
                        if let ordinal = entry.ordinal {
                            Text("\(ordinal).")
                                .font(.tkMono(13))
                        } else {
                            Text("•")
                                .font(.system(size: 15, weight: .bold))
                        }
                    }
                    .foregroundStyle(TK.text3)
                    .frame(minWidth: 16, alignment: .trailing)
                    bodyText(entry.text)
                }
                .padding(.leading, CGFloat(entry.depth) * 20)
            }
        }
    }

    private func taskListView(
        _ entries: [ListEntry], onChange: @escaping ([ListEntry]) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(entries) { entry in
                let done = entry.checked == true
                Button {
                    var next = entries
                    if let index = next.firstIndex(where: { $0.id == entry.id }) {
                        next[index].checked = !(next[index].checked ?? false)
                    }
                    onChange(next)
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        TKCheckBox(done: done)
                        Text(entry.text)
                            .font(.system(size: 15))
                            .lineSpacing(5)
                            .strikethrough(done)
                            .foregroundStyle(done ? TK.text3 : TK.textBody)
                            .padding(.top, 1)
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
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(TK.border)
                .frame(width: 3)
            Text(text)
                .font(.system(size: 15))
                .italic()
                .lineSpacing(5)
                .foregroundStyle(TK.text2)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func codeView(_ code: String) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Text(code)
                .font(.tkMono(13))
                .lineSpacing(3)
                .foregroundStyle(TK.textBody)
                .padding(12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tkCard(radius: 10, padding: nil, fill: TK.bg)
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
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(TK.border, lineWidth: 1))
            .overlay {
                if downloading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(TK.text)
                        .padding(8)
                        .background(TK.elevated, in: .rect(cornerRadius: 8))
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
                TKIconTile(
                    systemImage: failed ? "exclamationmark.triangle" : icon,
                    color: failed ? TK.warning : TK.text2
                )
                Text(filename)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(TK.text)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if let size = sizeFormatted {
                    Text(size)
                        .font(.tkMono(11))
                        .foregroundStyle(TK.text3)
                        .layoutPriority(1)
                }
                Spacer(minLength: 0)
                if downloading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(TK.text2)
                } else {
                    Image(systemName: "arrow.down.circle")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(TK.text4)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .tkCard(radius: 10, padding: nil)
            .contentShape(.rect)
        }
        .buttonStyle(TKScaleStyle())
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
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
