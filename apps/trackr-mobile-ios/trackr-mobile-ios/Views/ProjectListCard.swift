//
//  ProjectListCard.swift
//  trackr-mobile-ios
//
//  Mobile version of web components/projects/ProjectCard.svelte: icon
//  tile, name + mono key, status, description, color bar, members, lead
//  and relative updated time.
//

import SwiftUI

struct ProjectListCard: View {
    let project: ProjectItem
    let openTasks: Int
    var onHistory: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 11)
                    .fill(
                        LinearGradient(
                            colors: [project.color, project.color.opacity(0.55)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 40, height: 40)
                    .overlay(
                        Text(project.initial)
                            .font(.system(size: 19, weight: .semibold))
                            .foregroundStyle(.white)
                    )
                VStack(alignment: .leading, spacing: 2) {
                    Text(project.name)
                        .font(.system(size: 15, weight: .semibold))
                        .lineLimit(1)
                    Text("\(project.key) · \(openTasks) open")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.tertiary)
                }
                Spacer(minLength: 8)
                HStack(spacing: 8) {
                    Circle()
                        .fill(project.status.color)
                        .frame(width: 8, height: 8)
                    Text(project.status.label)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                    if let onHistory {
                        Button(action: onHistory) {
                            Image(systemName: "clock.arrow.circlepath")
                                .font(.system(size: 13))
                                .foregroundStyle(Color(.secondaryLabel))
                                .frame(width: 28, height: 28)
                                .background(Color(.tertiarySystemFill), in: .circle)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if !project.about.isEmpty {
                Text(project.about)
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            RoundedRectangle(cornerRadius: 2)
                .fill(project.color)
                .frame(height: 3)

            HStack {
                AvatarStack(users: project.members, size: 22)
                Spacer()
                Text(footerText)
                    .font(.system(size: 12))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
        )
    }

    private var footerText: String {
        let updated = project.updatedAt.formatted(.relative(presentation: .named))
        if let lead = project.lead {
            return "Lead \(lead.name.split(separator: " ").first.map(String.init) ?? lead.name) · \(updated)"
        }
        return updated
    }
}

#Preview {
    ScrollView {
        LazyVStack(spacing: 10) {
            ForEach(ProjectItem.samples) {
                ProjectListCard(project: $0, openTasks: 3)
            }
        }
        .padding(16)
    }
    .background(Color(.systemGroupedBackground))
}
