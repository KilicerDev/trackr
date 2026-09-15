//
//  NoteDetailView.swift
//  trackr-mobile-ios
//
//  A note as a detail screen: icon tile + 22pt title, mono meta line,
//  meeting chips (date, project, task), then the document via
//  RichContentView. Read-only — editing stays on desktop until the
//  editing lane lands; pin toggles for own quick notes.
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

    private var canPin: Bool { current.kind == .quick && current.sharedBy == nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    TKIconTile(systemImage: current.icon, size: 36, color: TK.accent, fill: TK.accentSoft)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(current.title)
                            .font(.tkDetailTitle)
                            .tkTitleTracking()
                            .foregroundStyle(TK.text)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(metaLine)
                            .font(.tkMono(11))
                            .foregroundStyle(TK.text3)
                    }
                }
                if current.kind == .meeting {
                    ChipFlow(spacing: 8) {
                        if let date = current.meetingDate {
                            PropertyChip(style: .filled) {
                                Image(systemName: "calendar")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(TK.text3)
                                Text(date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))
                                Text(date.formatted(.dateTime.hour().minute()))
                                    .font(.tkMono(13))
                                    .foregroundStyle(TK.text2)
                            }
                        }
                        if let project = current.project {
                            PropertyChip(style: .filled) {
                                TKDot(color: projectColor ?? Color(hex: 0x7C7C84))
                                Text(project)
                            }
                        }
                        if let taskId = current.taskId {
                            Button {
                                if let task = model.tasks.first(where: { $0.id == taskId }) {
                                    model.open(task)
                                }
                            } label: {
                                PropertyChip(style: .filled) {
                                    Image(systemName: "checkmark.square")
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(TK.text3)
                                    Text(taskId)
                                        .font(.tkMono(13))
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.top, 2)
                }
                TKHairline(color: TK.border)
                    .padding(.vertical, 6)
                RichContentView(html: current.bodyHtml)
            }
            .padding(.horizontal, TK.gutter)
            .padding(.top, 10)
            .padding(.bottom, 32)
        }
        .tkDetailScreen()
        .onAppear {
            // The list payload has no body — fetch it when the note opens.
            Task { await model.sync?.loadNoteBody(id: note.id) }
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(current.kind == .meeting ? "Meeting note" : "Note")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(TK.text2)
            }
            if canPin {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        togglePin()
                    } label: {
                        Image(systemName: current.pinned ? "pin.fill" : "pin")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(current.pinned ? TK.accent : TK.text)
                            .frame(width: 36, height: 36)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(current.pinned ? "Unpin" : "Pin")
                }
            }
        }
    }

    private var metaLine: String {
        var parts: [String] = []
        if let sharedBy = current.sharedBy {
            parts.append("shared by \(sharedBy.name)")
        } else if let owner = current.owner {
            parts.append(owner.name)
        }
        parts.append("edited \(current.updatedAt.relativeShort)")
        return parts.joined(separator: " · ")
    }

    private func togglePin() {
        guard let index = model.notes.firstIndex(where: { $0.id == note.id }) else { return }
        model.notes[index].pinned.toggle()
        model.toast(model.notes[index].pinned ? "Pinned" : "Unpinned")
    }
}

#Preview("Meeting") {
    NavigationStack {
        NoteDetailView(model: AppModel(), note: NoteItem.samples[4])
    }
    .preferredColorScheme(.dark)
}

#Preview("Quick note") {
    NavigationStack {
        NoteDetailView(model: AppModel(), note: NoteItem.samples[0])
    }
    .preferredColorScheme(.dark)
}
