//
//  LogsView.swift
//  trackr-mobile-ios
//
//  On-device log viewer for support/debugging: level filter, mono
//  entries, share and clear. Design phase — sample entries; the real
//  ones come from the app's OSLog store later.
//

import SwiftUI

struct LogsView: View {
    private enum Level: String, CaseIterable, Identifiable {
        case all = "All", info = "Info", warn = "Warn", error = "Error"
        var id: String { rawValue }
    }

    private struct LogEntry: Identifiable {
        let id = UUID()
        var date: Date
        var level: String  // DEBUG / INFO / WARN / ERROR
        var subsystem: String
        var message: String

        var color: Color {
            switch level {
            case "ERROR": Color(hex: 0xEF4F5E)
            case "WARN": Color(hex: 0xE9C46A)
            case "INFO": Color(hex: 0x7A9CF0)
            default: Color(hex: 0x9AA4B2)
            }
        }
    }

    @State private var filter: Level = .all
    @State private var entries: [LogEntry] = {
        let cal = Calendar.current
        func ago(minutes: Int) -> Date {
            cal.date(byAdding: .minute, value: -minutes, to: .now)!
        }
        return [
            LogEntry(date: ago(minutes: 1), level: "INFO", subsystem: "sync",
                     message: "Delta sync finished: 4 tasks, 2 tickets updated"),
            LogEntry(date: ago(minutes: 1), level: "DEBUG", subsystem: "api",
                     message: "GET /api/v1/notes/list → 200 (84ms)"),
            LogEntry(date: ago(minutes: 6), level: "WARN", subsystem: "api",
                     message: "GET /api/v1/wiki → 200 (2.4s) — slow response"),
            LogEntry(date: ago(minutes: 12), level: "INFO", subsystem: "session",
                     message: "Work session finished: Mobile App, 47m logged to TRK-142"),
            LogEntry(date: ago(minutes: 31), level: "ERROR", subsystem: "push",
                     message: "APNs token registration failed: network unreachable"),
            LogEntry(date: ago(minutes: 32), level: "INFO", subsystem: "push",
                     message: "Retrying token registration in 60s (attempt 2/5)"),
            LogEntry(date: ago(minutes: 58), level: "DEBUG", subsystem: "api",
                     message: "POST /api/v1/notes → 201 (120ms)"),
            LogEntry(date: ago(minutes: 75), level: "INFO", subsystem: "auth",
                     message: "Bearer token refreshed, expires in 24h"),
            LogEntry(date: ago(minutes: 130), level: "WARN", subsystem: "sync",
                     message: "Conflict on TRK-131: server version kept"),
            LogEntry(date: ago(minutes: 190), level: "INFO", subsystem: "app",
                     message: "App launched (design preview build)"),
        ]
    }()

    private var filtered: [LogEntry] {
        switch filter {
        case .all: entries
        case .info: entries.filter { $0.level == "INFO" || $0.level == "DEBUG" }
        case .warn: entries.filter { $0.level == "WARN" }
        case .error: entries.filter { $0.level == "ERROR" }
        }
    }

    var body: some View {
        List {
            Section {
                Picker("Level", selection: $filter) {
                    ForEach(Level.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            Section {
                ForEach(filtered) { entry in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            Text(entry.level)
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundStyle(entry.color)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(entry.color.opacity(0.12), in: .rect(cornerRadius: 5))
                            Text(entry.date.formatted(.dateTime.hour().minute().second()))
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(.tertiary)
                            Text(entry.subsystem)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                        Text(entry.message)
                            .font(.system(size: 13, design: .monospaced))
                            .lineSpacing(2)
                    }
                    .padding(.vertical, 2)
                }
                if filtered.isEmpty {
                    Text("No entries at this level.")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Logs")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    // Share log export — wired up later
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                Button {
                    entries.removeAll()
                } label: {
                    Image(systemName: "trash")
                }
                .disabled(entries.isEmpty)
            }
        }
    }
}

#Preview {
    NavigationStack {
        LogsView()
    }
}
