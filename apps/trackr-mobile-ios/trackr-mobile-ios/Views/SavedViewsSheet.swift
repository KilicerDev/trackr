//
//  SavedViewsSheet.swift
//  trackr-mobile-ios
//
//  Small sheet listing saved views; tapping one applies its filters.
//

import SwiftUI

struct SavedViewsSheet: View {
    @Binding var filters: TaskFilters
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(SavedView.samples) { view in
                Button {
                    filters = view.filters
                    dismiss()
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: view.icon)
                            .font(.system(size: 17))
                            .foregroundStyle(Color.accentColor)
                            .frame(width: 26)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(view.name)
                                .foregroundStyle(Color.primary)
                            Text(view.summary)
                                .font(.footnote)
                                // Concrete color: inside a Button label,
                                // .secondary derives from the tint and
                                // renders as washed-out accent.
                                .foregroundStyle(Color(.secondaryLabel))
                                .lineLimit(1)
                        }

                        Spacer()

                        if view.filters == filters {
                            Image(systemName: "checkmark")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                }
            }
            .navigationTitle("Views")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium])
    }
}

#Preview {
    @Previewable @State var filters = TaskFilters()
    Color.clear.sheet(isPresented: .constant(true)) {
        SavedViewsSheet(filters: $filters)
    }
}
