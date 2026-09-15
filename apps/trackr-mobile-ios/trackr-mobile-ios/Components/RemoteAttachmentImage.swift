//
//  RemoteAttachmentImage.swift
//  trackr-mobile-ios
//
//  Authenticated replacement for AsyncImage, backed by AttachmentStore.
//  Renders a progress placeholder while loading and a muted photo glyph on
//  failure (or in previews, where no store is in the environment).
//

import SwiftUI
import UIKit

struct RemoteAttachmentImage: View {
    enum Source: Hashable {
        /// Attachment by id — `thumb` asks for the 480px thumbnail (falls
        /// back to the original when the server has none).
        case attachment(id: String, thumb: Bool)
        /// A note/wiki `<img src>` value, usually relative.
        case src(String)
    }

    let source: Source
    var contentMode: ContentMode = .fill

    @Environment(\.attachmentStore) private var store
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else {
                TK.elevated
                if failed || store == nil {
                    Image(systemName: "photo")
                        .font(.system(size: 18))
                        .foregroundStyle(TK.text4)
                } else {
                    ProgressView()
                        .controlSize(.small)
                        .tint(TK.text2)
                }
            }
        }
        .task(id: source) { await load() }
    }

    private func load() async {
        guard let store else { return }
        // Re-entered on source change: drop the previous picture rather than
        // showing it under a new id (the store serves cache hits instantly).
        image = nil
        failed = false
        do {
            image = switch source {
            case .attachment(let id, let thumb): try await store.image(id: id, thumb: thumb)
            case .src(let src): try await store.image(src: src)
            }
        } catch {
            failed = true
        }
    }
}
