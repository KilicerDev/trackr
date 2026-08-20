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

    /// Launch/restore: stored host + token → probe the session. A network
    /// error keeps the token for next launch; a definitive "dead" answer
    /// (401 or null session) drops it.
    func restore() async {
        guard let base = ServerConfig.savedHost, let token = KeychainStore.token else {
            phase = .signedOut
            return
        }
        let candidate = APIClient(baseURL: base, token: token)
        do {
            if try await candidate.validateSession() {
                await activate(client: candidate, base: base)
            } else {
                KeychainStore.token = nil
                phase = .signedOut
            }
        } catch APIError.unauthorized {
            KeychainStore.token = nil
            phase = .signedOut
        } catch {
            // Offline — trust the stored token so cached data still shows;
            // any later authenticated 401 signs out via the client hook.
            await activate(client: candidate, base: base)
        }
    }

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
                Task { @MainActor in self?.forgetSession() }
            }
        )
        self.client = client
        self.serverURL = base
        self.hostText = base.absoluteString
        phase = .ready
    }
}
