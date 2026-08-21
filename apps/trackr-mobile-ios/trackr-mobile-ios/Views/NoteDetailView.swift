//
//  NoteDetailView.swift
//  trackr-mobile-ios
//
//  A note rendered natively: icon, title, meta chips (meeting date,
//  linked project/task), then the document via RichContentView.
//  Read-only — editing stays on desktop until the editing lane lands.
//

import SwiftUI

struct NoteDetailView: View {
    @Bindable var model: AppModel
    let note: NoteItem

    /// Live copy from the model so pin toggles reflect immediately.
    private var current: NoteItem {
        model.notes.first { $0.id == note.id } ?? note
    }

    private var projectColor: Color? {
        current.project.flatMap { name in
            model.projects.first { $0.name == name }?.color
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 10) {
                    Image(systemName: current.icon)
                        .font(.system(size: 19, weight: .medium))
                        .foregroundStyle(Color.accentColor)
                        .frame(width: 42, height: 42)
                        .background(Color.accentColor.opacity(0.10), in: .rect(cornerRadius: 12))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(current.title)
                            .font(.system(size: 22, weight: .semibold))
                        Text(metaLine)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                }
                if current.kind == .meeting {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            if let date = current.meetingDate {
                                metaChip(icon: "calendar",
                                         label: date.formatted(.dateTime.weekday(.abbreviated)
                                            .day().month(.abbreviated).hour().minute()))
                            }
                            if let project = current.project {
                                metaChip(dot: projectColor ?? Color(hex: 0x7C7C84), label: project)
                            }
                            if let taskId = current.taskId {
                                metaChip(icon: "checklist", label: taskId, mono: true)
                            }
                        }
                    }
                }
                Divider()
                RichContentView(html: current.bodyHtml)
            }
            .padding(16)
            .padding(.bottom, 16)
        }
        .background(Color.webBackground)
        .onAppear {
            // The list payload has no body — fetch it when the note opens.
            Task { await model.sync?.loadNoteBody(id: note.id) }
        }
        .navigationTitle(current.kind == .meeting ? "Meeting Note" : "Note")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if current.kind == .quick && current.sharedBy == nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        togglePin()
                    } label: {
                        Image(systemName: current.pinned ? "pin.fill" : "pin")
                    }
                    .tint(current.pinned ? .accentColor : nil)
                }
            }
        }
    }

    private var metaLine: String {
        var parts: [String] = []
        if let sharedBy = current.sharedBy {
            parts.append("Shared by \(sharedBy.name)")
        } else if let owner = current.owner {
            parts.append(owner.name)
        }
        parts.append("Edited \(current.updatedAt.relativeShort)")
        return parts.joined(separator: " · ")
    }

    private func togglePin() {
        guard let index = model.notes.firstIndex(where: { $0.id == note.id }) else { return }
        model.notes[index].pinned.toggle()
    }

    private func metaChip(
        icon: String? = nil, dot: Color? = nil, label: String, mono: Bool = false
    ) -> some View {
        HStack(spacing: 5) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
            if let dot {
                Circle()
                    .fill(dot)
                    .frame(width: 7, height: 7)
            }
            Text(label)
                .font(.system(size: 12, weight: .medium, design: mono ? .monospaced : .default))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 9)
        .frame(height: 26)
        .background(Color(.secondarySystemGroupedBackground), in: .capsule)
        .overlay(Capsule().strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5))
    }
}

#Preview {
    NavigationStack {
        NoteDetailView(model: AppModel(), note: NoteItem.samples[4])
    }
}
