//
//  CardContextMenus.swift
//  trackr-mobile-ios
//
//  Long-press quick edits on list cards: Status / Priority (/ Category)
//  submenus that write into the shared model and push, without opening
//  the detail view. Attach at the list call sites — the cards themselves
//  stay dumb views.
//

import SwiftUI

extension View {
    func taskContextMenu(for task: TaskItem, model: AppModel?) -> some View {
        modifier(TaskCardMenu(task: task, model: model))
    }

    func ticketContextMenu(for ticket: TicketItem, model: AppModel?) -> some View {
        modifier(TicketCardMenu(ticket: ticket, model: model))
    }
}

/// Menu + delete confirmation live together: the destructive menu item
/// only opens the bottom sheet, the sheet's button actually deletes.
private struct TaskCardMenu: ViewModifier {
    let task: TaskItem
    let model: AppModel?
    @State private var confirmingDelete = false

    func body(content: Content) -> some View {
        content
            .contextMenu {
                TaskContextActions(task: task, model: model) {
                    confirmingDelete = true
                }
            }
            .sheet(isPresented: $confirmingDelete) {
                ConfirmSheet(
                    title: "Delete \(task.id)? This can't be undone.",
                    actions: [
                        .init(label: "Delete Task", style: .destructive) {
                            model?.sync?.deleteTask(task)
                        }
                    ]
                )
            }
    }
}

private struct TicketCardMenu: ViewModifier {
    let ticket: TicketItem
    let model: AppModel?
    @State private var confirmingDelete = false

    func body(content: Content) -> some View {
        content
            .contextMenu {
                TicketContextActions(ticket: ticket, model: model) {
                    confirmingDelete = true
                }
            }
            .sheet(isPresented: $confirmingDelete) {
                ConfirmSheet(
                    title: "Delete \(ticket.id)? This can't be undone.",
                    actions: [
                        .init(label: "Delete Ticket", style: .destructive) {
                            model?.sync?.deleteTicket(ticket)
                        }
                    ]
                )
            }
    }
}

struct TaskContextActions: View {
    let task: TaskItem
    let model: AppModel?
    var onDelete: (() -> Void)? = nil

    var body: some View {
        Menu {
            Picker("Status", selection: binding(\.status)) {
                ForEach(TaskStatus.allCases) { Text($0.label).tag($0) }
            }
        } label: {
            Label("Status", systemImage: "arrow.triangle.2.circlepath")
        }
        Menu {
            Picker("Priority", selection: binding(\.priority)) {
                ForEach(TaskPriority.allCases) { Text($0.label).tag($0) }
            }
        } label: {
            Label("Priority", systemImage: "flag")
        }
        Divider()
        Button(role: .destructive) {
            onDelete?()
        } label: {
            Label("Delete", systemImage: "trash")
        }
    }

    /// Reads/writes the live model copy (the card's `task` may be stale
    /// after a quick edit) and pushes on every change.
    private func binding<V: Hashable>(_ keyPath: WritableKeyPath<TaskItem, V>) -> Binding<V> {
        Binding(
            get: {
                (model?.tasks.first { $0.id == task.id } ?? task)[keyPath: keyPath]
            },
            set: { newValue in
                guard let model,
                      let index = model.tasks.firstIndex(where: { $0.id == task.id })
                else { return }
                model.tasks[index][keyPath: keyPath] = newValue
                model.sync?.pushTask(model.tasks[index])
            }
        )
    }
}

struct TicketContextActions: View {
    let ticket: TicketItem
    let model: AppModel?
    var onDelete: (() -> Void)? = nil

    var body: some View {
        Menu {
            Picker("Status", selection: binding(\.status)) {
                ForEach(TicketStatus.allCases) { Text($0.label).tag($0) }
            }
        } label: {
            Label("Status", systemImage: "arrow.triangle.2.circlepath")
        }
        Menu {
            Picker("Priority", selection: binding(\.priority)) {
                ForEach(TaskPriority.ticketCases, id: \.self) { Text($0.label).tag($0) }
            }
        } label: {
            Label("Priority", systemImage: "flag")
        }
        Menu {
            Picker("Category", selection: binding(\.category)) {
                ForEach(TicketCategory.allCases) { Text($0.label).tag($0) }
            }
        } label: {
            Label("Category", systemImage: "square.grid.2x2")
        }
        Divider()
        Button(role: .destructive) {
            onDelete?()
        } label: {
            Label("Delete", systemImage: "trash")
        }
    }

    private func binding<V: Hashable>(_ keyPath: WritableKeyPath<TicketItem, V>) -> Binding<V> {
        Binding(
            get: {
                (model?.tickets.first { $0.id == ticket.id } ?? ticket)[keyPath: keyPath]
            },
            set: { newValue in
                guard let model,
                      let index = model.tickets.firstIndex(where: { $0.id == ticket.id })
                else { return }
                model.tickets[index][keyPath: keyPath] = newValue
                model.sync?.pushTicket(model.tickets[index])
            }
        )
    }
}
