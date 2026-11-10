//
//  TKPopovers.swift
//  trackr-mobile-ios
//
//  The two top-bar popovers: the workspace switcher (top-left) and the
//  account menu (top-right). Both are anchored panels over a dimmed page,
//  drawn by AppShell above every surface.
//

import SwiftUI

// MARK: - Panel chrome

/// Dim backdrop + anchored panel. `alignment` picks the corner under the
/// top bar the panel hangs from.
struct TKPopoverPanel<Content: View>: View {
    @Binding var isPresented: Bool
    var alignment: Alignment = .topLeading
    var width: CGFloat = 300
    @ViewBuilder var content: Content

    var body: some View {
        ZStack(alignment: alignment) {
            Color.black.opacity(0.35)
                .ignoresSafeArea()
                .onTapGesture { close() }
            VStack(alignment: .leading, spacing: 2) {
                content
            }
            .padding(6)
            .frame(width: width)
            .background(TK.popover, in: .rect(cornerRadius: TK.rPanel))
            .overlay(RoundedRectangle(cornerRadius: TK.rPanel).strokeBorder(TK.borderStrong, lineWidth: 1))
            .shadow(color: .black.opacity(0.55), radius: 25, y: 20)
            .padding(.horizontal, TK.gutter)
            .padding(.top, TKTopBar.height + 4)
            .transition(.scale(scale: 0.96, anchor: alignment == .topLeading ? .topLeading : .topTrailing)
                .combined(with: .opacity))
        }
    }

    private func close() {
        withAnimation(.easeOut(duration: 0.15)) { isPresented = false }
    }
}

/// Menu row: 18pt icon column, label, optional mono count.
struct TKMenuRow: View {
    let label: String
    var systemImage: String
    var count: Int? = nil
    var color: Color = TK.text
    var highlighted = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 16, weight: .medium))
                    .frame(width: 20)
                Text(label)
                    .font(.system(size: 15))
                Spacer()
                if let count {
                    Text("\(count)")
                        .font(.tkMono(12))
                        .foregroundStyle(TK.text3)
                }
            }
            .foregroundStyle(highlighted ? TK.accent : color)
            .padding(.horizontal, 10)
            .frame(height: 46)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(highlighted ? TK.accentSoft : .clear, in: .rect(cornerRadius: 12))
            .contentShape(.rect)
        }
        .buttonStyle(TKPressStyle(radius: 12))
    }
}

// MARK: - Workspace switcher

/// Every signed-in workspace (AuthSession.accounts), the active one
/// checked. Tapping another switches to it from its stored token; a
/// workspace whose token expired offers "Sign in again"; long-press signs
/// out of any of them. "Add workspace" opens the sign-in sheet.
struct WorkspaceSwitcher: View {
    @Bindable var model: AppModel
    /// nil in previews — the list then shows the model's workspace only.
    var auth: AuthSession? = nil
    @State private var signOutTarget: Account?

    private var accounts: [Account] {
        if let auth, !auth.accounts.isEmpty { return auth.accounts }
        return [Account(host: ServerConfig.savedHost ?? URL(string: "https://sample.data")!,
                        name: model.workspaceLabel, logoURL: model.workspaceLogoURL,
                        brandingKnown: model.brandingLoaded)]
    }

    private var activeHost: URL? { auth?.serverURL ?? ServerConfig.savedHost }

