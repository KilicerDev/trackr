//
//  CreateTicketSheet.swift
//  trackr-mobile-ios
//
//  Thin wrapper over the unified create form (`CreateEntityForm`) pinned to
//  the ticket kind: org, subject, message, category, priority, assignees,
//  attachments — the web CreateTicketModal essentials.
//

import SwiftUI

struct CreateTicketSheet: View {
    /// Existing tickets — source for org options and the next display id.
    let tickets: [TicketItem]
    var model: AppModel? = nil
    /// Preselected organization key (e.g. when opened from an org's page).
    var initialOrgKey: String? = nil
    /// Staged files ride along in the same create request (multipart), so
    /// the server can list them in the `ticket.created` webhook.
    let onCreate: (TicketItem, [PickedFile]) -> Void

    var body: some View {
        CreateEntityForm(
            model: model,
            tasks: model?.tasks ?? [],
            tickets: tickets,
            initialKind: .ticket,
            allowsKindSwitch: false,
            initialOrgKey: initialOrgKey,
            onCreateTicket: onCreate
        )
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        CreateTicketSheet(tickets: TicketItem.samples, model: AppModel()) { _, _ in }
    }
    .preferredColorScheme(.dark)
}
