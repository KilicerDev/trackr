//
//  TKTabBar.swift
//  trackr-mobile-ios
//
//  Custom bottom bar: My week · Tickets · [+] · Tasks · Search. The
//  raised accent "+" opens the create sheet (ticket on the tickets tab,
//  task elsewhere). Secondary surfaces (inbox, projects, …) show the bar
//  with nothing highlighted, like the prototype.
//

import SwiftUI

struct TKTabBar: View {
    @Bindable var model: AppModel

    var body: some View {
        HStack(spacing: 0) {
            tab(.week)
            tab(.tickets)
            createButton
                .frame(width: 72)
            tab(.tasks)
            tab(.search)
        }
        .padding(.horizontal, 8)
        .padding(.top, 8)
        .frame(height: TK.tabBarHeight + 8)
        .frame(maxWidth: .infinity)
        .background {
            Rectangle()
                .fill(.ultraThinMaterial)
                .overlay(TK.bg.opacity(0.85))
                .ignoresSafeArea(edges: .bottom)
        }
        .overlay(alignment: .top) { TKHairline(color: TK.mono(0.07)) }
    }

    private func tab(_ tab: AppTab) -> some View {
        let active = model.selectedTab == tab
        return Button {
            model.go(tab)
        } label: {
            VStack(spacing: 4) {
                Image(systemName: tab.systemImage)
                    .font(.system(size: 21, weight: .regular))
                    .frame(height: 24)
                Text(tab.title)
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(active ? TK.accent : TK.text3)
            .frame(maxWidth: .infinity, minHeight: 48)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.title)
    }

    private var createButton: some View {
        Button {
            model.presentCreate()
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(TK.accent, in: .rect(cornerRadius: 18))
                .shadow(color: TK.accent.opacity(0.35), radius: 9, y: 6)
                .offset(y: -14)
        }
        .buttonStyle(TKScaleStyle())
        .accessibilityLabel("Create")
    }
}

// MARK: - Root chrome

/// Bottom chrome of a root surface: session mini bar (when running) above
/// the tab bar.
struct TKBottomChrome: View {
    @Bindable var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            if model.session.isRunning {
                TKSessionMiniBar(model: model)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 8)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            TKTabBar(model: model)
        }
        .animation(.easeOut(duration: 0.25), value: model.session.isRunning)
    }
}

extension View {
    /// Apply to the ROOT view inside a surface's NavigationStack: hides the
    /// system navigation bar, paints the page background, and adds the top
    /// bar + bottom tab bar as safe-area insets so pushed details cover
    /// them (prototype: details are full screen).
    func tkRootScreen(_ model: AppModel) -> some View {
        self
            .background(TK.bg)
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) { TKTopBar(model: model) }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                TKBottomChrome(model: model)
                    .ignoresSafeArea(.keyboard, edges: .bottom)
            }
    }

    /// Apply to pushed DETAIL screens: page background + styled inline nav
    /// bar (accent back button, no large title).
    func tkDetailScreen() -> some View {
        self
            .background(TK.bg)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(TK.bg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}

#Preview {
    VStack {
        Spacer()
        TKBottomChrome(model: AppModel())
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
