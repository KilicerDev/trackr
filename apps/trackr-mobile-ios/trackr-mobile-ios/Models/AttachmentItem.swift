//
//  AttachmentItem.swift
//  trackr-mobile-ios
//
//  Web parity: the attachment table's public projection (AttachmentPublic).
//  Bytes are fetched separately through AttachmentStore; this is metadata
//  only.
//

import Foundation

/// Wire values of attachment.entity_type. Ticket messages, task comments and
/// chat messages all live in the shared message table since migration 0035 —
/// they attach as `.message`.
enum AttachmentEntityType: String {
    case ticket
    case task
    case wikiPage = "wiki_page"
    case note
    case message
    case projectActivity = "project_activity"
}

struct AttachmentItem: Identifiable, Hashable {
    let id: String
    var filename: String
    var mimeType: String
    var sizeBytes: Int
    var width: Int?
    var height: Int?
    var hasThumbnail: Bool
    /// Server user id of the uploader — resolved to a UserRef by callers
    /// that hold an author directory; nil for system imports.
    var uploadedById: String?
    var createdAt: Date

    var isImage: Bool { mimeType.hasPrefix("image/") }

    var sizeFormatted: String {
        ByteCountFormatter.string(fromByteCount: Int64(sizeBytes), countStyle: .file)
    }

    /// SF Symbol for non-thumbnail rows, keyed on type the way the web's
    /// generic file icon rows read.
    var systemIcon: String {
        if isImage { return "photo" }
        switch mimeType {
        case "application/pdf": return "doc.richtext"
        case "application/zip", "application/x-zip-compressed": return "doc.zipper"
        case "text/plain": return "doc.plaintext"
        case "text/xml", "application/xml": return "chevron.left.forwardslash.chevron.right"
        default: break
        }
        switch (filename as NSString).pathExtension.lowercased() {
        case "xls", "xlsx", "csv": return "tablecells"
        case "zip": return "doc.zipper"
        case "pdf": return "doc.richtext"
        case "xml": return "chevron.left.forwardslash.chevron.right"
        case "txt", "md": return "doc.plaintext"
        default: return "doc"
        }
    }
}

/// Server-side upload rules (web/src/lib/config/attachments.ts) enforced
/// client-side too, so failures surface before the bytes travel.
enum AttachmentRules {
    static let maxUploadBytes = 25 * 1024 * 1024
    static let maxFilesPerBatch = 20
    /// Notes only accept images plus these extensions; every other entity
    /// takes any type. Matched by filename extension (web parity — browser
    /// MIME for zip/xls is unreliable, so the server checks names too).
    static let noteFileExtensions: Set<String> = ["pdf", "xml", "xls", "xlsx", "zip", "txt"]

    static func allows(filename: String, mimeType: String, entityType: AttachmentEntityType) -> Bool {
        guard entityType == .note else { return true }
        if mimeType.hasPrefix("image/") { return true }
        return noteFileExtensions.contains((filename as NSString).pathExtension.lowercased())
    }
}
