//
//  WikiView.swift
//  trackr-mobile-ios
//
//  The wiki page tree — folders expand in place (native List outline),
//  pages push the rendered article. Search flattens to matching pages.
//  Pushed from the Home quick links.
//

import SwiftUI

struct WikiView: View {
    @Bindable var model: AppModel
    @State private var search = ""

    private struct WikiNode: Identifiable {
        let page: WikiPageItem
        var children: [WikiNode]?
        var id: String { page.id }
    }

    private var tree: [WikiNode] {
        func nodes(under parentId: String?) -> [WikiNode] {
            model.wikiPages
                .filter { $0.parentId == parentId }
                .sorted { ($0.sortOrder, $0.title) < ($1.sortOrder, $1.title) }
                .map { page in
                    let children = nodes(under: page.id)
                    return WikiNode(page: page, children: page.isFolder ? children : nil)
                }
        }
        return nodes(under: nil)
    }

    private var searchResults: [WikiPageItem] {
        model.wikiPages.filter {
            !$0.isFolder && $0.title.localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        List {
            if search.isEmpty {
                OutlineGroup(tree, children: \.children) { node in
                    row(node.page)
                }
            } else {
                ForEach(searchResults) { page in
                    row(page)
                }
                if searchResults.isEmpty {
                    Text("No pages match “\(search)”.")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .searchable(text: $search, prompt: "Search wiki")
        .navigationTitle("Wiki")
    }

    @ViewBuilder
    private func row(_ page: WikiPageItem) -> some View {
        if page.isFolder {
            Label {
                Text(page.title)
                    .font(.system(size: 15, weight: .medium))
            } icon: {
                Image(systemName: "folder.fill")
                    .foregroundStyle(Color.accentColor.opacity(0.8))
            }
        } else {
            NavigationLink(value: page) {
                Label {
                    Text(page.title)
                        .font(.system(size: 15))
                } icon: {
                    Image(systemName: page.icon)
                        .foregroundStyle(Color.accentColor)
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        WikiView(model: AppModel())
    }
}
