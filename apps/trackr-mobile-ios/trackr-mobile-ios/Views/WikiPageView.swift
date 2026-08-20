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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 6) {
                    Image(systemName: page.icon)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.accentColor)
                    Text(updateLine)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                RichContentView(html: page.bodyHtml)
            }
            .padding(16)
            .padding(.bottom, 16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(page.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var updateLine: String {
        if let updatedBy = page.updatedBy {
            return "Updated \(page.updatedAt.relativeShort) by \(updatedBy.name)"
        }
        return "Updated \(page.updatedAt.relativeShort)"
    }
}

#Preview {
    NavigationStack {
        WikiPageView(page: WikiPageItem.samples[3])
    }
}
