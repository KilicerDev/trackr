//
//  FileStaging.swift
//  trackr-mobile-ios
//
//  Files staged on a create sheet before the entity exists. The sheet holds
//  one `FileStaging` value, renders `StagedFilesSection` inside its Form and
//  attaches `.fileStaging(...)` to the Form so the pickers + error alert
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

/// The "Attachments" Form section: photo/file sources + staged chips.
struct StagedFilesSection: View {
    @Binding var staging: FileStaging

    var body: some View {
        Section("Attachments") {
            Button {
                staging.showingPhotos = true
            } label: {
                AttachmentSourceLabel(title: "Photo Library", systemImage: "photo.on.rectangle")
            }
            Button {
                staging.showingFiles = true
            } label: {
                AttachmentSourceLabel(title: "Choose Files", systemImage: "folder")
            }
            if !staging.files.isEmpty {
                ChipFlow(spacing: 6) {
                    ForEach(staging.files) { file in
                        StagedFileChip(file: file) { staging.remove(file) }
                    }
                }
            }
        }
    }
}

struct StagedFileChip: View {
    let file: PickedFile
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: file.isImage ? "photo" : "doc")
                .font(.system(size: 12))
                .foregroundStyle(Color(.secondaryLabel))
            Text(file.filename)
                .font(.system(size: 13, weight: .medium))
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(maxWidth: 160, alignment: .leading)
            Text(file.sizeFormatted)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(Color(.tertiaryLabel))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color(.tertiarySystemFill), in: .capsule)
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
