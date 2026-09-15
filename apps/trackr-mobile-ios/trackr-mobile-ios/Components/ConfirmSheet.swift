//
//  ConfirmSheet.swift
//  trackr-mobile-ios
//
//  Bottom confirmation sheet (action-sheet style) — replaces
//  confirmationDialog, which iOS 26 anchors to the source button as a
//  popover instead of sliding up from the bottom. Kit-styled: card sheet,
//  handle, 17pt title, primary / secondary / destructive actions and a
//  quiet cancel.
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
    var message: String? = nil
    var cancelLabel = "Cancel"
    let actions: [Action]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 10) {
            TKSheetHandle()
                .padding(.top, 10)
            Text(title)
                .font(.tkSheetTitle)
                .foregroundStyle(TK.text)
                .multilineTextAlignment(.center)
                .padding(.top, 10)
            if let message {
                Text(message)
                    .font(.system(size: 13))
                    .foregroundStyle(TK.text2)
                    .multilineTextAlignment(.center)
            }
            VStack(spacing: 8) {
                ForEach(actions) { action in
                    button(for: action)
                }
            }
            .padding(.top, 10)

            TKQuietButton(title: cancelLabel, weight: .medium) { dismiss() }
                .padding(.top, 2)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, TK.gutter)
        .tkSheet(detents: [.height(CGFloat(150 + (message == nil ? 0 : 24) + actions.count * 58))])
    }

    @ViewBuilder
    private func button(for action: Action) -> some View {
        switch action.style {
        case .prominent:
            TKPrimaryButton(title: action.label) {
                dismiss()
                action.handler()
            }
        case .normal:
            TKSecondaryButton(title: action.label, height: 50, expand: true) {
                dismiss()
                action.handler()
            }
        case .destructive:
            Button {
                dismiss()
                action.handler()
            } label: {
                Text(action.label)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(TK.danger)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(TK.elevated, in: .rect(cornerRadius: TK.rButton))
                    .overlay(RoundedRectangle(cornerRadius: TK.rButton).strokeBorder(TK.borderStrong, lineWidth: 1))
            }
            .buttonStyle(TKScaleStyle())
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
                .init(label: "Discard session", style: .destructive) {},
            ]
        )
    }
    .preferredColorScheme(.dark)
}
