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

            BrandMark(color: .accentColor)
                .frame(width: 56)
            Text("trackr")
                .font(.system(size: 34, weight: .bold))
                .padding(.top, 14)
            Text("Sign in to your team's trackr instance.")
                .font(.system(size: 15))
                .foregroundStyle(.secondary)
                .padding(.top, 4)

            VStack(alignment: .leading, spacing: 8) {
                TextField("trackr.example.com", text: $auth.hostText)
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($hostFocused)
                    .submitLabel(.go)
                    .onSubmit { signIn() }
                    .padding(.horizontal, 16)
                    .frame(height: 52)
                    .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))

                if let errorMessage {
                    Text(errorMessage)
                        .font(.system(size: 13))
                        .foregroundStyle(Color(hex: 0xEF4F5E))
                        .padding(.horizontal, 4)
                }
            }
            .padding(.top, 36)

            Button {
                signIn()
            } label: {
                Group {
                    if isWorking {
                        ProgressView().tint(.white)
                    } else {
                        Text("Sign In")
                            .font(.system(size: 17, weight: .semibold))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.roundedRectangle(radius: 16))
            .disabled(isWorking || auth.hostText.trimmingCharacters(in: .whitespaces).isEmpty)
            .padding(.top, 12)

            Spacer()
            Spacer()

            Text("Your credentials are entered in the browser and never stored in the app.")
                .font(.system(size: 12))
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.bottom, 18)
        }
        .padding(.horizontal, 28)
        .background(Color(.systemGroupedBackground))
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
}
