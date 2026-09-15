//
//  SessionPlayerView.swift
//  trackr-mobile-ios
//
//  The session sheet (presented by AppShell): key / project row, editable
//  title for free sessions, 72pt clock, state line, round Pause / Finish
//  controls, note input + quick notes + note list. Finishing a free
//  session turns it into a task (title, status, "Create task & log …");
//  a task-bound session keeps the Done? confirm. Closing the sheet keeps
//  the session running in the mini bar.
//

import SwiftUI

struct SessionPlayerView: View {
    @Bindable var model: AppModel

    @State private var draft = ""
    @State private var finishing = false
    @State private var finishStatus: TaskStatus = .inProgress
    @State private var confirmingDone = false
    @State private var confirmingDiscard = false
    /// Chosen in the finish flow, played (overlay → dismiss) once any
    /// confirm sheet has dismissed.
    @State private var pendingOutcome: Outcome?
    @State private var showingOutcome: Outcome?
    @FocusState private var noteFocused: Bool

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

    private static let quickNotes = ["Blocked", "Waiting on client", "Done for today", "Needs review"]

    private var session: WorkSession { model.session }
    private var paused: Bool { session.isPaused }
    private var stateColor: Color { paused ? TK.warning : TK.accent }

    private var elapsedMinutes: Int {
        max(1, Int(session.elapsed(at: .now) / 60))
    }

    /// "2h05m" / "45m" for captions and the finish CTA.
    private var elapsedCompact: String {
        let minutes = elapsedMinutes
        let h = minutes / 60, m = minutes % 60
        return h > 0 ? "\(h)h\(String(format: "%02d", m))m" : "\(m)m"
    }

    private var taskKey: String? {
        guard let taskId = session.taskId else { return nil }
        return model.tasks.first(where: { $0.id == taskId })?.id ?? taskId
    }

