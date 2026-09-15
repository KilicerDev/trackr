//
//  TimeLogSheet.swift
//  trackr-mobile-ios
//
//  Web parity (tasks/TimeLogger.svelte): hours + minutes + date + note,
//  with the most recent entries below — in the prototype's sheet chrome.
//

import SwiftUI

struct TimeLogSheet: View {
    let task: TaskItem
    var me: UserRef = TaskItem.sampleUsers[0]
    let onLog: (TimeLog) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var hours = 0
    @State private var minutes = 30
    @State private var date = Date.now
    @State private var note = ""
    @State private var pickingDate = false

    private var totalMinutes: Int { hours * 60 + minutes }

    private var recent: [TimeLog] {
        Array(task.timeLogs.sorted { $0.date > $1.date }.prefix(5))
    }

    var body: some View {
        VStack(spacing: 0) {
            TKSheetHeader(title: "Log time")
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    durationCard
                    VStack(alignment: .leading, spacing: 8) {
                        TKSectionLabel("Date")
                        Button {
                            pickingDate = true
                        } label: {
                            PropertyChip(chevron: true) {
                                Image(systemName: "calendar")
                                    .font(.system(size: 12))
                                    .foregroundStyle(TK.text2)
                                Text(date.formatted(.dateTime.day().month(.abbreviated).year()))
                                    .font(.tkMono(14))
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        TKSectionLabel("Note")
                        TKTextInput(
                            text: $note,
                            placeholder: "What did you work on?",
                            font: .system(size: 15)
                        )
                    }
                    if !recent.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            TKSectionLabel("Recent")
                            VStack(spacing: 0) {
                                ForEach(recent) { log in
                                    HStack(spacing: 10) {
                                        Text(log.minutes.minutesFormatted)
                                            .font(.tkMono(13, weight: .medium))
                                            .foregroundStyle(TK.text)
                                            .frame(width: 56, alignment: .leading)
                                        Text(log.note ?? "")
                                            .font(.system(size: 13))
                                            .foregroundStyle(TK.text2)
                                            .lineLimit(1)
                                        Spacer(minLength: 8)
                                        Text(log.date.formatted(.dateTime.day().month(.abbreviated)))
                                            .font(.tkMono(11))
                                            .foregroundStyle(TK.text3)
                                    }
                                    .padding(.horizontal, 14)
                                    .frame(minHeight: 44)
                                    if log.id != recent.last?.id {
                                        TKHairline()
                                    }
                                }
                            }
                            .tkCard(radius: TK.rCardSm, padding: nil, fill: TK.bg)
                        }
                    }
                }
                .padding(.horizontal, TK.gutter)
                .padding(.top, 18)
                .padding(.bottom, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            footer
        }
        .tkSheet(detents: [.large])
        .sheet(isPresented: $pickingDate) {
            TKDatePickerSheet(title: "Date", selected: date, allowsClear: false) { picked in
                if let picked { date = picked }
            }
        }
    }

    /// Hours stepper + minute quarters, mono total on the right.
    private var durationCard: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text("Hours")
                    .font(.tkRow)
                    .foregroundStyle(TK.text)
                Spacer()
                TKCircleButton(systemImage: "minus", size: 32, fill: TK.elevated, iconSize: 11) {
                    hours = max(0, hours - 1)
                }
                Text("\(hours)h")
                    .font(.tkMono(16, weight: .semibold))
                    .foregroundStyle(TK.text)
                    .frame(width: 44)
                TKCircleButton(systemImage: "plus", size: 32, fill: TK.elevated, iconSize: 11) {
                    hours = min(12, hours + 1)
                }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
            TKHairline()
            HStack(spacing: 12) {
                Text("Minutes")
                    .font(.tkRow)
                    .foregroundStyle(TK.text)
                Spacer()
                TKSegmented([0, 15, 30, 45], selection: $minutes, fill: TK.elevated) { "\($0)m" }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
        }
        .tkCard(radius: TK.rCardSm, padding: nil, fill: TK.bg)
    }

    private var footer: some View {
        HStack(spacing: 10) {
            TKSecondaryButton(title: "Cancel") { dismiss() }
            Spacer()
            TKAccentButton(
                title: totalMinutes > 0 ? "Log \(totalMinutes.minutesFormatted)" : "Log time",
                enabled: totalMinutes > 0
            ) {
                let trimmed = note.trimmingCharacters(in: .whitespaces)
                onLog(TimeLog(
                    user: me,
                    minutes: totalMinutes,
                    date: date,
                    note: trimmed.isEmpty ? nil : trimmed
                ))
                dismiss()
            }
        }
        .padding(.horizontal, TK.gutter)
        .padding(.vertical, 12)
        .overlay(alignment: .top) { TKHairline(color: TK.border) }
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        TimeLogSheet(task: TaskItem.samples[0]) { _ in }
    }
    .preferredColorScheme(.dark)
}
