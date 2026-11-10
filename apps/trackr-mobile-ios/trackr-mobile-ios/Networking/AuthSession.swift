//
//  AuthSession.swift
//  trackr-mobile-ios
//
//  Sign-in state machine. Flow (server contract, see web auth.ts):
//    1. user types a host → GET /api/v1/instance must answer name == "trackr"
//    2. open {host}/login?client=native in ASWebAuthenticationSession
//    3. the login POST 303s to dev.kilicer.trackr://auth?token=<signed token>
//    4. validate via /api/auth/get-session (200 + literal `null` = dead),
//       then persist the account (AccountStore) + token (Keychain)
//
//  Several workspaces can be signed in at once (AccountStore); exactly one
//  is active and owns `client`. Switching activates another stored token
//  without a browser round-trip. RootView rebuilds the shell whenever
//  `serverURL` changes.
//
//  Tokens live 7 days sliding — any authenticated request extends them, and
//  every rotated `set-auth-token` header is adopted centrally in APIClient.
//

import Foundation
import SwiftUI

@Observable @MainActor
final class AuthSession {
    enum Phase {
        case launching
        case signedOut
        case ready
    }

    static let callbackScheme = "dev.kilicer.trackr"

    private(set) var phase: Phase = .launching
    private(set) var client: APIClient?
    private(set) var serverURL: URL?
    /// Every signed-in workspace, most recently used first. Mirrors
    /// AccountStore so the switcher re-renders on changes.
    private(set) var accounts: [Account] = []

    /// Sign-in prefill: the last host used, kept across sign-out on purpose.
    var lastHost: String { AccountStore.lastHost?.absoluteString ?? "" }
    /// Wired by RootView: runs against a non-active workspace's client
    /// before its token is revoked (push deregistration).
    var onRevoke: ((APIClient) async -> Void)?

    /// Whether a stored token exists for the workspace — false after the
    /// server rejected it (401), when the switcher offers "Sign in again".
    func hasToken(for host: URL) -> Bool {
        KeychainStore.token(for: host) != nil
    }

    // MARK: - Sign-in

    /// Builds the login URL for the given raw host after probing that a
    /// trackr instance answers there. Returns the normalized base URL and the
    /// login URL the web-auth session should open.
    func prepareSignIn(host raw: String) async throws -> (base: URL, login: URL) {
        guard let base = ServerConfig.normalize(raw) else { throw APIError.invalidURL }
        let probe = APIClient(baseURL: base, token: nil)
        let instance: API.Instance
        do {
            instance = try await probe.instance()
        } catch {
            throw APIError.notATrackrServer
        }
        guard instance.name == "trackr" else { throw APIError.notATrackrServer }
        var login = base.appending(path: "/login")
        login.append(queryItems: [URLQueryItem(name: "client", value: "native")])
        return (base, login)
    }

    /// Completes sign-in with the deep-link callback the browser returned.
    /// The new workspace becomes active; any other signed-in workspace stays.
    func completeSignIn(callbackURL: URL, base: URL) async throws {
        guard
            let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
            let token = components.queryItems?.first(where: { $0.name == "token" })?.value,
            !token.isEmpty
        else { throw APIError.unauthorized }

        let candidate = APIClient(baseURL: base, token: token)
        guard (try? await candidate.validateSession()) == true else {
            throw APIError.unauthorized
        }

        // Only a validated token persists the account.
        KeychainStore.setToken(await candidate.currentToken() ?? token, for: base)
        AccountStore.upsert(Account(host: base))
        AccountStore.lastHost = base
        await activate(client: candidate, base: base)
    }

    // MARK: - Launch