    var body: some View {
        TKPopoverPanel(isPresented: $model.showingWorkspaces, alignment: .topLeading) {
            TKSectionLabel("Workspaces")
                .padding(.horizontal, 12)
                .padding(.top, 10)
                .padding(.bottom, 6)

            ForEach(accounts) { account in
                row(account)
            }

            TKHairline(color: TK.border)
                .padding(.horizontal, 6)
                .padding(.vertical, 4)

            Button {
                model.showingWorkspaces = false
                model.addWorkspacePrefill = ""
                model.showingAddWorkspace = true
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "plus")
                        .font(.system(size: 16))
                        .foregroundStyle(TK.text2)
                        .frame(width: 34, height: 34)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .strokeBorder(TK.mono(0.25), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        )
                    Text("Add workspace")
                        .font(.system(size: 15))
                        .foregroundStyle(TK.text)
                    Spacer()
                }
                .padding(.horizontal, 10)
                .frame(minHeight: 48)
                .contentShape(.rect)
            }
            .buttonStyle(TKPressStyle(radius: 12))
        }
        .alert(
            "Sign out of \(signOutTarget?.label ?? "workspace")?",
            isPresented: Binding(get: { signOutTarget != nil }, set: { if !$0 { signOutTarget = nil } })
        ) {
            Button("Cancel", role: .cancel) {}
            Button("Sign out", role: .destructive) {
                guard let target = signOutTarget else { return }
                signOutTarget = nil
                if target.host == activeHost {
                    model.showingWorkspaces = false
                    model.onSignOut?()
                } else {
                    Task { await auth?.signOut(of: target.host) }
                }
            }
        } message: {
            Text("You can sign back in any time.")
        }
    }

    private func row(_ account: Account) -> some View {
        let isActive = account.host == activeHost
        let needsSignIn = auth.map { !$0.hasToken(for: account.host) } ?? false
        // The active workspace's branding is live on the model; the others
        // show what their last session cached.
        let logo = isActive ? model.workspaceLogoURL : account.logoURL
        let loaded = isActive ? model.brandingLoaded : (account.brandingKnown || account.name != nil)
        return Button {
            select(account, needsSignIn: needsSignIn)
        } label: {
            HStack(spacing: 12) {
                // Logo sits inset in the tile so its own edges never fight the
                // tile's; no tile background when the instance has a logo.
                WorkspaceLogo(url: logo, loaded: loaded, size: 24, radius: 6)
                    .frame(width: 34, height: 34)
                    .opacity(needsSignIn ? 0.5 : 1)
                VStack(alignment: .leading, spacing: 1) {
                    Text(isActive ? model.workspaceLabel : account.label)
                        .font(.system(size: 15, weight: isActive ? .semibold : .regular))
                        .foregroundStyle(TK.text)
                        .lineLimit(1)
                    Text(needsSignIn ? "Signed out · tap to sign in" : (account.host.host() ?? account.host.absoluteString))
                        .font(.system(size: 12))
                        .foregroundStyle(needsSignIn ? TK.accent : TK.text3)
                        .lineLimit(1)
                }
                Spacer()
                if isActive {
                    Image(systemName: "checkmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(TK.accent)
                }
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 52)
            .background(isActive ? TK.mono(0.05) : .clear, in: .rect(cornerRadius: 12))
            .contentShape(.rect)
        }
        .buttonStyle(TKPressStyle(radius: 12))
        .contextMenu {
            if auth != nil {
                Button(role: .destructive) {
                    signOutTarget = account
                } label: {
                    Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        }
    }

    private func select(_ account: Account, needsSignIn: Bool) {
        model.showingWorkspaces = false
        guard let auth, account.host != activeHost else { return }
        if needsSignIn {
            model.addWorkspacePrefill = account.host.absoluteString
            model.showingAddWorkspace = true
            return
        }
        Task {
            if await !auth.switchTo(account.host) {
                model.addWorkspacePrefill = account.host.absoluteString
                model.showingAddWorkspace = true
            }
        }
    }
}

// MARK: - Account menu

struct AccountMenu: View {
    @Bindable var model: AppModel

    var body: some View {
        TKPopoverPanel(isPresented: $model.showingAccountMenu, alignment: .topTrailing, width: 260) {
            HStack(spacing: 12) {
                AvatarView(user: model.me, size: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text(model.me.name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(TK.text)
                        .lineLimit(1)
                    Text(model.currentUserEmail)
                        .font(.system(size: 12))
                        .foregroundStyle(TK.text3)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 10)
            .padding(.bottom, 12)
            .overlay(alignment: .bottom) { TKHairline(color: TK.border) }
            .padding(.bottom, 4)

            TKMenuRow(label: "Projects", systemImage: AppTab.projects.systemImage,
                      count: model.projects.count { $0.status == .active },
                      highlighted: model.selectedTab == .projects) { model.go(.projects) }
            TKMenuRow(label: "Chat", systemImage: AppTab.chat.systemImage,
                      count: model.chatThreads.count(where: \.unread),
                      highlighted: model.selectedTab == .chat) { model.go(.chat) }
            TKMenuRow(label: "Notes", systemImage: AppTab.notes.systemImage,
                      highlighted: model.selectedTab == .notes) { model.go(.notes) }
            TKMenuRow(label: "Meetings", systemImage: AppTab.meetings.systemImage,
                      highlighted: model.selectedTab == .meetings) { model.go(.meetings) }
            TKMenuRow(label: "Wiki", systemImage: AppTab.wiki.systemImage,
                      highlighted: model.selectedTab == .wiki) { model.go(.wiki) }
            TKMenuRow(label: "Account settings", systemImage: AppTab.settings.systemImage,
                      highlighted: model.selectedTab == .settings) { model.go(.settings) }
            TKMenuRow(label: "Sign out", systemImage: "rectangle.portrait.and.arrow.right",
                      color: TK.accent) {
                model.showingAccountMenu = false
                model.onSignOut?()
            }
        }
    }
}

#Preview("Workspaces") {
    let model = AppModel()
    model.showingWorkspaces = true
    return ZStack {
        TK.bg.ignoresSafeArea()
        WorkspaceSwitcher(model: model)
    }
    .preferredColorScheme(.dark)
}

#Preview("Account") {
    let model = AppModel()
    model.showingAccountMenu = true
    return ZStack {
        TK.bg.ignoresSafeArea()
        AccountMenu(model: model)
    }
    .preferredColorScheme(.dark)
}
