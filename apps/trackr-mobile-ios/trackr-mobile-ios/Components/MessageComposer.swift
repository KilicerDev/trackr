//
//  MessageComposer.swift
//  trackr-mobile-ios
//
//  Bottom composer: growing text field with attach + send. Reusable for
//  task comments, ticket replies, and chat. Attachment staging is opt-in
//  per call site via `onSendFiles`.
//

import SwiftUI

struct MessageComposer: View {
    /// Serialized body — `@Name` picks become `@[Name](id)` mention tokens
    /// (web Composer parity). Setting it to "" from outside resets the field.
    @Binding var text: String
    var placeholder = "Write a comment…"
    /// People offered when the user types `@…`; empty disables mentions.
    var mentionCandidates: [UserRef] = []
    /// Plain send — call sites without attachment support.
    var onSend: (() -> Void)? = nil
    /// Files-aware send; providing it enables the paperclip + staging strip
    /// and takes precedence over `onSend`. Staged files clear on send.
    var onSendFiles: (([PickedFile]) -> Void)? = nil
    /// Tinted outline (the ticket internal-note amber) — nil keeps the
    /// neutral border.
    var accent: Color? = nil

    /// What the user sees and edits — plain `@Name` runs.
    @State private var display = ""
    @State private var picked: [UserRef] = []

    @State private var staged: [PickedFile] = []
    @State private var showPhotoPicker = false
    @State private var showFileImporter = false
    @State private var showCamera = false
    @State private var showSizeAlert = false

    private static let queryRegex = try! NSRegularExpression(pattern: "(?:^|\\s)@([^@\\s]*)$")

    private var isEmpty: Bool {
        display.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// The `@query` being typed at the caret (end of text), if any.
    private var mentionQuery: (range: NSRange, query: String)? {
        let ns = display as NSString
        guard let match = Self.queryRegex.firstMatch(in: display, range: NSRange(location: 0, length: ns.length))
        else { return nil }
        let q = match.range(at: 1)
        // Range of "@query" (excluding the leading whitespace).
        return (NSRange(location: q.location - 1, length: q.length + 1), ns.substring(with: q))
    }

    private var suggestions: [UserRef] {
        guard !mentionCandidates.isEmpty, let query = mentionQuery?.query else { return [] }
        var seen = Set<String>()
        return mentionCandidates
            .filter { seen.insert($0.name).inserted }
            .filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }
            .prefix(8)
            .map { $0 }
    }

    var body: some View {
        VStack(spacing: 6) {
            if !suggestions.isEmpty {
                suggestionStrip
            }
            if !staged.isEmpty {
                stagedStrip
            }
            field
        }
        .padding(.horizontal, 12)
        .onChange(of: display) { _, new in
            picked.removeAll { !new.contains("@\($0.name)") }
            text = Mentions.tokenized(new, users: picked)
        }
        .onChange(of: text) { _, new in
            // External reset (caller cleared the draft after sending).
            if new.isEmpty, !display.isEmpty {
                display = ""
                picked = []
            }
        }
        .attachmentPickers(
            photos: $showPhotoPicker, files: $showFileImporter, camera: $showCamera
        ) { files in
            for file in files { stage(file) }
        }
        .alert("Files can be at most 25 MB.", isPresented: $showSizeAlert) {
            Button("OK") {}
        }
        .animation(.easeOut(duration: 0.15), value: suggestions.map(\.name))
        .animation(.easeOut(duration: 0.15), value: staged)
    }

    private var suggestionStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(suggestions, id: \.name) { user in
                    Button {
                        insert(user)
                    } label: {
                        HStack(spacing: 6) {
                            AvatarView(user: user, size: 20)
                            Text(user.name)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(TK.text)
                        }
                        .padding(.leading, 4)
                        .padding(.trailing, 10)
                        .frame(height: 30)
                        .background(TK.elevated, in: .capsule)
                        .overlay(Capsule().strokeBorder(TK.borderStrong, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private var stagedStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(staged) { file in
                    stagedChip(file)
                }
            }
            .padding(.horizontal, 2)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func stagedChip(_ file: PickedFile) -> some View {
        HStack(spacing: 8) {
            if file.isImage, let image = UIImage(data: file.data) {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 32, height: 32)
                    .clipShape(.rect(cornerRadius: 7))
            } else {
                Image(systemName: "doc")
                    .font(.system(size: 15))
                    .foregroundStyle(TK.text2)
                    .frame(width: 32, height: 32)
                    .background(TK.elevated2, in: .rect(cornerRadius: 7))
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(file.filename)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(TK.text)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .frame(maxWidth: 120, alignment: .leading)
                Text(file.sizeFormatted)
                    .font(.system(size: 11))
                    .foregroundStyle(TK.text2)
            }
            Button {
                staged.removeAll { $0.id == file.id }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 15))
                    .foregroundStyle(Color(.tertiaryLabel))
            }
            .buttonStyle(.plain)
        }
        .padding(6)
        .background(TK.elevated, in: .rect(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(TK.borderStrong, lineWidth: 1)
        )
    }

    private func insert(_ user: UserRef) {
        guard let range = mentionQuery?.range else { return }
        let ns = display as NSString
        display = ns.replacingCharacters(in: range, with: "@\(user.name) ")
        if !picked.contains(user) { picked.append(user) }
    }

    private func stage(_ file: PickedFile) {
        guard !file.exceedsSizeLimit else {
            showSizeAlert = true
            return
        }
        guard staged.count < AttachmentRules.maxFilesPerBatch else { return }
        staged.append(file)
    }

    private func send() {
        if let onSendFiles {
            onSendFiles(staged)
            staged = []
        } else {
            onSend?()
        }
    }

    private var field: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField(placeholder, text: $display, axis: .vertical)
                .font(.system(size: 15))
                .foregroundStyle(TK.text)
                .lineLimit(1...5)
                .padding(.leading, 14)
                .padding(.vertical, 8)
                .frame(minHeight: 36)

            if onSendFiles != nil {
                Menu {
                    if AttachmentCameraView.isAvailable {
                        Button {
                            showCamera = true
                        } label: {
                            Label("Take Photo", systemImage: "camera")
                        }
                    }
                    Button {
                        showPhotoPicker = true
                    } label: {
                        Label("Photo Library", systemImage: "photo.on.rectangle")
                    }
                    Button {
                        showFileImporter = true
                    } label: {
                        Label("Choose Files", systemImage: "folder")
                    }
                } label: {
                    Image(systemName: "paperclip")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(TK.text2)
                        .frame(width: 36, height: 36)
                        .contentShape(.rect)
                }
            }

            Button(action: send) {
                Image(systemName: "paperplane")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(isEmpty ? TK.accent.opacity(0.3) : TK.accent, in: .rect(cornerRadius: 10))
            }
            .buttonStyle(TKScaleStyle())
            .disabled(isEmpty)
            .animation(.easeOut(duration: 0.2), value: isEmpty)
        }
        .padding(6)
        .background(TK.card, in: .rect(cornerRadius: TK.rCard))
        .overlay(
            RoundedRectangle(cornerRadius: TK.rCard)
                .strokeBorder(accent?.opacity(0.5) ?? TK.borderStrong, lineWidth: 1)
        )
    }
}

#Preview {
    @Previewable @State var text = ""
    VStack {
        Spacer()
        MessageComposer(text: $text, onSendFiles: { _ in })
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
