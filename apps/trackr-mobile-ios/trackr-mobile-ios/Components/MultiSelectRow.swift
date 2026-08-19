//
//  MultiSelectRow.swift
//  trackr-mobile-ios
//
//  A Form row that opens a native iOS checkmark menu (Toggles in a Menu)
//  for picking multiple values — no custom picker UI.
//

import SwiftUI

struct MultiSelectRow<Option: Hashable>: View {
    let title: String
    let options: [(value: Option, label: String)]
    @Binding var selection: Set<Option>

    var body: some View {
        Menu {
            ForEach(options, id: \.value) { option in
                Toggle(option.label, isOn: binding(for: option.value))
            }
        } label: {
            HStack {
                Text(title)
                    .foregroundStyle(Color.primary)
                Spacer()
                // Concrete colors: hierarchical styles inside a Menu
                // label derive from the tint and render accent-red.
                Text(summary)
                    .foregroundStyle(Color(.secondaryLabel))
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color(.tertiaryLabel))
            }
        }
    }

    private func binding(for value: Option) -> Binding<Bool> {
        Binding(
            get: { selection.contains(value) },
            set: { isOn in
                if isOn { selection.insert(value) } else { selection.remove(value) }
            }
        )
    }

    private var summary: String {
        switch selection.count {
        case 0: "Any"
        case 1: options.first { selection.contains($0.value) }?.label ?? "1 selected"
        default: "\(selection.count) selected"
        }
    }
}

#Preview {
    @Previewable @State var selection: Set<TaskStatus> = [.todo]
    Form {
        MultiSelectRow(
            title: "Status",
            options: TaskStatus.allCases.map { ($0, $0.label) },
            selection: $selection
        )
    }
}
