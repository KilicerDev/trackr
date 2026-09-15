//
//  CreateSheet.swift
//  trackr-mobile-ios
//
//  The "+" sheet. Interim: routes to the existing task/ticket sheets by
//  `model.createKind` until the unified create sheet (ticket / task /
//  session with a kind switcher) replaces it.
//

import SwiftUI

struct CreateSheet: View {
    @Bindable var model: AppModel

    var body: some View {
        switch model.createKind {
        case .ticket:
            CreateTicketSheet(tickets: model.tickets, model: model) { ticket, files in
                model.addTicket(ticket, files: files)
                model.toast("\(ticket.id) created")
            }
        case .task, .session:
            CreateTaskSheet(tasks: model.tasks, model: model, initialProject: model.createProjectName) { task, files in
                model.addTask(task, files: files)
                model.toast("\(task.id) created")
            }
        }
    }
}
