//
//  TimeLogSheet.swift
//  trackr-mobile-ios
//
//  Web parity (tasks/TimeLogger.svelte): hours + minutes + date + note,
//  with the most recent entries below.
//

import SwiftUI

struct TimeLogSheet: View {
    let task: TaskItem
    let onLog: (TimeLog) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var hours = 0
    @State private var minutes = 30
    @State private var date = Date.now
    @State private var note = ""

    private var totalMinutes: Int { hours * 60 + minutes }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Hours", selection: $hours) {
                        ForEach(0..<13) { Text("\($0)h").tag($0) }
                    }
                    Picker("Minutes", selection: $minutes) {
                        ForEach([0, 15, 30, 45], id: \.self) { Text("\($0)m").tag($0) }
                    }
                    // Plain-text value + invisible native DatePicker so the
                    // row height matches the picker rows above it.
                    LabeledContent("Date") {
                        Text(date.formatted(.dateTime.day().month(.abbreviated).year()))
                            .foregroundStyle(.secondary)
                            .overlay {
                                DatePicker("Date", selection: $date, displayedComponents: .date)
                                    .labelsHidden()
                                    .colorMultiply(.clear)
                            }
                    }
                    TextField("What did you work on?", text: $note, axis: .vertical)
                        .lineLimit(2...4)
                }

                if !task.timeLogs.isEmpty {
                    Section("Recent") {
                        ForEach(task.timeLogs.sorted { $0.date > $1.date }.prefix(5)) { log in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(log.minutes.minutesFormatted)
                                        .font(.system(size: 14, weight: .medium, design: .monospaced))
                                    if let note = log.note {
                                        Text(note)
                                            .font(.footnote)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                }
                                Spacer()
                                Text(log.date.formatted(.dateTime.day().month(.abbreviated)))
                                    .font(.system(size: 12, design: .monospaced))
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Log Time")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Log") {
                        let trimmed = note.trimmingCharacters(in: .whitespaces)
                        onLog(TimeLog(
                            user: TaskItem.sampleUsers[0],  // current user later
                            minutes: totalMinutes,
                            date: date,
                            note: trimmed.isEmpty ? nil : trimmed
                        ))
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .disabled(totalMinutes == 0)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        TimeLogSheet(task: TaskItem.samples[0]) { _ in }
    }
}
