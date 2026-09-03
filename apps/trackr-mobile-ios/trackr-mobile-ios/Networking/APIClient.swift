//
//  APIClient.swift
//  trackr-mobile-ios
//
//  The single low-level caller for the /api/v1 bearer surface. Every request
//  in the app funnels through send() so auth headers, token rotation
//  (set-auth-token), JSON coding and error mapping live in exactly one place.
//
//  The URLSession is cookie-less on purpose: better-auth's origin check only
//  fires when a cookie arrives without a matching Origin header, and
//  self-hosted instances run with an empty trustedOrigins — replayed cookies
//  would turn every POST into a 403.
//

import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case notATrackrServer
    case server(status: Int, message: String)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .invalidURL: "That doesn't look like a valid server address."
        case .notATrackrServer: "No trackr server found at that address."
        case .server(_, let message): message
        case .unauthorized: "Your session has expired. Please sign in again."
        }
    }
}

actor APIClient {
    let baseURL: URL
    private var token: String?
    private let session: URLSession

    /// Called when the server rotates the session token (set-auth-token
    /// header) — persist it.
    var onTokenRefresh: (@Sendable (String) -> Void)?
    /// Called on any authenticated 401 — the token is dead, sign out.
    var onUnauthorized: (@Sendable () -> Void)?

    init(baseURL: URL, token: String?) {
        self.baseURL = baseURL
        self.token = token
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.httpCookieStorage = nil
        config.waitsForConnectivity = false
        self.session = URLSession(configuration: config)
    }

    func setToken(_ newToken: String?) {
        token = newToken
    }

    func currentToken() -> String? { token }

    func setCallbacks(
        onTokenRefresh: (@Sendable (String) -> Void)?,
        onUnauthorized: (@Sendable () -> Void)?
    ) {
        self.onTokenRefresh = onTokenRefresh
        self.onUnauthorized = onUnauthorized
    }

    // MARK: - Requests

    struct NoBody: Encodable {}

    func get<T: Decodable>(
        _ path: String,
        query: [URLQueryItem] = [],
        authenticated: Bool = true
    ) async throws -> T {
        try await send("GET", path, query: query, body: NoBody?.none, authenticated: authenticated)
    }

    @discardableResult
    func post<T: Decodable, B: Encodable>(
        _ path: String,
        body: B,
        authenticated: Bool = true
    ) async throws -> T {
        try await send("POST", path, query: [], body: body, authenticated: authenticated)
    }

    @discardableResult
    func patch<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        try await send("PATCH", path, query: [], body: body, authenticated: true)
    }

    @discardableResult
    func put<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        try await send("PUT", path, query: [], body: body, authenticated: true)
    }

    @discardableResult
    func delete<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        try await send("DELETE", path, query: [], body: body, authenticated: true)
    }

    @discardableResult
    func delete<T: Decodable>(_ path: String) async throws -> T {
        try await send("DELETE", path, query: [], body: NoBody?.none, authenticated: true)
    }

    /// Raw variant for endpoints with irregular bodies or non-JSON responses
    /// (get-session's literal `null`, attachment bytes, 204 deletes).
    /// Returns the data + response after the shared header/rotation
    /// handling, without JSON-decoding.
    func raw(
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        authenticated: Bool = true,
        allowUnauthorized: Bool = false,
        timeout: TimeInterval? = nil
    ) async throws -> (Data, HTTPURLResponse) {
        var request = try makeRequest(method, path, query: query, bodyData: nil, authenticated: authenticated)
        if let timeout { request.timeoutInterval = timeout }
        return try await perform(request, authenticated: authenticated, allowUnauthorized: allowUnauthorized)
    }

    /// Multipart POST for file uploads — the attachment endpoint takes form
    /// data, not JSON. Fields go first, then the single file part.
    func upload<T: Decodable>(
        _ path: String,
        fields: [String: String],
        fileData: Data,
        filename: String,
        mimeType: String,
        fileField: String = "file"
    ) async throws -> T {
        let boundary = "trackr-\(UUID().uuidString)"
        var body = Data()
        func append(_ text: String) { body.append(Data(text.utf8)) }
        for (name, value) in fields {
            append("--\(boundary)\r\n")
            append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
            append("\(value)\r\n")
        }
        // Quotes in a filename would break the part header — swap them out.
        let safeName = filename.replacingOccurrences(of: "\"", with: "'")
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"\(fileField)\"; filename=\"\(safeName)\"\r\n")
        append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(fileData)
        append("\r\n--\(boundary)--\r\n")

        var request = try makeRequest("POST", path, query: [], bodyData: nil, authenticated: true)
        request.httpBody = body
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        let (data, _) = try await perform(request, authenticated: true, allowUnauthorized: false)
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Multipart POST carrying a JSON object (`payload` field) plus staged
    /// files (`attachments` parts) — the /api/v1 create/reply endpoints'
    /// "attach in the same request" shape. Without files this is a plain
    /// JSON POST so the server keeps its cheap path.
    func postWithFiles<T: Decodable, B: Encodable>(
        _ path: String,
        payload: B,
        files: [PickedFile]
    ) async throws -> T {
        if files.isEmpty {
            return try await send("POST", path, query: [], body: payload, authenticated: true)
        }
        let boundary = "trackr-\(UUID().uuidString)"
        var body = Data()
        func append(_ text: String) { body.append(Data(text.utf8)) }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"payload\"\r\n")
        append("Content-Type: application/json\r\n\r\n")
        body.append(try JSONEncoder().encode(payload))
        append("\r\n")
        for file in files {
            let safeName = file.filename.replacingOccurrences(of: "\"", with: "'")
            append("--\(boundary)\r\n")
            append("Content-Disposition: form-data; name=\"attachments\"; filename=\"\(safeName)\"\r\n")
            append("Content-Type: \(file.mimeType)\r\n\r\n")
            body.append(file.data)
            append("\r\n")
        }
        append("--\(boundary)--\r\n")

        var request = try makeRequest("POST", path, query: [], bodyData: nil, authenticated: true)
        request.httpBody = body
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        let (data, _) = try await perform(request, authenticated: true, allowUnauthorized: false)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func send<T: Decodable, B: Encodable>(
        _ method: String,
        _ path: String,
        query: [URLQueryItem],
        body: B?,
        authenticated: Bool
    ) async throws -> T {
        var bodyData: Data?
        if let body {
            bodyData = try JSONEncoder().encode(body)
        }
        let request = try makeRequest(method, path, query: query, bodyData: bodyData, authenticated: authenticated)
        let (data, _) = try await perform(request, authenticated: authenticated, allowUnauthorized: false)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func makeRequest(
        _ method: String,
        _ path: String,
        query: [URLQueryItem],
        bodyData: Data?,
        authenticated: Bool
    ) throws -> URLRequest {
        guard var components = URLComponents(
            url: baseURL.appending(path: path),
            resolvingAgainstBaseURL: false
        ) else { throw APIError.invalidURL }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bodyData {
            request.httpBody = bodyData
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authenticated, let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func perform(
        _ request: URLRequest,
        authenticated: Bool,
        allowUnauthorized: Bool
    ) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidURL }

        // Adopt rotated tokens no matter which endpoint sent them.
        if let fresh = http.value(forHTTPHeaderField: "set-auth-token"), !fresh.isEmpty {
            token = fresh
            onTokenRefresh?(fresh)
        }

        if http.statusCode == 401 {
            if authenticated && !allowUnauthorized { onUnauthorized?() }
            throw APIError.unauthorized
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            throw APIError.server(status: http.statusCode, message: Self.errorMessage(from: data))
        }
        return (data, http)
    }

    /// SvelteKit `error()` and guard.ts apiError both produce `{ message }`.
    private static func errorMessage(from data: Data) -> String {
        struct ErrorBody: Decodable { let message: String? }
        if let parsed = try? JSONDecoder().decode(ErrorBody.self, from: data), let message = parsed.message {
            return message
        }
        return String(data: data, encoding: .utf8) ?? "Request failed."
    }
}
