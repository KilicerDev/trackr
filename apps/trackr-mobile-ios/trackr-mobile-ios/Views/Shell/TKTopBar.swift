//
//  TKTopBar.swift
//  trackr-mobile-ios
//
//  The shared top bar of every root surface: workspace button (brand mark +
//  name + switcher chevrons) on the left, inbox bell with the unread dot
//  and the account avatar on the right. Popovers it opens live in
//  AppShell so they can float above everything.
//

import SwiftUI

struct TKTopBar: View {
    @Bindable var model: AppModel

    static let height: CGFloat = 56

    var body: some View {
        HStack(spacing: 12) {
            Button {
                withAnimation(.easeOut(duration: 0.15)) { model.showingWorkspaces = true }
            } label: {
                HStack(spacing: 8) {
                    WorkspaceLogo(url: model.workspaceLogoURL, loaded: model.brandingLoaded, size: 20)
                    Text(model.workspaceLabel)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(TK.text)
                        .lineLimit(1)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(TK.text3)
                }
                .padding(.horizontal, 10)
                .frame(minHeight: 40)
                .background(TK.card, in: .rect(cornerRadius: TK.rToolbar))
                .overlay(RoundedRectangle(cornerRadius: TK.rToolbar).strokeBorder(TK.border, lineWidth: 1))
                .contentShape(.rect)
            }
            .buttonStyle(TKScaleStyle())

            Spacer(minLength: 8)

            Button {
                model.go(.inbox)
            } label: {
                Image(systemName: "bell")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(model.selectedTab == .inbox ? TK.accent : TK.text)
                    .frame(width: 40, height: 40)
                    .background(TK.card, in: .rect(cornerRadius: TK.rToolbar))
                    .overlay(RoundedRectangle(cornerRadius: TK.rToolbar).strokeBorder(TK.border, lineWidth: 1))
                    .overlay(alignment: .topTrailing) {
                        if model.unreadCount > 0 {
                            Circle()
                                .fill(TK.accent)
                                .frame(width: 8, height: 8)
                                .overlay(Circle().strokeBorder(TK.card, lineWidth: 2).padding(-2))
                                .padding(.top, 8)
                                .padding(.trailing, 9)
                        }
                    }
                    .contentShape(.rect)
            }
            .buttonStyle(TKScaleStyle())

            Button {
                withAnimation(.easeOut(duration: 0.15)) { model.showingAccountMenu = true }
            } label: {
                AvatarView(user: model.me, size: 40)
                    .overlay {
                        Text(model.me.initials)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white)
                    }
            }
            .buttonStyle(TKScaleStyle())
        }
        .padding(.horizontal, TK.gutter)
        .frame(height: Self.height)
        .background(TK.bg)
    }
}

/// Instance logo: the server's branding logo, a spinner until the instance
/// answered on first launch, and the trackr logo when no logo is set.
struct WorkspaceLogo: View {
    let url: URL?
    /// False until GET /api/v1/instance answered (or a cached value exists).
    var loaded = true
    var size: CGFloat = 20
    var radius: CGFloat = 5

    var body: some View {
        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .clipShape(.rect(cornerRadius: radius))
                    } else if phase.error != nil {
                        fallback
                    } else {
                        spinner
                    }
                }
            } else if loaded {
                fallback
            } else {
                spinner
            }
        }
        .frame(width: size, height: size)
    }

    private var fallback: some View {
        BrandMark(color: TK.accent)
            .frame(width: size * 0.75, height: size * 0.75)
    }

    private var spinner: some View {
        ProgressView()
            .controlSize(.mini)
            .tint(TK.text3)
    }
}

#Preview {
    VStack {
        TKTopBar(model: AppModel())
        Spacer()
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
