//
//  SessionPlayerView.swift
//  trackr-mobile-ios
//
//  Full-screen session player (Apple Music now-playing style): project
//  artwork, editable title, live timer, session notes. Done materializes
//  the session into a task.
//

import SwiftUI

struct SessionPlayerView: View {
    @Bindable var model: AppModel

    @State private var draft = ""
    @State private var confirmingDone = false
    @State private var confirmingDiscard = false
    @State private var dragOffset: CGFloat = 0
    /// Chosen in the confirm sheet, played (overlay → slide down) once that
    /// sheet has dismissed.
    @State private var pendingOutcome: Outcome?
    @State private var showingOutcome: Outcome?

    private enum Outcome {
        case finished(TaskStatus?, minutes: Int)
        case discarded

        var icon: String {
            switch self {
            case .finished: "checkmark"
            case .discarded: "xmark"
            }
        }

        var label: String {
            switch self {
            case .finished(_, let minutes): "Logged \(minutes.minutesFormatted)"
            case .discarded: "Session discarded"
            }
        }
    }

    private var me: UserRef { TaskItem.sampleUsers[0] }  // current user later

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 0) {
                Capsule()
                    .fill(Color(.tertiaryLabel))
                    .frame(width: 36, height: 5)
                    .padding(.top, 10)
                topBar
                header
                if let startedAt = model.session.startedAt {
                    Text(startedAt, style: .timer)
                        .font(.system(size: 56, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                }
            }
            .contentShape(.rect)
            .gesture(dragToDismiss)
            notes
        }
        .offset(y: max(0, dragOffset))
        .animation(.spring(duration: 0.3), value: dragOffset)
        .background(background)
        .overlay { outcomeOverlay }
        .disabled(showingOutcome != nil)
        .safeAreaInset(edge: .bottom) {
            MessageComposer(text: $draft, placeholder: "Add a note…", onSend: addNote)
        }
        .sheet(isPresented: $confirmingDone, onDismiss: playPendingOutcome) {
            ConfirmSheet(
                title: "Are you done with this task?",
                cancelLabel: "Keep working",
                actions: [
                    .init(label: "Mark as Done", style: .prominent) {
                        pendingOutcome = .finished(.done, minutes: elapsedMinutes)
                    },
                    .init(label: model.session.isTaskBound ? "Keep current status" : "Keep In Progress") {
                        pendingOutcome = .finished(
                            model.session.isTaskBound ? nil : .inProgress, minutes: elapsedMinutes
                        )
                    },
                ]
            )
        }
        .sheet(isPresented: $confirmingDiscard, onDismiss: playPendingOutcome) {
            ConfirmSheet(
                title: "Discard this session?",
                cancelLabel: "Keep working",
                actions: [
                    .init(label: "Discard session", style: .destructive) {
                        pendingOutcome = .discarded
                    },
                ]
            )
        }
    }

    private var elapsedMinutes: Int {
        guard let startedAt = model.session.startedAt else { return 1 }
        return max(1, Int(Date.now.timeIntervalSince(startedAt) / 60))
    }

    /// Confirmation beat: show the outcome badge over the still-populated
    /// player, then slide the cover down; the model clears the session only
    /// after the cover is gone (AppModel.clearSessionAfterDismiss).
    private func playPendingOutcome() {
        guard let outcome = pendingOutcome else { return }
        pendingOutcome = nil
        withAnimation(.spring(duration: 0.35, bounce: 0.3)) {
            showingOutcome = outcome
        }
        Task {
            try? await Task.sleep(for: .seconds(0.9))
            switch outcome {
            case .finished(let status, _): model.finishSession(as: status)
            case .discarded: model.discardSession()
            }
        }
    }

    @ViewBuilder
    private var outcomeOverlay: some View {
        if let outcome = showingOutcome {
            let destructive = if case .discarded = outcome { true } else { false }
            ZStack {
                Color.black.opacity(0.12).ignoresSafeArea()
                VStack(spacing: 12) {
                    Image(systemName: outcome.icon)
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 84, height: 84)
                        .background(destructive ? Color(.systemGray) : Color.accentColor, in: .circle)
                    Text(outcome.label)
                        .font(.system(size: 15, weight: .semibold))
                }
                .padding(28)
                .background(.regularMaterial, in: .rect(cornerRadius: 24))
                .transition(.scale(scale: 0.7).combined(with: .opacity))
            }
            .transition(.opacity)
        }
    }

    /// Pull down on the header area to dismiss, Music-style.
    private var dragToDismiss: some Gesture {
        DragGesture()
            .onChanged { value in
                dragOffset = value.translation.height
            }
            .onEnded { value in
                if value.translation.height > 140 {
                    model.showingPlayer = false
                }
                dragOffset = 0
            }
    }

    private var topBar: some View {
        HStack {
            Button {
                confirmingDiscard = true
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color(.secondaryLabel))
                    .frame(width: 34, height: 34)
                    .background(.ultraThinMaterial, in: .circle)
            }
            Spacer()
            Button {
                confirmingDone = true
            } label: {
                Text("Done")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .frame(height: 34)
                    .background(Color.accentColor, in: .capsule)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
    }

    private var header: some View {
        HStack(spacing: 12) {
            if let project = model.session.project {
                RoundedRectangle(cornerRadius: 13)
                    .fill(
                        LinearGradient(
                            colors: [project.color.opacity(0.9), project.color.opacity(0.5)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 58, height: 58)
                    .overlay(
                        Text(project.initial)
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(.white)
                    )
            }
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    if let taskId = model.session.taskId {
                        Text(taskId)
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.ultraThinMaterial, in: .rect(cornerRadius: 6))
                    }
                    Text(model.session.project?.name ?? "")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }
                if model.session.isTaskBound {
                    // Bound to an existing task — its title stays as is.
                    Text(model.session.title)
                        .font(.system(size: 18, weight: .semibold))
                        .lineLimit(2)
                } else {
                    TextField("What are you working on?", text: $model.session.title)
                        .font(.system(size: 18, weight: .semibold))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 20)
    }

    private var notes: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if model.session.notes.isEmpty {
                    Text("Notes you add here become the task's comments.")
                        .font(.system(size: 14))
                        .foregroundStyle(.tertiary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 30)
                } else {
                    ForEach(model.session.notes) { note in
                        TimelineRow(
                            node: .avatar(note.user),
                            name: note.user.name,
                            action: "noted",
                            date: note.date
                        ) {
                            MessageCard(text: note.text)
                        }
                    }
                }
            }
            .padding(16)
        }
        .defaultScrollAnchor(model.session.notes.isEmpty ? .top : .bottom)
        .scrollDismissesKeyboard(.interactively)
    }

    private var background: some View {
        LinearGradient(
            colors: [
                (model.session.project?.color ?? .clear).opacity(0.35),
                Color(.systemBackground),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    private func addNote() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        model.session.notes.append(TaskComment(user: me, date: .now, text: text))
        draft = ""
    }
}

#Preview {
    @Previewable @State var model: AppModel = {
        let m = AppModel()
        m.startSession(for: m.favoriteProjects[1])
        return m
    }()
    Color.clear.sheet(isPresented: .constant(true)) {
        SessionPlayerView(model: model)
    }
}