    var body: some View {
        VStack(spacing: 0) {
            TKSheetHandle()
                .padding(.top, 10)
            topRow
                .padding(.horizontal, TK.gutter)
                .padding(.top, 12)
            ScrollView {
                VStack(spacing: 0) {
                    titleBlock
                        .padding(.horizontal, TK.gutter)
                        .padding(.top, 8)
                    clockBlock
                        .padding(.top, 18)
                    if finishing {
                        finishPanel
                            .padding(.horizontal, TK.gutter)
                            .padding(.top, 22)
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    } else {
                        controls
                            .padding(.top, 26)
                            .transition(.opacity)
                        notesBlock
                            .padding(.horizontal, TK.gutter)
                            .padding(.top, 28)
                    }
                }
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .animation(.snappy(duration: 0.22), value: finishing)
        .background(TK.card)
        .tkSheet(detents: [.large])
        .overlay { outcomeOverlay }
        .disabled(showingOutcome != nil)
        .sheet(isPresented: $confirmingDone, onDismiss: playPendingOutcome) {
            ConfirmSheet(
                title: "Are you done with this task?",
                message: "\(elapsedCompact) is logged either way; notes become comments.",
                cancelLabel: "Keep working",
                actions: [
                    .init(label: "Mark as Done", style: .prominent) {
                        pendingOutcome = .finished(.done, minutes: elapsedMinutes)
                    },
                    .init(label: "Keep current status") {
                        pendingOutcome = .finished(nil, minutes: elapsedMinutes)
                    },
                ]
            )
        }
        .sheet(isPresented: $confirmingDiscard, onDismiss: playPendingOutcome) {
            ConfirmSheet(
                title: "Discard this session?",
                message: "Nothing is logged and the notes are dropped.",
                cancelLabel: "Keep working",
                actions: [
                    .init(label: "Discard session", style: .destructive) {
                        pendingOutcome = .discarded
                    },
                ]
            )
        }
    }

    // MARK: Header

    private var topRow: some View {
        HStack(spacing: 8) {
            if let taskKey {
                Text(taskKey)
                    .font(.tkMono(12, weight: .medium))
                    .foregroundStyle(TK.text2)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(TK.mono(0.06), in: .rect(cornerRadius: 6))
            }
            if let project = session.project {
                TKDot(color: project.color, size: 6)
                Text(project.name)
                    .font(.system(size: 13))
                    .foregroundStyle(TK.text2)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            TKCircleButton(systemImage: "xmark", size: 32) {
                model.showingPlayer = false
            }
        }
    }

    @ViewBuilder
    private var titleBlock: some View {
        if session.isTaskBound {
            // Bound to an existing task — its title stays as is.
            Text(session.title)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(TK.text)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            TextField("What are you working on?", text: $model.session.title, axis: .vertical)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(TK.text)
                .lineLimit(1...2)
        }
    }

    private var clockBlock: some View {
        VStack(spacing: 10) {
            SessionClock(session: session)
                .font(.tkMono(72, weight: .light))
                .foregroundStyle(paused ? TK.warning : TK.text)
                .contentTransition(.numericText())
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            HStack(spacing: 8) {
                TKLiveDot(color: stateColor, pulsing: !paused)
                    .id(paused)
                Text(paused ? "Paused" : "Recording")
                    .foregroundStyle(stateColor)
                if !session.isTaskBound {
                    Text("· becomes a task on finish")
                        .foregroundStyle(TK.text3)
                }
            }
            .font(.system(size: 13, weight: .medium))
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, TK.gutter)
    }

    // MARK: Controls

    private var controls: some View {
        VStack(spacing: 18) {
            HStack(spacing: 36) {
                roundControl(
                    icon: paused ? "play.fill" : "pause.fill",
                    caption: paused ? "Resume" : "Pause",
                    fill: TK.elevated2,
                    border: TK.borderStrong,
                    tint: TK.text
                ) {
                    model.togglePause()
                }
                roundControl(
                    icon: "stop.fill",
                    caption: "Finish · \(elapsedCompact)",
                    fill: TK.accentSofter,
                    border: TK.accentBorder,
                    tint: TK.accent
                ) {
                    if session.isTaskBound {
                        confirmingDone = true
                    } else {
                        finishStatus = .inProgress
                        finishing = true
                    }
                }
            }
            if session.isTaskBound {
                TKQuietButton(title: "Discard session", color: TK.text3) {
                    confirmingDiscard = true
                }
            }
        }
    }

    private func roundControl(icon: String, caption: String, fill: Color, border: Color, tint: Color,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(tint)
                    .frame(width: 64, height: 64)
                    .background(fill, in: .circle)
                    .overlay(Circle().strokeBorder(border, lineWidth: 1))
                Text(caption)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(TK.text2)
                    .lineLimit(1)
            }
            .frame(minWidth: 96)
            .contentShape(.rect)
        }
        .buttonStyle(TKScaleStyle())
    }

    // MARK: Finish (free session)

    private var finishPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            TKSectionLabel("New task in \(session.project?.name ?? "project")")
            TKTextInput(text: $model.session.title, placeholder: "Task title")
            TKSegmented([TaskStatus.inProgress, .done], selection: $finishStatus, fill: TK.bg) { $0.label }
            Text("\(elapsedCompact) is logged on the task; the \(session.notes.count) note\(session.notes.count == 1 ? "" : "s") become comments.")
                .font(.system(size: 12))
                .foregroundStyle(TK.text3)
                .fixedSize(horizontal: false, vertical: true)
            TKPrimaryButton(title: "Create task & log \(elapsedCompact)", icon: "checkmark") {
                pendingOutcome = .finished(finishStatus, minutes: elapsedMinutes)
                playPendingOutcome()
            }
            .padding(.top, 4)
            HStack {
                TKSecondaryButton(title: "Back", icon: "chevron.left") { finishing = false }
                Spacer()
                TKQuietButton(title: "Discard session", color: TK.danger) {
                    confirmingDiscard = true
                }
            }
        }
        .padding(16)
        .tkCard(radius: TK.rCard, padding: nil, fill: TK.bgRaised)
    }

    // MARK: Notes

    private var notesBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                TextField("Add a note…", text: $draft)
                    .font(.system(size: 15))
                    .foregroundStyle(TK.text)
                    .focused($noteFocused)
                    .submitLabel(.send)
                    .onSubmit { addNote(draft) }
                Button {
                    addNote(draft)
                } label: {
                    Text("Add")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(draft.trimmingCharacters(in: .whitespaces).isEmpty ? TK.text4 : TK.accent)
                        .padding(.horizontal, 12)
                        .frame(height: 32)
                        .background(TK.mono(0.06), in: .rect(cornerRadius: 9))
                }
                .buttonStyle(.plain)
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.leading, 14)
            .padding(.trailing, 6)
            .frame(height: 48)
            .background(TK.bg, in: .rect(cornerRadius: TK.rInput))
            .overlay(RoundedRectangle(cornerRadius: TK.rInput).strokeBorder(TK.borderInput, lineWidth: 1))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Self.quickNotes, id: \.self) { note in
                        Button {
                            addNote(note)
                        } label: {
                            Text(note)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(TK.text2)
                                .padding(.horizontal, 11)
                                .frame(height: 30)
                                .background(TK.mono(0.06), in: .capsule)
                                .overlay(Capsule().strokeBorder(TK.border, lineWidth: 1))
                        }
                        .buttonStyle(TKScaleStyle())
                    }
                }
                .padding(.horizontal, TK.gutter)
            }
            .padding(.horizontal, -TK.gutter)

            if session.notes.isEmpty {
                Text("Notes you add here become the task's comments.")
                    .font(.system(size: 13))
                    .foregroundStyle(TK.text4)
                    .padding(.top, 6)
            } else {
                VStack(spacing: 0) {
                    ForEach(session.notes) { note in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(note.date.formatted(date: .omitted, time: .shortened))
                                .font(.tkMono(11))
                                .foregroundStyle(TK.text3)
                            Text(note.text)
                                .font(.system(size: 14))
                                .foregroundStyle(TK.textBody)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.vertical, 10)
                        if note.id != session.notes.last?.id {
                            TKHairline()
                        }
                    }
                }
                .padding(.top, 4)
            }
        }
    }

    private func addNote(_ raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        model.session.notes.append(TaskComment(user: model.me, date: .now, text: text))
        if raw == draft { draft = "" }
    }

    // MARK: Outcome

    /// Confirmation beat: show the outcome badge over the still-populated
    /// sheet, then dismiss; the model clears the session only after the
    /// sheet is gone (AppModel.clearSessionAfterDismiss).
    private func playPendingOutcome() {
        guard let outcome = pendingOutcome else { return }
        pendingOutcome = nil
        withAnimation(.snappy(duration: 0.3)) {
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
                TK.bg.opacity(0.55).ignoresSafeArea()
                VStack(spacing: 12) {
                    Image(systemName: outcome.icon)
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 76, height: 76)
                        .background(destructive ? TK.elevated2 : TK.success, in: .circle)
                    Text(outcome.label)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(TK.text)
                }
                .padding(28)
                .background(TK.elevated, in: .rect(cornerRadius: 24))
                .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(TK.borderInput, lineWidth: 1))
                .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
            .transition(.opacity)
        }
    }
}

#Preview("Free session") {
    @Previewable @State var model: AppModel = {
        let m = AppModel()
        m.startSession(for: m.favoriteProjects[1])
        m.session.title = "Refactor the sync engine"
        m.session.notes = [TaskComment(user: TaskItem.sampleUsers[0], date: .now, text: "Blocked on the API change")]
        return m
    }()
    Color.clear.sheet(isPresented: .constant(true)) {
        SessionPlayerView(model: model)
    }
    .preferredColorScheme(.dark)
}

#Preview("Task-bound, paused") {
    @Previewable @State var model: AppModel = {
        let m = AppModel()
        m.startSession(for: TaskItem.samples[0])
        m.togglePause()
        return m
    }()
    Color.clear.sheet(isPresented: .constant(true)) {
        SessionPlayerView(model: model)
    }
    .preferredColorScheme(.dark)
}
