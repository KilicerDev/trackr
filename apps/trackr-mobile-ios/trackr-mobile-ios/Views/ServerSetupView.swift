//
//  ServerSetupView.swift
//  trackr-mobile-ios
//
//  First-launch host entry + browser sign-in. trackr is self-hosted, so the
//  user types their instance's domain; after the /api/v1/instance probe
//  confirms a trackr server, login happens in the system browser
//  (ASWebAuthenticationSession) and comes back via the
//  dev.kilicer.trackr://auth deep link.
//

import AuthenticationServices
import SwiftUI

struct ServerSetupView: View {
    @Bindable var auth: AuthSession
    @Environment(\.webAuthenticationSession) private var webAuth

    @State private var isWorking = false
    @State private var errorMessage: String?
    @FocusState private var hostFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            BrandMark(color: TK.accent)
                .frame(width: 56)
            Text("trackr")
                .font(.system(size: 34, weight: .bold))
                .tkTitleTracking()
                .foregroundStyle(TK.text)
                .padding(.top, 14)
            Text("Sign in to your team's trackr instance.")
                .font(.system(size: 15))
                .foregroundStyle(TK.text2)
                .padding(.top, 4)

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    Image(systemName: "globe")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(TK.text3)
                    TextField("trackr.example.com", text: $auth.hostText)
                        .font(.system(size: 16))
                        .foregroundStyle(TK.text)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($hostFocused)
                        .submitLabel(.go)
                        .onSubmit { signIn() }
                }
                .padding(.horizontal, 14)
                .frame(height: 48)
                .background(TK.card, in: .rect(cornerRadius: TK.rInput))
                .overlay(
                    RoundedRectangle(cornerRadius: TK.rInput)
                        .strokeBorder(hostFocused ? TK.borderDashed : TK.borderInput, lineWidth: 1)
                )

                if let errorMessage {
                    Text(errorMessage)
                        .font(.system(size: 13))
                        .foregroundStyle(TK.danger)
                        .padding(.horizontal, 4)
                }
            }
            .padding(.top, 36)

            Spacer()
            Spacer()

            // Sign-in pinned to the bottom, sized like a standard iOS primary
            // action (50pt, compact radius) rather than a full-height slab.
            ZStack {
                TKPrimaryButton(title: isWorking ? " " : "Sign in", enabled: canSignIn, action: signIn)
                if isWorking {
                    ProgressView().tint(.white)
                }
            }

            Text("Your credentials are entered in the browser and never stored in the app.")
                .font(.system(size: 12))
                .foregroundStyle(TK.text4)
                .multilineTextAlignment(.center)
                .padding(.top, 14)
                .padding(.bottom, 12)
        }
        .padding(.horizontal, 24)
        .background(TK.bg.ignoresSafeArea())
    }

    private var canSignIn: Bool {
        !isWorking && !auth.hostText.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func signIn() {
        guard !isWorking else { return }
        errorMessage = nil
        isWorking = true
        hostFocused = false
        Task {
            defer { isWorking = false }
            do {
                let (base, login) = try await auth.prepareSignIn(host: auth.hostText)
                let callback = try await webAuth.authenticate(
                    using: login,
                    callbackURLScheme: AuthSession.callbackScheme
                )
                try await auth.completeSignIn(callbackURL: callback, base: base)
            } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
                // User closed the sheet — not an error worth surfacing.
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

#Preview {
    ServerSetupView(auth: AuthSession())
        .preferredColorScheme(.dark)
}
