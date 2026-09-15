//
//  AuthSession.swift
//  trackr-mobile-ios
//
//  Sign-in state machine. Flow (server contract, see web auth.ts):
//    1. user types a host → GET /api/v1/instance must answer name == "trackr"
//    2. open {host}/login?client=native in ASWebAuthenticationSession
//    3. the login POST 303s to dev.kilicer.trackr://auth?token=<signed token>
//    4. validate via /api/auth/get-session (200 + literal `null` = dead),
//       then persist host (UserDefaults) + token (Keychain)
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
    /// Prefill for the host field — survives sign-out on purpose.
    var hostText: String = ServerConfig.savedHost?.absoluteString ?? ""

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

        // Only a validated token persists the host.
        ServerConfig.savedHost = base
        KeychainStore.token = await candidate.currentToken() ?? token
        await activate(client: candidate, base: base)
    }

    /// Launch/restore: stored host + token → activate right away so the
    /// shell paints from the snapshot cache, then probe the session in the
    /// background. Only a definitive "dead" answer (401 or null session)
    /// signs out; a network error or a slow server keeps the token.
    ///
    /// Gating the UI on the probe made cold starts hang on the spinner
    /// whenever the first connection stalled (60 s default timeout) — and
    /// bought nothing, since the client's 401 hook catches a dead token on
    /// the first data request anyway.
    func restore() async {
        guard let base = ServerConfig.savedHost, let token = KeychainStore.token else {
            phase = .signedOut
            return
        }
        let candidate = APIClient(baseURL: base, token: token)
        await activate(client: candidate, base: base)
        Task { [weak self] in
            do {
                if try await candidate.validateSession(timeout: Self.probeTimeout) == false {
                    self?.forgetSession()
                }
            } catch APIError.unauthorized {
                self?.forgetSession()
            } catch {
                // Offline or slow — keep the session; the 401 hook covers a
                // token that actually died.
            }
        }
    }

    /// Short leash for the launch probe: it runs behind the UI, so a stall
    /// should give up quickly rather than hold a connection for a minute.
    private static let probeTimeout: TimeInterval = 8

    func signOut() async {
        if let client {
            await client.signOutRemote()
        }
        KeychainStore.token = nil
        client = nil
        serverURL = nil
        hostText = ServerConfig.savedHost?.absoluteString ?? ""
        phase = .signedOut
    }

    /// Wired to APIClient's 401 hook — the token died server-side.
    func forgetSession() {
        KeychainStore.token = nil
        client = nil
        serverURL = nil
        phase = .signedOut
    }

    private func activate(client: APIClient, base: URL) async {
        await client.setCallbacks(
            onTokenRefresh: { fresh in
                // Keychain writes are cheap and thread-safe.
                KeychainStore.token = fresh
            },
            onUnauthorized: { [weak self] in
                let session = self
                Task { @MainActor in session?.forgetSession() }
            }
        )
        self.client = client
        self.serverURL = base
        self.hostText = base.absoluteString
        phase = .ready
    }
}