    /// Launch/restore: active account + token → activate right away so the
    /// shell paints from the snapshot cache, then probe the session in the
    /// background. Only a definitive "dead" answer (401 or null session)
    /// drops the token; a network error or a slow server keeps it.
    ///
    /// Gating the UI on the probe made cold starts hang on the spinner
    /// whenever the first connection stalled (60 s default timeout) — and
    /// bought nothing, since the client's 401 hook catches a dead token on
    /// the first data request anyway.
    func restore() async {
        AccountStore.migrateIfNeeded()
        reloadAccounts()
        // The active account may have lost its token (401 last time) —
        // fall back to any workspace that still has one.
        let host = AccountStore.activeHost.flatMap { hasToken(for: $0) ? $0 : nil }
            ?? accounts.first { hasToken(for: $0.host) }?.host
        guard let host, let token = KeychainStore.token(for: host) else {
            phase = .signedOut
            return
        }
        await activate(client: APIClient(baseURL: host, token: token), base: host)
        probeInBackground(client: client, host: host)
    }

    /// Short leash for the launch probe: it runs behind the UI, so a stall
    /// should give up quickly rather than hold a connection for a minute.
    private static let probeTimeout: TimeInterval = 8

    private func probeInBackground(client: APIClient?, host: URL) {
        guard let client else { return }
        Task { [weak self] in
            do {
                if try await client.validateSession(timeout: Self.probeTimeout) == false {
                    self?.forgetSession(host: host)
                }
            } catch APIError.unauthorized {
                self?.forgetSession(host: host)
            } catch {
                // Offline or slow — keep the session; the 401 hook covers a
                // token that actually died.
            }
        }
    }

    // MARK: - Switching

    /// Activates another signed-in workspace from its stored token. Returns
    /// false when that workspace has no token (it needs a fresh sign-in);
    /// the caller then opens the sign-in sheet prefilled with the host.
    @discardableResult
    func switchTo(_ host: URL) async -> Bool {
        guard host != serverURL else { return true }
        guard let token = KeychainStore.token(for: host) else { return false }
        let candidate = APIClient(baseURL: host, token: token)
        AccountStore.lastHost = host
        await activate(client: candidate, base: host)
        probeInBackground(client: candidate, host: host)
        return true
    }

    // MARK: - Sign-out

    /// Signs out of the active workspace. If another workspace is signed
    /// in, it becomes active; otherwise the app returns to the sign-in
    /// screen.
    func signOut() async {
        guard let host = serverURL else { return }
        if let client {
            await client.signOutRemote()
        }
        await signOut(of: host)
    }

    /// Signs out of any workspace, active or not. Non-active workspaces are
    /// revoked server-side with their stored token when possible.
    func signOut(of host: URL) async {
        if host != serverURL, let token = KeychainStore.token(for: host) {
            let client = APIClient(baseURL: host, token: token)
            await onRevoke?(client)
            await client.signOutRemote()
        }
        KeychainStore.setToken(nil, for: host)
        AccountStore.remove(host)
        SnapshotStore(host: host).clear()
        reloadAccounts()
        guard host == serverURL else { return }
        client = nil
        serverURL = nil
        if let next = accounts.first(where: { hasToken(for: $0.host) }) {
            await switchTo(next.host)
        } else {
            phase = .signedOut
        }
    }

    /// Wired to APIClient's 401 hook — the token died server-side. The
    /// workspace stays listed so the user can sign in to it again from the
    /// switcher; only its token goes.
    func forgetSession(host: URL) {
        KeychainStore.setToken(nil, for: host)
        reloadAccounts()
        guard host == serverURL else { return }
        client = nil
        serverURL = nil
        if let next = accounts.first(where: { hasToken(for: $0.host) }) {
            Task { await switchTo(next.host) }
        } else {
            phase = .signedOut
        }
    }

    // MARK: - Private

    private func activate(client: APIClient, base: URL) async {
        await client.setCallbacks(
            onTokenRefresh: { fresh in
                // Keychain writes are cheap and thread-safe.
                KeychainStore.setToken(fresh, for: base)
            },
            onUnauthorized: { [weak self] in
                let session = self
                Task { @MainActor in session?.forgetSession(host: base) }
            }
        )
        AccountStore.activeHost = base
        AccountStore.update(base) { $0.lastUsed = .now }
        reloadAccounts()
        self.client = client
        self.serverURL = base
        phase = .ready
    }

    func reloadAccounts() {
        accounts = AccountStore.accounts.sorted { $0.lastUsed > $1.lastUsed }
    }
}
