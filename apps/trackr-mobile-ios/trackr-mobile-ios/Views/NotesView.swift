//
//  NotesView.swift
//  trackr-mobile-ios
//
//  Quick notes root: page header + mono count + "+", then group bands
//  (Pinned / My notes / Shared with me) with note cards — icon tile,
//  title, two-line preview, mono date. Owns the notes navigation stack.
//

import SwiftUI

struct NotesView: View {
    @Bindable var model: AppModel
    @State private var showingCreate = false
    @State private var openedFirst = false

    private var mine: [NoteItem] {
        model.notes
            .filter { $0.kind == .quick && $0.sharedBy == nil }
            .sorted { $0.updatedAt > $1.updatedAt }
    }
    private var shared: [NoteItem] {
        model.notes
            .filter { $0.kind == .quick && $0.sharedBy != nil }
            .sorted { $0.updatedAt > $1.updatedAt }
    }
    private var pinned: [NoteItem] { mine.filter(\.pinned) }
    private var unpinned: [NoteItem] { mine.filter { !$0.pinned } }

    var body: some View {
        NavigationStack(path: $model.notesPath) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    TKPageHeader("Notes") {
                        HStack(spacing: 10) {
                            Text("\(mine.count + shared.count) notes")
                                .font(.tkMono(12))
                                .foregroundStyle(TK.text3)
                            TKPlusButton(label: "New note") { showingCreate = true }
                        }
                    }
                    .padding(.bottom, 8)
                    if mine.isEmpty && shared.isEmpty {
                        TKEmptyState(text: "No notes yet.\nCapture your first quick note with +.")
                    } else {
                        if !pinned.isEmpty {
                            TKGroupBand(title: "Pinned", count: pinned.count)
                            cards(pinned)
                        }
                        TKGroupBand(title: "My notes", count: unpinned.count)
                        if unpinned.isEmpty {
                            TKEmptyState(text: "Nothing here yet.", padding: 24)
                        } else {
                            cards(unpinned)
                        }
                        if !shared.isEmpty {
                            TKGroupBand(title: "Shared with me", count: shared.count)
                            cards(shared)
                        }
                    }
                }
                .padding(.bottom, 24)
            }
            .tkRootScreen(model)
            .refreshable { await model.sync?.refreshNotes() }
            .navigationDestination(for: NoteItem.self) { note in
                NoteDetailView(model: model, note: note)
            }
            .sheet(isPresented: $showingCreate) {
                QuickNoteSheet(author: model.me) { note, plainText in
                    model.notes.insert(note, at: 0)
                    model.sync?.createQuickNote(
                        title: note.title,
                        body: plainText.isEmpty ? nil : plainText
                    )
                    model.toast("Note saved")
                }
            }
            .onAppear(perform: openFirstIfAsked)
        }
    }

    private func cards(_ notes: [NoteItem]) -> some View {
        VStack(spacing: 10) {
            ForEach(notes) { note in
                NavigationLink(value: note) {
                    NoteCard(note: note)
                }
                .buttonStyle(TKScaleStyle())
                .contextMenu {
                    Button {
                        togglePin(note)
                    } label: {
                        Label(note.pinned ? "Unpin" : "Pin", systemImage: note.pinned ? "pin.slash" : "pin")
                    }
                    if note.sharedBy == nil {
                        Button(role: .destructive) {
                            model.notes.removeAll { $0.id == note.id }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .padding(.horizontal, TK.gutter)
        .padding(.vertical, 12)
    }

    private func togglePin(_ note: NoteItem) {
        guard let index = model.notes.firstIndex(where: { $0.id == note.id }) else { return }
        model.notes[index].pinned.toggle()
    }

    /// `--open-first` launch argument (simulator screenshots).
    private func openFirstIfAsked() {
        let args = ProcessInfo.processInfo.arguments
        if args.contains("--sheet") { showingCreate = true }
        guard !openedFirst, args.contains("--open-first"),
              model.notesPath.isEmpty, let note = pinned.first ?? mine.first else { return }
        openedFirst = true
        // Deferred: a path push during the first onAppear can be dropped.
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(600))
            model.notesPath.append(note)
        }
    }
}

// MARK: - Note card

/// Note / meeting list card: icon tile 22 · title 15/600 (+ pin) ·
/// two-line preview 13 text2 · mono date line.
struct NoteCard: View {
    let note: NoteItem

    private var preview: String { note.bodyHtml.htmlPreviewText }

    private var footer: String {
        var parts = [note.updatedAt.relativeShort]
        if let sharedBy = note.sharedBy {
            parts.append("shared by \(sharedBy.name)")
        } else if let owner = note.owner {
            parts.append(owner.name)
        }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                TKIconTile(systemImage: note.icon)
                Text(note.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(TK.text)
                    .lineLimit(1)
                Spacer(minLength: 6)
                if note.pinned {
                    Image(systemName: "pin.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(TK.accent)
                }
            }
            if !preview.isEmpty {
                Text(preview)
                    .font(.system(size: 13))
                    .lineSpacing(2)
                    .foregroundStyle(TK.text2)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            Text(footer)
                .font(.tkMono(11))
                .foregroundStyle(TK.text4)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tkCard(padding: 14)
        .contentShape(.rect)
    }
}

#Preview {
    NotesView(model: AppModel())
        .preferredColorScheme(.dark)
}
