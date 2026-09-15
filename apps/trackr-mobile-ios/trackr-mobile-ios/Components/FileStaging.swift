//
//  FileStaging.swift
//  trackr-mobile-ios
//
//  Files staged on a create sheet before the entity exists. The sheet holds
//  one `FileStaging` value, renders `StagedFilesSection` in its body and
//  attaches `.fileStaging(...)` to the sheet so the pickers + error alert
//  live in one place. On create, `files` rides along in the same multipart
//  request as the entity, so the server can list them in the webhook.
//

import SwiftUI

struct FileStaging {
    var files: [PickedFile] = []
    var showingPhotos = false
    var showingFiles = false
    var error: String?

    /// Oversize files never stage — the create request is one shot, too
    /// late to surface a size error per file. `noun` names the entity in
    /// the batch-limit message ("task", "ticket").
    mutating func stage(_ incoming: [PickedFile], noun: String) {
        let oversize = incoming.filter(\.exceedsSizeLimit)
        if let first = oversize.first {
            error = oversize.count == 1
                ? "\(first.filename) is larger than 25 MB and was skipped."
                : "\(oversize.count) files are larger than 25 MB and were skipped."
        }
        let room = AttachmentRules.maxFilesPerBatch - files.count
        let accepted = incoming.filter { !$0.exceedsSizeLimit }
        if accepted.count > room {
            error = "At most \(AttachmentRules.maxFilesPerBatch) files per \(noun)."
        }
        files.append(contentsOf: accepted.prefix(max(0, room)))
    }

    mutating func remove(_ file: PickedFile) {
        files.removeAll { $0.id == file.id }
    }
}

/// The "Attachments" block of a create sheet: a card chip strip of the
/// staged files (thumbnail 32 · name · size · remove) plus a dashed
/// "Attach" chip that opens the source chooser (photos / files).
struct StagedFilesSection: View {
    @Binding var staging: FileStaging
    @State private var choosingSource = false
    @State private var pendingSource: Source?

    private enum Source: String, CaseIterable, Identifiable {
        case photos, files
        var id: String { rawValue }
    }

    private var full: Bool { staging.files.count >= AttachmentRules.maxFilesPerBatch }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                TKSectionLabel("Attachments")
                if !staging.files.isEmpty {
                    Text("\(staging.files.count)")
                        .font(.tkMono(11))
                        .foregroundStyle(TK.text3)
                }
                Spacer()
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(staging.files) { file in
                        StagedFileChip(file: file) { staging.remove(file) }
                    }
                    TKGhostChip(title: "Attach", icon: "paperclip", height: 40) {
                        choosingSource = true
                    }
                    .disabled(full)
                    .opacity(full ? 0.4 : 1)
                }
                .padding(10)
            }
            .tkCard(padding: nil)
        }
        .sheet(isPresented: $choosingSource, onDismiss: openPendingSource) {
            TKPickerSheet(
                title: "Attach",
                options: [
                    TKPickerOption(Source.photos, label: "Photo Library") {
                        TKPickerIcon.symbol("photo.on.rectangle")
                    },
                    TKPickerOption(Source.files, label: "Choose Files") {
                        TKPickerIcon.symbol("folder")
                    },
                ],
                selected: nil
            ) { pendingSource = $0 }
        }
    }

    /// The system pickers are hosted by `.fileStaging` on the sheet; open
    /// them only once the chooser has slid away so the presentations don't
    /// collide.
    private func openPendingSource() {
        guard let source = pendingSource else { return }
        pendingSource = nil
        switch source {
        case .photos: staging.showingPhotos = true
        case .files: staging.showingFiles = true
        }
    }
}

struct StagedFileChip: View {
    let file: PickedFile
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            thumbnail
            VStack(alignment: .leading, spacing: 1) {
                Text(file.filename)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(TK.text)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .frame(maxWidth: 120, alignment: .leading)
                Text(file.sizeFormatted)
                    .font(.tkMono(11))
                    .foregroundStyle(TK.text3)
            }
            Button(action: onRemove) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(TK.text3)
                    .frame(width: 24, height: 24)
                    .background(TK.mono(0.08), in: .circle)
                    .contentShape(.circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove \(file.filename)")
        }
        .padding(.leading, 4)
        .padding(.trailing, 6)
        .frame(height: 40)
        .background(TK.bg, in: .rect(cornerRadius: TK.rChip))
        .overlay(RoundedRectangle(cornerRadius: TK.rChip).strokeBorder(TK.borderStrong, lineWidth: 1))
    }

    @ViewBuilder
    private var thumbnail: some View {
        if file.isImage, let image = UIImage(data: file.data) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 32, height: 32)
                .clipShape(.rect(cornerRadius: 7))
        } else {
            Image(systemName: "doc")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(TK.text2)
                .frame(width: 32, height: 32)
                .background(TK.mono(0.06), in: .rect(cornerRadius: 7))
        }
    }
}

extension View {
    /// Hosts the pickers and the "Couldn't attach" alert for a staging value.
    func fileStaging(_ staging: Binding<FileStaging>, noun: String) -> some View {
        attachmentPickers(
            photos: staging.showingPhotos,
            files: staging.showingFiles
        ) { files in
            staging.wrappedValue.stage(files, noun: noun)
        }
        .alert("Couldn't attach", isPresented: Binding(
            get: { staging.wrappedValue.error != nil },
            set: { if !$0 { staging.wrappedValue.error = nil } }
        )) {
            Button("OK") { staging.wrappedValue.error = nil }
        } message: {
            Text(staging.wrappedValue.error ?? "")
        }
    }
}

#Preview {
    @Previewable @State var staging = FileStaging(files: [
        PickedFile(filename: "screenshot-2026-09-14.png", mimeType: "image/png", data: Data(count: 240_000)),
        PickedFile(filename: "invoice.pdf", mimeType: "application/pdf", data: Data(count: 1_200_000)),
    ])
    VStack {
        StagedFilesSection(staging: $staging)
    }
    .padding(16)
    .frame(maxHeight: .infinity)
    .background(TK.bgRaised)
    .preferredColorScheme(.dark)
}
