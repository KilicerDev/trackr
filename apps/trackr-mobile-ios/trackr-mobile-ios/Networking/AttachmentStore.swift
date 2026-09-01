//
//  AttachmentStore.swift
//  trackr-mobile-ios
//
//  Fetches attachment bytes with the bearer token — AsyncImage can't carry
//  an Authorization header, and note bodies embed images as relative
//  /api/attachments/<id> paths, so every attachment image and file download
//  funnels through here instead.
//
//  Caching is layered: a URLCache-backed session (the server serves bytes
//  with etag + `cache-control: immutable`, so revalidation is free), an
//  NSCache of decoded images, and in-flight de-duplication so a note with
//  the same image twice fetches once.
//

import SwiftUI
import UIKit

actor AttachmentStore {
    private let client: APIClient
    private let session: URLSession
    private let decoded = NSCache<NSString, UIImage>()
    private var inflight: [String: Task<UIImage, Error>] = [:]

    init(client: APIClient) {
        self.client = client
        // Not ephemeral like APIClient's session — the whole point is the
        // disk cache. Cookies stay off (same better-auth origin-check reason).
        let config = URLSessionConfiguration.default
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.httpCookieStorage = nil
        let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appending(path: "attachment-cache")
        config.urlCache = URLCache(
            memoryCapacity: 16 << 20, diskCapacity: 256 << 20, directory: directory
        )
        session = URLSession(configuration: config)
    }

    // MARK: - Images

    /// Decoded image for an attachment id. `thumb` requests the 480px WebP
    /// thumbnail; when the server has none (SVG, non-image types) it falls
    /// back to the original bytes.
    func image(id: String, thumb: Bool) async throws -> UIImage {
        let key = "\(id)\(thumb ? "?thumb" : "")"
        if let cached = decoded.object(forKey: key as NSString) { return cached }
        if let running = inflight[key] { return try await running.value }
        let task = Task<UIImage, Error> { [self] in
            var data = try? await fetch(
                path: "/api/attachments/\(id)",
                query: thumb ? [URLQueryItem(name: "thumb", value: nil)] : []
            )
            if data == nil, thumb {
                data = try await fetch(path: "/api/attachments/\(id)", query: [])
            }
            guard let data, let image = UIImage(data: data) else {
                throw APIError.server(status: 0, message: "Not an image.")
            }
            return image
        }
        inflight[key] = task
        defer { inflight[key] = nil }
        let image = try await task.value
        decoded.setObject(image, forKey: key as NSString)
        return image
    }

    /// Image for a note/wiki `<img src>` — relative paths resolve against
    /// the server, absolute same-host URLs keep their token, anything
    /// external loads plainly.
    func image(src: String) async throws -> UIImage {
        // The common case: "/api/attachments/<id>" straight from the editor.
        if let id = Self.attachmentId(fromSrc: src) {
            return try await image(id: id, thumb: false)
        }
        if let cached = decoded.object(forKey: src as NSString) { return cached }
        if let running = inflight[src] { return try await running.value }
        let task = Task<UIImage, Error> { [self] in
            let data = try await fetch(src: src)
            guard let image = UIImage(data: data) else {
                throw APIError.server(status: 0, message: "Not an image.")
            }
            return image
        }
        inflight[src] = task
        defer { inflight[src] = nil }
        let image = try await task.value
        decoded.setObject(image, forKey: src as NSString)
        return image
    }

    /// "/api/attachments/<id>" (with or without host/query) → id.
    static func attachmentId(fromSrc src: String) -> String? {
        guard let url = URL(string: src, relativeTo: nil) else { return nil }
        let parts = url.path.split(separator: "/").map(String.init)
        guard parts.count == 3, parts[0] == "api", parts[1] == "attachments" else { return nil }
        return parts[2]
    }

    // MARK: - Files (QuickLook / share)

    /// Downloads the original into the temp directory under the attachment's
    /// real filename — QuickLook picks its renderer by extension — and
    /// reuses it on later taps.
    func localFile(id: String, filename: String) async throws -> URL {
        var safeName = filename
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
        if safeName.isEmpty || safeName == "." || safeName == ".." { safeName = "file" }
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "attachments/\(id)", directoryHint: .isDirectory)
        let destination = directory.appending(path: safeName)
        if FileManager.default.fileExists(atPath: destination.path) { return destination }
        let data = try await fetch(path: "/api/attachments/\(id)", query: [])
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try data.write(to: destination)
        return destination
    }

    // MARK: - Fetch

    private func fetch(path: String, query: [URLQueryItem]) async throws -> Data {
        guard var components = URLComponents(
            url: client.baseURL.appending(path: path),
            resolvingAgainstBaseURL: false
        ) else { throw APIError.invalidURL }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw APIError.invalidURL }
        return try await fetch(url: url, authenticated: true)
    }

    private func fetch(src: String) async throws -> Data {
        if let absolute = URL(string: src), absolute.scheme != nil {
            let sameHost = absolute.host() == client.baseURL.host()
            return try await fetch(url: absolute, authenticated: sameHost)
        }
        guard let url = URL(string: src, relativeTo: client.baseURL)?.absoluteURL else {
            throw APIError.invalidURL
        }
        return try await fetch(url: url, authenticated: true)
    }

    private func fetch(url: URL, authenticated: Bool) async throws -> Data {
        var request = URLRequest(url: url)
        if authenticated, let token = await client.currentToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidURL }
        guard (200 ..< 300).contains(http.statusCode) else {
            // A failed image load never signs the app out — just report it.
            throw APIError.server(status: http.statusCode, message: "Download failed (\(http.statusCode)).")
        }
        return data
    }
}

extension EnvironmentValues {
    /// Set by RootView once a server session is live; nil in previews, where
    /// attachment views render their placeholders.
    @Entry var attachmentStore: AttachmentStore?
}
