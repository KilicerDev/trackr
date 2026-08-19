//
//  ConfirmSheet.swift
//  trackr-mobile-ios
//
//  Bottom confirmation sheet (action-sheet style) — replaces
//  confirmationDialog, which iOS 26 anchors to the source button as a
//  popover instead of sliding up from the bottom.
//

import SwiftUI

struct ConfirmSheet: View {
    struct Action: Identifiable {
        enum Style { case prominent, normal, destructive }

        let id = UUID()
        let label: String
        var style: Style = .normal
        let handler: () -> Void
    }

    let title: String
    var cancelLabel = "Cancel"
    let actions: [Action]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 10) {
            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .multilineTextAlignment(.center)
                .padding(.top, 26)
                .padding(.bottom, 8)

            ForEach(actions) { action in
                Button {
                    dismiss()
                    action.handler()
                } label: {
                    Text(action.label)
                        .font(.system(size: 16, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.plain)
                .foregroundStyle(foreground(for: action.style))
                .background(background(for: action.style), in: .rect(cornerRadius: 14))
            }

            Button(cancelLabel) { dismiss() }
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Color(.secondaryLabel))
                .padding(.vertical, 10)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .presentationDetents([.height(CGFloat(160 + actions.count * 60))])
        .presentationDragIndicator(.visible)
    }

    private func foreground(for style: Action.Style) -> Color {
        switch style {
        case .prominent: .white
        case .normal: Color.primary
        case .destructive: Color(hex: 0xEF4F5E)
        }
    }

    private func background(for style: Action.Style) -> Color {
        switch style {
        case .prominent: .accentColor
        case .normal, .destructive: Color(.secondarySystemGroupedBackground)
        }
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        ConfirmSheet(
            title: "Are you done with this task?",
            cancelLabel: "Keep working",
            actions: [
                .init(label: "Yes — mark as Done", style: .prominent) {},
                .init(label: "Not yet — keep In Progress") {},
            ]
        )
    }
}
