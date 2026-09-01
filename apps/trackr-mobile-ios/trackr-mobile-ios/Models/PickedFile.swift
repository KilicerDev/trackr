//
//  PickedFile.swift
//  trackr-mobile-ios
//
//  A file staged for upload, however it was picked (photo library, document
//  picker, camera). Bytes live in memory — uploads cap at 25 MB, so that's
//  fine — and travel to the server via SyncEngine.uploadAttachment.
//

import Foundation
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct PickedFile: Identifiable, Hashable {
    let id = UUID()
    var filename: String
    var mimeType: String
    var data: Data

    var isImage: Bool { mimeType.hasPrefix("image/") }

    var sizeFormatted: String {
        ByteCountFormatter.string(fromByteCount: Int64(data.count), countStyle: .file)
    }

    var exceedsSizeLimit: Bool { data.count > AttachmentRules.maxUploadBytes }

    /// Library photos have no filename — synthesize one from the timestamp.
    /// HEIC/HEIF is re-encoded as JPEG: the web viewers (Chrome, Firefox)
    /// can't display it and the server's thumbnailer may lack libheif.
    static func load(item: PhotosPickerItem) async -> PickedFile? {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return nil }
        let type = item.supportedContentTypes.first
        let stamp = Date.now.formatted(
            .dateTime.year().month(.twoDigits).day().hour().minute().second()
        ).filter { $0.isNumber }
        if let type, type.conforms(to: .heic) || type.conforms(to: .heif),
           let image = UIImage(data: data), let jpeg = image.jpegData(compressionQuality: 0.9)
        {
            return PickedFile(filename: "photo-\(stamp).jpg", mimeType: "image/jpeg", data: jpeg)
        }
        let ext = type?.preferredFilenameExtension ?? "jpg"
        return PickedFile(
            filename: "photo-\(stamp).\(ext)",
            mimeType: type?.preferredMIMEType ?? "image/jpeg",
            data: data
        )
    }

    /// Document-picker URLs are security-scoped — read inside the scope.
    static func load(url: URL) -> PickedFile? {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { return nil }
        let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
        return PickedFile(
            filename: url.lastPathComponent,
            mimeType: mime ?? "application/octet-stream",
            data: data
        )
    }

    /// Camera captures arrive as UIImages — store them as JPEG.
    static func load(image: UIImage, index: Int) -> PickedFile? {
        guard let data = image.jpegData(compressionQuality: 0.85) else { return nil }
        let stamp = Date.now.formatted(
            .dateTime.year().month(.twoDigits).day().hour().minute().second()
        ).filter { $0.isNumber }
        return PickedFile(
            filename: "photo-\(stamp)-\(index + 1).jpg",
            mimeType: "image/jpeg",
            data: data
        )
    }
}
