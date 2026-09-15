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
                    WorkspaceLogo(url: model.workspaceLogoURL, size: 20, barsHeight: 14)
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

/// Instance logo (server branding) with the trackr bars as fallback.
struct WorkspaceLogo: View {
    let url: URL?
    var size: CGFloat = 20
    var barsHeight: CGFloat = 14
    var radius: CGFloat = 5

    var body: some View {
        if let url {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: size, height: size)
                        .clipShape(.rect(cornerRadius: radius))
                } else {
                    BrandMarkBars(height: barsHeight)
                        .frame(width: size, height: size)
                }
            }
        } else {
            BrandMarkBars(height: barsHeight)
                .frame(width: size, height: size)
        }
    }
}

/// The four-bar logo used inline in the workspace button and tiles
/// (prototype: 3pt bars in violet / purple / red / teal).
struct BrandMarkBars: View {
    var height: CGFloat = 14

    private let bars: [(color: UInt32, scale: CGFloat)] = [
        (0x7C5CFF, 6 / 14), (0xA94CFF, 10 / 14), (0xFF3D5E, 1), (0x4CC3C3, 9 / 14),
    ]

    var body: some View {
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(Array(bars.enumerated()), id: \.offset) { _, bar in
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color(hex: bar.color))
                    .frame(width: 3, height: height * bar.scale)
            }
        }
        .frame(height: height, alignment: .bottom)
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
