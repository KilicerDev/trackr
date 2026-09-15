//
//  WikiPageView.swift
//  trackr-mobile-ios
//
//  A wiki article as a detail screen: mono breadcrumb, 22pt title, mono
//  update line, then the document via RichContentView (its own leading
//  h1 is dropped — the title above is the same text). Read-only (editing
//  is desktop-only for now).
//

import SwiftUI

struct WikiPageView: View {
    let page: WikiPageItem
    var model: AppModel? = nil

    /// Live copy so the fetched body swaps in when it lands.
    private var current: WikiPageItem {
        model?.wikiPages.first { $0.id == page.id } ?? page
    }

    private var breadcrumb: [String] {
        current.breadcrumb(in: model?.wikiPages ?? WikiPageItem.samples)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                if !breadcrumb.isEmpty {
                    Text((breadcrumb + [""]).joined(separator: " / "))
                        .font(.tkMono(11))
                        .foregroundStyle(TK.text3)
                        .lineLimit(1)
                }
                HStack(alignment: .top, spacing: 12) {
                    TKIconTile(systemImage: current.icon, size: 36, color: TK.accent, fill: TK.accentSoft)
                    Text(current.title)
                        .font(.tkDetailTitle)
                        .tkTitleTracking()
                        .foregroundStyle(TK.text)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 4)
                }
                Text(updateLine)
                    .font(.tkMono(11))
                    .foregroundStyle(TK.text3)
                    .padding(.top, 2)
                TKHairline(color: TK.border)
                    .padding(.vertical, 8)
                RichContentView(html: current.bodyHtml, hidesLeadingHeading: true)
            }
            .padding(.horizontal, TK.gutter)
            .padding(.top, 10)
            .padding(.bottom, 32)
        }
        .tkDetailScreen()
        .onAppear {
            // The tree payload has no bodies — fetch this page's on open.
            Task { await model?.sync?.loadWikiBody(id: page.id) }
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: 6) {
                    Image(systemName: "book")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(TK.text3)
                    Text("Wiki")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(TK.text2)
                }
            }
        }
    }

    private var updateLine: String {
        if let updatedBy = current.updatedBy {
            return "updated \(current.updatedAt.relativeShort) · \(updatedBy.name)"
        }
        return "updated \(current.updatedAt.relativeShort)"
    }
}

#Preview {
    NavigationStack {
        WikiPageView(page: WikiPageItem.samples[3])
    }
    .preferredColorScheme(.dark)
}
