//
//  WikiPageView.swift
//  trackr-mobile-ios
//
//  A wiki article rendered natively via RichContentView. The document's
//  own h1 is the title, so the chrome stays minimal: update info on top,
//  content below. Read-only (editing is desktop-only for now).
//

import SwiftUI

struct WikiPageView: View {
    let page: WikiPageItem
    var model: AppModel? = nil

    /// Live copy so the fetched body swaps in when it lands.
    private var current: WikiPageItem {
        model?.wikiPages.first { $0.id == page.id } ?? page
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 6) {
                    Image(systemName: current.icon)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.accentColor)
                    Text(updateLine)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                RichContentView(html: current.bodyHtml)
            }
            .padding(16)
            .padding(.bottom, 16)
        }
        .background(Color.webBackground)
        .onAppear {
            // The tree payload has no bodies — fetch this page's on open.
            Task { await model?.sync?.loadWikiBody(id: page.id) }
        }
        .navigationTitle(current.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var updateLine: String {
        if let updatedBy = current.updatedBy {
            return "Updated \(current.updatedAt.relativeShort) by \(updatedBy.name)"
        }
        return "Updated \(current.updatedAt.relativeShort)"
    }
}

#Preview {
    NavigationStack {
        WikiPageView(page: WikiPageItem.samples[3])
    }
}
