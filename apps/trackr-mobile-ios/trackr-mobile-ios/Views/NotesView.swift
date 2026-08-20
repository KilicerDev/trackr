//
//  NotesView.swift
//  trackr-mobile-ios
//
//  Quick notes: pinned first, then mine, then notes shared with me —
//  the web NotesSidebar's Notes tab as native cards. Pushed from the
//  Home quick links, so no own NavigationStack.
//

import SwiftUI

struct NotesView: View {
    @Bindable var model: AppModel
    @State private var showingCreate = false

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

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                let pinned = mine.filter(\.pinned)
                if !pinned.isEmpty {
                    sectionHeader("Pinned")
                    ForEach(pinned) { noteRow($0) }
                }
                sectionHeader("My Notes")
                ForEach(mine.filter { !$0.pinned }) { noteRow($0) }
                if !shared.isEmpty {
                    sectionHeader("Shared with me")
                    ForEach(shared) { noteRow($0) }
                }
                if mine.isEmpty && shared.isEmpty {
                    ContentUnavailableView(
                        "No notes yet",
                        systemImage: "note.text",
                        description: Text("Capture your first quick note with the plus button.")
                    )
                    .padding(.top, 60)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Notes")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingCreate = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingCreate) {
            QuickNoteSheet { note in
                model.notes.insert(note, at: 0)
            }
        }
    }

    private func noteRow(_ note: NoteItem) -> some View {
        NavigationLink(value: note) {
            NoteCard(
                icon: note.icon,
                title: note.title,
                subtitle: note.sharedBy.map { "Shared by \($0.name) · \(note.updatedAt.relativeShort)" }
                    ?? "Edited \(note.updatedAt.relativeShort)",
                pinned: note.pinned
            )
        }
        .buttonStyle(.plain)
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

    private func togglePin(_ note: NoteItem) {
        guard let index = model.notes.firstIndex(where: { $0.id == note.id }) else { return }
        model.notes[index].pinned.toggle()
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.system(size: 11, weight: .semibold))
            .tracking(0.6)
            .foregroundStyle(.secondary)
            .padding(.top, 14)
            .padding(.leading, 4)
    }
}

/// Shared note/meeting list card: tinted icon square, title, meta line.
struct NoteCard: View {
    let icon: String
    let title: String
    let subtitle: String
    var pinned = false
    var trailing: String?

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Color.accentColor)
                .frame(width: 36, height: 36)
                .background(Color.accentColor.opacity(0.10), in: .rect(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .lineLimit(1)
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if let trailing {
                Text(trailing)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.tertiary)
            }
            if pinned {
                Image(systemName: "pin.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Color.accentColor)
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
        )
    }
}

#Preview {
    NavigationStack {
        NotesView(model: AppModel())
    }
}
