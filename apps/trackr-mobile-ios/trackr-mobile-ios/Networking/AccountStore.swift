//
//  AccountStore.swift
//  trackr-mobile-ios
//
//  The signed-in workspaces. One entry per trackr server the user has
//  signed in to on this device, plus which one is active. The bearer
//  token lives in the Keychain (KeychainStore, keyed by host); everything
//  else about a workspace — host, cached branding, last use — is here so
//  the switcher can list every workspace without touching the network.
//
//  Per-workspace preferences (favorites, list filters, the running timer)
//  are UserDefaults keys suffixed with `scopeKey(for:)` so two servers can
//  never share a project key, a filter or a timer.
//

import CryptoKit
import Foundation

nonisolated struct Account: Codable, Equatable, Identifiable {
    var host: URL
    /// Server branding name (GET /api/v1/instance), cached for the switcher.
    var name: String?
    /// Server branding logo, cached for the switcher. nil → the trackr bars.
    var logoURL: URL?
    /// False once the instance answered without a logo — distinguishes
    /// "no logo" from "never asked", which the logo slot shows as a spinner.
    var brandingKnown = false
    var lastUsed: Date = .now

    var id: String { host.absoluteString }

    /// Switcher label: branding name, else the host.
    var label: String {
        if let name, !name.isEmpty { return name }
        return host.host() ?? host.absoluteString
    }
}

nonisolated enum AccountStore {
    private static let accountsKey = "trackr.accounts"
    private static let activeKey = "trackr.activeHost"
    /// Pre-multi-workspace host key — read once by `migrateIfNeeded`, then
    /// kept as the sign-in prefill (it survives sign-out on purpose).
    private static let legacyHostKey = "trackr.serverURL"

    static var accounts: [Account] {
        get {
            guard let data = UserDefaults.standard.data(forKey: accountsKey),
                  let list = try? JSONDecoder().decode([Account].self, from: data)
            else { return [] }
            return list
        }
        set {
            let data = try? JSONEncoder().encode(newValue)
            UserDefaults.standard.set(data, forKey: accountsKey)
        }
    }

    static var activeHost: URL? {
        get { UserDefaults.standard.url(forKey: activeKey) }
        set { UserDefaults.standard.set(newValue, forKey: activeKey) }
    }

    static var active: Account? {
        guard let activeHost else { return nil }
        return account(for: activeHost)
    }

    static func account(for host: URL) -> Account? {
        accounts.first { $0.host == host }
    }

    /// Insert-or-replace by host, keeping the cached branding of an existing
    /// entry when the new one has none (a re-sign-in shouldn't blank the logo).
    static func upsert(_ account: Account) {
        var list = accounts
        var next = account
        if let index = list.firstIndex(where: { $0.host == account.host }) {
            let existing = list[index]
            if next.name == nil { next.name = existing.name }
            if !next.brandingKnown {
                next.logoURL = existing.logoURL
                next.brandingKnown = existing.brandingKnown
            }
            list[index] = next
        } else {
            list.append(next)
        }
        accounts = list
    }

    static func update(_ host: URL, _ change: (inout Account) -> Void) {
        var list = accounts
        guard let index = list.firstIndex(where: { $0.host == host }) else { return }
        change(&list[index])
        accounts = list
    }

    static func remove(_ host: URL) {
        accounts = accounts.filter { $0.host != host }
        if activeHost == host { activeHost = nil }
        for key in scopedKeys(for: host) {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }

    /// Host to prefill on the sign-in screen: the last one used, kept even
    /// after the last sign-out.
    static var lastHost: URL? {
        get { UserDefaults.standard.url(forKey: legacyHostKey) }
        set { UserDefaults.standard.set(newValue, forKey: legacyHostKey) }
    }

    // MARK: - Per-workspace keys

    /// Short host hash — the same one SnapshotStore folders use.
    static func scopeKey(for host: URL) -> String {
        let digest = SHA256.hash(data: Data(host.absoluteString.utf8))
        return digest.prefix(8).map { String(format: "%02x", $0) }.joined()
    }

    static func scoped(_ key: String, host: URL) -> String {
        "\(key).\(scopeKey(for: host))"
    }

    static let favoritesKey = "trackr.favoriteProjects"
    static let workSessionKey = "trackr.workSession"
    static let viewKeyPrefix = "trackr.view."

    private static func scopedKeys(for host: URL) -> [String] {
        let suffix = scopeKey(for: host)
        return UserDefaults.standard.dictionaryRepresentation().keys.filter {
            $0.hasPrefix("trackr.") && $0.hasSuffix(".\(suffix)")
        }
    }

    // MARK: - Migration

    private static let migratedKey = "trackr.accountsMigrated"

    /// Single-workspace install → one account. Runs once: the old host and
    /// token become the active account, and the app-wide favorites, filters,
    /// branding and timer move under that account's scope so nothing the
    /// user set up is lost.
    static func migrateIfNeeded() {
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: migratedKey) else { return }
        defaults.set(true, forKey: migratedKey)

        guard let host = defaults.url(forKey: legacyHostKey) else { return }
        guard let token = KeychainStore.legacyToken else { return }
        KeychainStore.setToken(token, for: host)
        KeychainStore.legacyToken = nil

        var account = Account(host: host)
        account.name = defaults.string(forKey: "trackr.workspaceName")
        if defaults.object(forKey: "trackr.workspaceLogo") != nil {
            account.logoURL = defaults.string(forKey: "trackr.workspaceLogo").flatMap { URL(string: $0) }
            account.brandingKnown = true
        }
        upsert(account)
        activeHost = host
        defaults.removeObject(forKey: "trackr.workspaceName")
        defaults.removeObject(forKey: "trackr.workspaceLogo")

        var moving = [favoritesKey, workSessionKey]
        moving += defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix(viewKeyPrefix) }
        for key in moving {
            guard let value = defaults.object(forKey: key) else { continue }
            defaults.set(value, forKey: scoped(key, host: host))
            defaults.removeObject(forKey: key)
        }
    }
}
