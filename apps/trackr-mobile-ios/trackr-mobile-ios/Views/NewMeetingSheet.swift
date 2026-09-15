//
//  NewMeetingSheet.swift
//  trackr-mobile-ios
//
//  Web parity: NewMeetingDialog — title, date + time, a REQUIRED project
//  link, optional task, optional template that seeds the document. Every
//  option opens a TKPickerSheet / TKDatePickerSheet; the templates are a
//  picker-styled list inline.
//

import SwiftUI

struct NewMeetingSheet: View {
    @Bindable var model: AppModel
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var date = NewMeetingSheet.nextSlot(after: .now)
    @State private var project = ""
    @State private var taskId: String?
    @State private var template = MeetingTemplate.all[0]
    @State private var picker: Picker?

    private enum Picker: String, Identifiable {
        case date, time, project, task
        var id: String { rawValue }
    }

    private static let cal = Calendar.current

    private var projectOptions: [ProjectItem] { model.projects }
    private var taskOptions: [TaskItem] {
        model.tasks.filter { $0.project == project && $0.status != .done }
    }
    private var projectColor: Color? {
        model.projects.first { $0.name == project }?.color
    }
    private var canCreate: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty && !project.isEmpty
    }

    /// Half-hour slots over the day, as minutes since midnight.
    private static let slots: [Int] = stride(from: 0, to: 24 * 60, by: 30).map { $0 }

    private static func nextSlot(after date: Date) -> Date {
        let minutes = cal.component(.hour, from: date) * 60 + cal.component(.minute, from: date)
        let rounded = min(23 * 60 + 30, ((minutes + 29) / 30) * 30)
        return cal.date(bySettingHour: rounded / 60, minute: rounded % 60, second: 0, of: date) ?? date
    }

    private static func label(forMinutes minutes: Int) -> String {
        let probe = cal.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: .now) ?? .now
        return probe.formatted(.dateTime.hour().minute())
    }

    private var currentSlot: Int {
        let minutes = Self.cal.component(.hour, from: date) * 60 + Self.cal.component(.minute, from: date)
        return (minutes / 30) * 30
    }

    var body: some View {
        VStack(spacing: 0) {
            TKSheetHeader(title: "New meeting")
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    TKTextInput(text: $title, placeholder: "Meeting title")

                    VStack(spacing: 0) {
                        pickerRow(label: "Date", .date) {
                            TKRowValue(value: date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))
                        }
                        TKHairline(color: TK.hairlineStrong)
                        pickerRow(label: "Time", .time) {
                            HStack(spacing: 6) {
                                Text(date.formatted(.dateTime.hour().minute()))
                                    .font(.tkMono(15))
                                    .foregroundStyle(TK.text2)
                                TKChevron()
                            }
                        }
                        TKHairline(color: TK.hairlineStrong)
                        pickerRow(label: "Project", detail: "Required", .project) {
                            HStack(spacing: 6) {
                                if !project.isEmpty {
                                    TKDot(color: projectColor ?? Color(hex: 0x7C7C84))
                                }
                                TKRowValue(value: project.isEmpty ? "Choose…" : project,
                                           color: project.isEmpty ? TK.text4 : TK.text2)
                            }
                        }
                        TKHairline(color: TK.hairlineStrong)
                        pickerRow(label: "Task", .task) {
                            TKRowValue(value: taskId ?? "None", color: taskId == nil ? TK.text4 : TK.text2)
                        }
                    }
                    .tkCard(padding: nil, fill: TK.bg)

                    TKSectionLabel("Template")
                        .padding(.top, 4)
                    VStack(spacing: 0) {
                        ForEach(MeetingTemplate.all) { option in
                            Button {
                                template = option
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: option.icon)
                                        .font(.system(size: 15, weight: .medium))
                                        .foregroundStyle(TK.text2)
                                        .frame(width: 26)
                                    Text(option.name)
                                        .font(.system(size: 16))
                                        .foregroundStyle(TK.text)
                                    Spacer()
                                    if option == template {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 13, weight: .bold))
                                            .foregroundStyle(TK.accent)
                                    }
                                }
                                .padding(.horizontal, 14)
                                .frame(minHeight: 50)
                                .contentShape(.rect)
                            }
                            .buttonStyle(TKPressStyle())
                            if option.id != MeetingTemplate.all.last?.id {
                                TKHairline(color: TK.hairlineStrong)
                            }
                        }
                    }
                    .tkCard(radius: TK.rCardSm, padding: nil, fill: TK.bg)
                }
                .padding(.horizontal, TK.gutter)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            TKSheetFooter(cta: "Create", enabled: canCreate, onCancel: { dismiss() }, onConfirm: create)
        }
        .tkSheet()
        .onAppear {
            if project.isEmpty { project = projectOptions.first?.name ?? "" }
        }
        // A task belongs to its project — reset the link when it no
        // longer matches.
        .onChange(of: project) {
            if let taskId, !taskOptions.contains(where: { $0.id == taskId }) {
                self.taskId = nil
            }
        }
        .sheet(item: $picker) { which in
            switch which {
            case .date:
                TKDatePickerSheet(title: "Meeting date", selected: date, allowsClear: false) { picked in
                    guard let picked else { return }
                    let time = Self.cal.dateComponents([.hour, .minute], from: date)
                    date = Self.cal.date(bySettingHour: time.hour ?? 9, minute: time.minute ?? 0,
                                         second: 0, of: picked) ?? picked
                }
            case .time:
                TKPickerSheet(
                    title: "Time",
                    options: Self.slots.map { TKPickerOption($0, label: Self.label(forMinutes: $0)) },
                    selected: currentSlot
                ) { minutes in
                    date = Self.cal.date(bySettingHour: minutes / 60, minute: minutes % 60,
                                         second: 0, of: date) ?? date
                }
            case .project:
                TKPickerSheet(
                    title: "Project",
                    options: projectOptions.map { item in
                        TKPickerOption(item.name, label: item.name) { TKPickerIcon.dot(item.color) }
                    },
                    selected: project,
                    searchable: projectOptions.count > 6,
                    searchPlaceholder: "Search projects…"
                ) { project = $0 }
            case .task:
                TKPickerSheet(
                    title: "Task",
                    options: [TKPickerOption("", label: "None") { TKPickerIcon.symbol("minus", color: TK.text4) }]
                        + taskOptions.map { task in
                            TKPickerOption(task.id, label: "\(task.id) · \(task.title)") {
                                StatusDot(status: task.status, size: 16)
                            }
                        },
                    selected: taskId ?? ""
                ) { taskId = $0.isEmpty ? nil : $0 }
            }
        }
    }

    private func pickerRow<Trailing: View>(
        label: String, detail: String? = nil, _ target: Picker,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        Button {
            picker = target
        } label: {
            TKRow(label: label, detail: detail, trailing: trailing)
                .contentShape(.rect)
        }
        .buttonStyle(TKPressStyle())
    }

    private func create() {
        let note = NoteItem(
            id: "m-\(UUID().uuidString.prefix(8))",
            kind: .meeting,
            title: title.trimmingCharacters(in: .whitespaces),
            icon: "person.2",
            bodyHtml: template.bodyHtml,
            owner: model.me,
            meetingDate: date,
            project: project,
            taskId: taskId
        )
        model.notes.insert(note, at: 0)
        model.toast("Meeting note created")
        dismiss()
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        NewMeetingSheet(model: AppModel())
    }
    .preferredColorScheme(.dark)
}
