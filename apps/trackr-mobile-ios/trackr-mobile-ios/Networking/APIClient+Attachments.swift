//
//  APIClient+Attachments.swift
//  trackr-mobile-ios
//
//  Attachment endpoints. These live under /api/attachments (not /api/v1) —
//  the web app's routes — but bearer auth resolves in the global server hook,
//  so they accept the mobile token as-is. Error bodies are the same
//  `{ message }` shape guard.ts produces.
//

import Foundation

extension APIClient {
    func attachments(entityType: String, entityId: String) async throws -> API.AttachmentsResponse {
        try await get("/api/attachments", query: [
            URLQueryItem(name: "entityType", value: entityType),
            URLQueryItem(name: "entityId", value: entityId),
        ])
    }

    func uploadAttachment(
        entityType: String,
        entityId: String,
        data: Data,
        filename: String,
        mimeType: String
    ) async throws -> API.Attachment {
        let response: API.AttachmentUploadResponse = try await upload(
            "/api/attachments",
            fields: ["entityType": entityType, "entityId": entityId],
            fileData: data,
            filename: filename,
            mimeType: mimeType
        )
        return response.attachment
    }

    /// 204 No Content — raw, since there's no JSON to decode.
    func deleteAttachment(id: String) async throws {
        _ = try await raw("DELETE", "/api/attachments/\(id)")
    }

    /// Original bytes (or the 480px WebP thumb). Prefer AttachmentStore —
    /// it fronts this with a disk cache keyed on the server's immutable
    /// cache headers.
    func attachmentBytes(id: String, thumb: Bool = false) async throws -> Data {
        let query = thumb ? [URLQueryItem(name: "thumb", value: nil)] : []
        let (data, _) = try await raw("GET", "/api/attachments/\(id)", query: query)
        return data
    }
}
