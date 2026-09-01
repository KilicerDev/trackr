// Package components holds the reusable building blocks of the TUI:
// pane chrome, the status bar, the custom list view, modal overlay
// plumbing, pickers, and the message composer.
package components

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
	"github.com/KilicerDev/trackr/cli/internal/tui/ui"
)

// Pane frames body in a rounded border with the title embedded in the
// top rule, lazygit-style:
//
//	╭─ Tasks · mine ────────╮
//	│ body                  │
//	╰───────────────────────╯
//
// w and h are the pane's outer dimensions; the body is clipped/padded
// to the inner area. A focused pane draws its border in the accent
// color.
func Pane(title string, focused bool, w, h int, body string) string {
	if w < 4 || h < 2 {
		return ""
	}
	borderColor := theme.Border
	titleStyle := theme.DimStyle
	if focused {
		borderColor = theme.Accent
		titleStyle = theme.AccentStyle.Bold(true)
	}
	bs := lipgloss.NewStyle().Foreground(borderColor)

	innerW, innerH := w-2, h-2

	// Top rule with embedded title.
	var top strings.Builder
	top.WriteString(bs.Render("╭"))
	if title != "" {
		label := " " + ui.Truncate(title, innerW-3) + " "
		fill := innerW - 1 - ansi.StringWidth(label)
		top.WriteString(bs.Render("─"))
		top.WriteString(titleStyle.Render(label))
		if fill > 0 {
			top.WriteString(bs.Render(strings.Repeat("─", fill)))
		}
	} else {
		top.WriteString(bs.Render(strings.Repeat("─", innerW)))
	}
	top.WriteString(bs.Render("╮"))

	// Body: clip to innerH lines, pad each to innerW.
	lines := strings.Split(body, "\n")
	if len(lines) > innerH {
		lines = lines[:innerH]
	}
	var mid strings.Builder
	side := bs.Render("│")
	for i := range innerH {
		var line string
		if i < len(lines) {
			line = lines[i]
		}
		if width := ansi.StringWidth(line); width > innerW {
			line = ansi.Truncate(line, innerW, "…")
		} else if width < innerW {
			line += strings.Repeat(" ", innerW-width)
		}
		mid.WriteString(side)
		mid.WriteString(line)
		mid.WriteString(side)
		mid.WriteString("\n")
	}

	bottom := bs.Render("╰" + strings.Repeat("─", innerW) + "╯")

	return top.String() + "\n" + mid.String() + bottom
}
