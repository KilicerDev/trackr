// Package views contains the TUI screens: the three workspace views
// (tasks, tickets, inbox), the full-page detail views, the search
// palette, and the create/edit form modals.
package views

import (
	"strconv"
	"strings"
	"time"

	"charm.land/lipgloss/v2"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
	"github.com/KilicerDev/trackr/cli/internal/tui/ui"
)

// field is one row of a key/value detail block.
type field struct {
	label string
	value string // may contain styling; "" rows are skipped
}

// renderFields renders a label column + values, web-inspector style.
func renderFields(width int, fields []field) string {
	labelW := 0
	for _, f := range fields {
		if f.value != "" && len(f.label) > labelW {
			labelW = len(f.label)
		}
	}
	var b strings.Builder
	for _, f := range fields {
		if f.value == "" {
			continue
		}
		b.WriteString(" ")
		b.WriteString(theme.FaintStyle.Render(ui.Pad(f.label, labelW+2)))
		b.WriteString(ui.Truncate(f.value, width-labelW-4))
		b.WriteString("\n")
	}
	return b.String()
}

// wrap soft-wraps plain text to a width with a leading space margin.
func wrap(text string, width int) string {
	if width < 8 {
		width = 8
	}
	wrapped := lipgloss.NewStyle().Width(width).Render(text)
	return " " + strings.ReplaceAll(wrapped, "\n", "\n ")
}

// names resolves user ids through a UserRef map, colored per user.
func names(ids []string, users map[string]api.UserRef, styled bool) string {
	if len(ids) == 0 {
		return ""
	}
	parts := make([]string, 0, len(ids))
	for _, id := range ids {
		ref, ok := users[id]
		if !ok || ref.Name == "" {
			parts = append(parts, "unknown")
			continue
		}
		if styled {
			parts = append(parts, lipgloss.NewStyle().Foreground(theme.UserColor(ref.Color)).Render(ref.Name))
		} else {
			parts = append(parts, ref.Name)
		}
	}
	return strings.Join(parts, ", ")
}

// firstName returns the first word of a resolved user name ("" when
// the id is unknown), for compact list columns.
func firstName(id string, users map[string]api.UserRef) string {
	ref, ok := users[id]
	if !ok || ref.Name == "" {
		return ""
	}
	name, _, _ := strings.Cut(ref.Name, " ")
	return name
}

// dueCell renders a colored due label for list rows.
func dueCell(now time.Time, due string, width int) string {
	if due == "" {
		return ui.Pad("", width)
	}
	label := ui.DueLabel(now, due)
	st := theme.DimStyle
	switch ui.DueTone(now, due) {
	case 2:
		st = theme.DangerStyle
	case 1:
		st = lipgloss.NewStyle().Foreground(theme.DueSoon)
	}
	return st.Render(ui.Pad(label, width))
}

// selectedStyle highlights the row under the cursor.
var selectedStyle = lipgloss.NewStyle().Background(theme.Surface2)

// rowLine assembles a row: a cursor marker, the content, then padding
// to the full width, with the selection background applied across it.
func rowLine(width int, selected bool, content string) string {
	marker := "  "
	if selected {
		marker = theme.AccentStyle.Render("▸ ")
	}
	line := marker + content
	if gap := width - lipgloss.Width(line); gap > 0 {
		line += strings.Repeat(" ", gap)
	}
	if selected {
		return selectedStyle.Render(line)
	}
	return line
}

// groupHeader renders a section header row: colored label, dim count,
// dashed fill.
func groupHeader(width int, meta theme.Meta, count int) string {
	label := lipgloss.NewStyle().Foreground(meta.Color).Bold(true).Render(meta.Label)
	countStr := theme.FaintStyle.Render(strconv.Itoa(count))
	head := " " + label + " " + countStr + " "
	fill := width - lipgloss.Width(head) - 1
	if fill > 0 {
		head += theme.FaintStyle.Render(strings.Repeat("─", fill))
	}
	return head
}
