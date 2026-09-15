//
//  WikiView.swift
//  trackr-mobile-ios
//
//  The wiki page tree as a flat, hairline-separated list: folder rows
//  (chevron + folder tile + bold title + mono count) expand in place,
//  page rows (doc tile · title · mono updated · chevron) push the
//  article. The search field flattens to matching pages with their
//  breadcrumb. Owns the wiki navigation stack.
//

import SwiftUI

struct WikiView: View {
    @Bindable var model: AppModel
    @State private var search = ""
    @State private var collapsed: Set<String> = []
    @State private var openedFirst = false

    private struct Row: Identifiable {
        let page: WikiPageItem
        let depth: Int
        let childCount: Int
        var id: String { page.id }
    }

    private var pageCount: Int { model.wikiPages.filter { !$0.isFolder }.count }

    private func children(of parentId: String?) -> [WikiPageItem] {
        model.wikiPages
            .filter { $0.parentId == parentId }
            .sorted { ($0.sortOrder, $0.title) < ($1.sortOrder, $1.title) }
    }

    /// Depth-first flattening of the tree, skipping collapsed folders.
    private var rows: [Row] {
        var out: [Row] = []
        func walk(_ parentId: String?, depth: Int) {
            for page in children(of: parentId) {
                let kids = page.isFolder ? children(of: page.id) : []
                out.append(Row(page: page, depth: depth, childCount: kids.count))
                if page.isFolder, !collapsed.contains(page.id) {
                    walk(page.id, depth: depth + 1)
                }
            }
        }
        walk(nil, depth: 0)
        return out
    }

    private var searchResults: [WikiPageItem] {
        model.wikiPages.filter {
            !$0.isFolder && $0.title.localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        NavigationStack(path: $model.wikiPath) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    TKPageHeader("Wiki", meta: "\(pageCount) pages")
                    TKSearchField(text: $search, placeholder: "Search wiki", height: 42)
                        .padding(.horizontal, TK.gutter)
                        .padding(.top, 6)
                        .padding(.bottom, 12)
                    if search.isEmpty {
                        if rows.isEmpty {
                            TKEmptyState(text: "No wiki pages yet.")
                        }
                        ForEach(rows) { row in
                            if row.page.isFolder {
                                folderRow(row)
                            } else {
                                pageRow(row.page, depth: row.depth, breadcrumb: nil)
                            }
                        }
                    } else {
                        if searchResults.isEmpty {
                            TKEmptyState(text: "No pages match “\(search)”.")
                        }
                        ForEach(searchResults) { page in
                            pageRow(page, depth: 0,
                                    breadcrumb: page.breadcrumb(in: model.wikiPages).joined(separator: " / "))
                        }
                    }
                }
                .padding(.bottom, 24)
            }
            .tkRootScreen(model)
            .refreshable { await model.sync?.refreshWiki() }
            .navigationDestination(for: WikiPageItem.self) { page in
                WikiPageView(page: page, model: model)
            }
            .onAppear(perform: openFirstIfAsked)
        }
    }

    // MARK: - Rows

    private func folderRow(_ row: Row) -> some View {
        let isCollapsed = collapsed.contains(row.page.id)
        return Button {
            withAnimation(.snappy(duration: 0.2)) {
                if isCollapsed { collapsed.remove(row.page.id) } else { collapsed.insert(row.page.id) }
            }
        } label: {
            HStack(spacing: 10) {
                TKChevron()
                    .rotationEffect(.degrees(isCollapsed ? -90 : 0))
                    .frame(width: 12)
                TKIconTile(systemImage: isCollapsed ? "folder" : "folder",
                           color: TK.accent, fill: TK.accentSoft)
                Text(row.page.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(TK.text)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text("\(row.childCount)")
                    .font(.tkMono(12))
                    .foregroundStyle(TK.text3)
            }
            .padding(.leading, TK.gutter + CGFloat(row.depth) * 20)
            .padding(.trailing, TK.gutter)
            .padding(.vertical, 12)
            .frame(minHeight: 48)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .top) { TKHairline() }
            .contentShape(.rect)
        }
        .buttonStyle(TKPressStyle())
    }

    private func pageRow(_ page: WikiPageItem, depth: Int, breadcrumb: String?) -> some View {
        NavigationLink(value: page) {
            HStack(spacing: 10) {
                if depth > 0 || breadcrumb == nil {
                    Color.clear.frame(width: 12, height: 1)
                }
                TKIconTile(systemImage: "doc.text")
                VStack(alignment: .leading, spacing: 2) {
                    Text(page.title)
                        .font(.system(size: 15))
                        .foregroundStyle(TK.text)
                        .lineLimit(1)
                    if let breadcrumb, !breadcrumb.isEmpty {
                        Text(breadcrumb)
                            .font(.tkMono(11))
                            .foregroundStyle(TK.text4)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                Text(page.updatedAt.relativeShort)
                    .font(.tkMono(11))
                    .foregroundStyle(TK.text4)
                TKDisclosure()
            }
            .padding(.leading, TK.gutter + CGFloat(depth) * 20)
            .padding(.trailing, TK.gutter)
            .padding(.vertical, 12)
            .frame(minHeight: 48)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .top) { TKHairline() }
            .contentShape(.rect)
        }
        .buttonStyle(TKPressStyle())
    }

    /// `--open-first` launch argument (simulator screenshots): push the
    /// longest sample page.
    private func openFirstIfAsked() {
        guard !openedFirst, ProcessInfo.processInfo.arguments.contains("--open-first"),
              model.wikiPath.isEmpty else { return }
        openedFirst = true
        let pages = model.wikiPages.filter { !$0.isFolder }
        let nested = pages.filter { $0.parentId != nil }
        if let page = (nested.isEmpty ? pages : nested).max(by: { $0.bodyHtml.count < $1.bodyHtml.count }) {
            // Deferred: a path push during the first onAppear can be dropped.
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(600))
                model.wikiPath.append(page)
            }
        }
    }
}

extension WikiPageItem {
    /// Folder titles from the root down to this page's parent.
    func breadcrumb(in pages: [WikiPageItem]) -> [String] {
        var out: [String] = []
        var cursor = parentId
        var guardCount = 0
        while let id = cursor, let parent = pages.first(where: { $0.id == id }), guardCount < 16 {
            out.insert(parent.title, at: 0)
            cursor = parent.parentId
            guardCount += 1
        }
        return out
    }
}

#Preview {
    WikiView(model: AppModel())
        .preferredColorScheme(.dark)
}
