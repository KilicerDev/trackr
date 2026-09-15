//
//  TKSessionMiniBar.swift
//  trackr-mobile-ios
//
//  Floating "now recording" bar: live dot tile, title + key/project ·
//  state, mono timer, pause/resume. Tap opens the session sheet. Roots
//  show it above the tab bar (TKBottomChrome); detail screens place it
//  above their composer.
//

import SwiftUI

struct TKSessionMiniBar: View {
    @Bindable var model: AppModel

    private var title: String {
        let title = model.session.title.trimmingCharacters(in: .whitespaces)
        if !title.isEmpty { return title }
        if let project = model.session.project { return "Working on \(project.name)" }
        return "Work session"
    }

    private var subtitle: String {
        if let taskId = model.session.taskId,
           let task = model.tasks.first(where: { $0.id == taskId }) {
            return task.id
        }
        return model.session.project?.name ?? ""
    }

    var body: some View {
        Button {
            model.showingPlayer = true
        } label: {
            HStack(spacing: 10) {
                TKLiveDot(color: model.session.isPaused ? TK.warning : TK.accent,
                          pulsing: !model.session.isPaused)
                    .frame(width: 36, height: 36)
                    .background(TK.bg, in: .rect(cornerRadius: 9))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(TK.text)
                        .lineLimit(1)
                    HStack(spacing: 4) {
                        Text(subtitle)
                            .font(.tkMono(12))
                        Text("· \(model.session.isPaused ? "Paused" : "Recording")")
                            .font(.system(size: 12))
                    }
                    .foregroundStyle(TK.text2)
                    .lineLimit(1)
                }
                Spacer(minLength: 6)
                SessionClock(session: model.session)
                    .font(.tkMono(16, weight: .semibold))
                    .foregroundStyle(model.session.isPaused ? TK.warning : TK.accent)
                Button {
                    model.togglePause()
                } label: {
                    Image(systemName: model.session.isPaused ? "play.fill" : "pause.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(TK.text)
                        .frame(width: 42, height: 42)
                        .contentShape(.circle)
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, 12)
            .padding(.trailing, 6)
            .frame(height: TK.miniBarHeight)
            .background(TK.elevated.opacity(0.92), in: .rect(cornerRadius: TK.rCardSm))
            .background(.ultraThinMaterial, in: .rect(cornerRadius: TK.rCardSm))
            .overlay(RoundedRectangle(cornerRadius: TK.rCardSm).strokeBorder(TK.mono(0.09), lineWidth: 1))
            .shadow(color: .black.opacity(0.45), radius: 12, y: 8)
            .contentShape(.rect)
        }
        .buttonStyle(TKScaleStyle())
    }
}

/// Elapsed time of a session as hh:mm:ss / mm:ss — frozen while paused.
struct SessionClock: View {
    let session: WorkSession

    var body: some View {
        if session.isPaused {
            Text(Self.format(session.elapsed(at: .now)))
        } else if let start = session.effectiveStart {
            Text(start, style: .timer)
        } else {
            Text("00:00")
        }
    }

    static func format(_ interval: TimeInterval) -> String {
        let total = max(0, Int(interval))
        let h = total / 3600, m = total % 3600 / 60, s = total % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%02d:%02d", m, s)
    }
}

#Preview {
    let model = AppModel()
    model.startSession(for: TaskItem.samples[0])
    return VStack {
        Spacer()
        TKSessionMiniBar(model: model).padding(8)
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
