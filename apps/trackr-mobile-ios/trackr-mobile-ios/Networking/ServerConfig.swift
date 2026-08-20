//
//  ServerConfig.swift
//  trackr-mobile-ios
//
//  The user-typed server host. trackr is self-hostable, so there is no
//  default — the app asks for a domain on first launch and validates it
//  against GET /api/v1/instance before offering login.
//

import Foundation

enum ServerConfig {
    private static let hostKey = "trackr.serverURL"

    /// Persisted after a *successful* sign-in only, and kept on sign-out so
    /// the field is prefilled next time.
    static var savedHost: URL? {
        get { UserDefaults.standard.url(forKey: hostKey) }
        set { UserDefaults.standard.set(newValue, forKey: hostKey) }
    }

    /// Mirror of the web repo's server-url.ts normalization: bare hosts get
    /// https://, trailing slashes are stripped, a base path is kept, and the
    /// result must be http(s) with a hostname.
    static func normalize(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") { text = "https://\(text)" }
        while text.hasSuffix("/") { text.removeLast() }
        guard
            let url = URL(string: text),
            let scheme = url.scheme?.lowercased(),
            scheme == "http" || scheme == "https",
            url.host() != nil
        else { return nil }
        return url
    }
}
