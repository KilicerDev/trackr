// Package theme holds the trackr TUI palette, glyph maps, and shared
// lipgloss styles. The values mirror the web app's design tokens
// (web/src/app.css and web/src/lib/config/taxonomy.ts) so the terminal
// UI reads as the same product. The TUI ships a dark theme only, like
// the web default; colors are written as truecolor hex and downsampled
// automatically by lipgloss on lesser terminals.
package theme

import (
	"image/color"

	"charm.land/lipgloss/v2"
)

// Base palette.
var (
	Accent = lipgloss.Color("#ff4867")

	Bg       = lipgloss.Color("#100F14")
	BgElev   = lipgloss.Color("#17161C")
	Surface  = lipgloss.Color("#1C1B22")
	Surface2 = lipgloss.Color("#232229")

	Border       = lipgloss.Color("#2C2B33")
	BorderStrong = lipgloss.Color("#38363F")

	Text  = lipgloss.Color("#F5F4F8")
	Text2 = lipgloss.Color("#B0AEB8")
	Text3 = lipgloss.Color("#77757F")
	Text4 = lipgloss.Color("#57555E")

	Danger   = lipgloss.Color("#ef4f5e")
	Internal = lipgloss.Color("#e9c46a") // internal-note yellow
	DueSoon  = lipgloss.Color("#d8a24a")
	Success  = lipgloss.Color("#7fc8a9")
	Info     = lipgloss.Color("#7a9cf0")
)

// Shared styles.
var (
	TitleStyle  = lipgloss.NewStyle().Foreground(Text).Bold(true)
	DimStyle    = lipgloss.NewStyle().Foreground(Text3)
	FaintStyle  = lipgloss.NewStyle().Foreground(Text4)
	MutedStyle  = lipgloss.NewStyle().Foreground(Text2)
	AccentStyle = lipgloss.NewStyle().Foreground(Accent)
	DangerStyle = lipgloss.NewStyle().Foreground(Danger)
)

// Meta describes how one enum value renders: a single-cell glyph, its
// color, and the human label matching the web UI's strings.
type Meta struct {
	Glyph string
	Color color.Color
	Label string
}

// TaskStatuses in workflow display order (matches the web's grouping).
var TaskStatusOrder = []string{"in_progress", "in_review", "todo", "backlog", "paused", "done"}

var TaskStatus = map[string]Meta{
	"backlog":     {"◌", lipgloss.Color("#7c7c84"), "Backlog"},
	"todo":        {"○", lipgloss.Color("#9aa4b2"), "Todo"},
	"in_progress": {"◐", lipgloss.Color("#f0a85c"), "In Progress"},
	"paused":      {"⊖", lipgloss.Color("#e9c46a"), "Paused"},
	"in_review":   {"◕", lipgloss.Color("#b591e3"), "In Review"},
	"done":        {"●", lipgloss.Color("#7fc8a9"), "Done"},
}

// TaskStatusOptions is the picker order (workflow forward).
var TaskStatusOptions = []string{"backlog", "todo", "in_progress", "paused", "in_review", "done"}

var TicketStatus = map[string]Meta{
	"open":                {"○", lipgloss.Color("#7a9cf0"), "Open"},
	"in_progress":         {"◐", lipgloss.Color("#f0a85c"), "In Progress"},
	"waiting_on_customer": {"◒", lipgloss.Color("#b591e3"), "Waiting on customer"},
	"waiting_on_agent":    {"◓", lipgloss.Color("#ef7a6d"), "Waiting on agent"},
	"paused":              {"⊖", lipgloss.Color("#e9c46a"), "Paused"},
	"resolved":            {"●", lipgloss.Color("#7fc8a9"), "Resolved"},
	"closed":              {"●", lipgloss.Color("#7c7c84"), "Closed"},
}

var TicketStatusOptions = []string{"open", "in_progress", "waiting_on_customer", "waiting_on_agent", "paused", "resolved", "closed"}

// Priority renders as three ascending bars, matching the web's
// PriorityBars component. Urgent additionally renders bold.
var Priority = map[string]Meta{
	"none":   {"···", lipgloss.Color("#5b5b62"), "None"},
	"low":    {"▂··", lipgloss.Color("#7a9cf0"), "Low"},
	"medium": {"▂▄·", lipgloss.Color("#f0a85c"), "Medium"},
	"high":   {"▂▄▆", lipgloss.Color("#ef7a6d"), "High"},
	"urgent": {"▂▄▆", lipgloss.Color("#ef4f5e"), "Urgent"},
}

var PriorityOptions = []string{"none", "low", "medium", "high", "urgent"}

// TicketPriorityOptions excludes "none" (tickets always carry one).
var TicketPriorityOptions = []string{"low", "medium", "high", "urgent"}

var TaskType = map[string]Meta{
	"task":        {"■", lipgloss.Color("#7a9cf0"), "Task"},
	"bug":         {"●", lipgloss.Color("#ef7a6d"), "Bug"},
	"improvement": {"▲", lipgloss.Color("#ef7a6d"), "Improvement"},
	"feature":     {"✦", lipgloss.Color("#7fc8a9"), "Feature"},
	"chore":       {"⚙", lipgloss.Color("#c08bd6"), "Chore"},
}

var TaskTypeOptions = []string{"task", "bug", "improvement", "feature", "chore"}

var TicketCategory = map[string]Meta{
	"general":         {"○", lipgloss.Color("#9aa4b2"), "General"},
	"billing":         {"○", lipgloss.Color("#e9c46a"), "Billing"},
	"technical_issue": {"○", lipgloss.Color("#ef7a6d"), "Technical issue"},
	"feature_request": {"○", lipgloss.Color("#7fc8a9"), "Feature request"},
}

var TicketCategoryOptions = []string{"general", "billing", "technical_issue", "feature_request"}

var ChannelLabel = map[string]string{
	"web_form": "Web form",
	"email":    "Email",
	"chat":     "Chat",
	"api":      "API",
}

// lookup returns the Meta for value, or a neutral fallback that shows
// the raw value so unknown server enums never render blank.
func lookup(m map[string]Meta, value string) Meta {
	if meta, ok := m[value]; ok {
		return meta
	}
	return Meta{Glyph: "•", Color: Text3, Label: value}
}

func TaskStatusMeta(s string) Meta     { return lookup(TaskStatus, s) }
func TicketStatusMeta(s string) Meta   { return lookup(TicketStatus, s) }
func PriorityMeta(s string) Meta       { return lookup(Priority, s) }
func TaskTypeMeta(s string) Meta       { return lookup(TaskType, s) }
func TicketCategoryMeta(s string) Meta { return lookup(TicketCategory, s) }

// Styled renders the meta's glyph in its color.
func (m Meta) Styled() string {
	st := lipgloss.NewStyle().Foreground(m.Color)
	if m.Label == "Urgent" {
		st = st.Bold(true)
	}
	return st.Render(m.Glyph)
}

// StyledLabel renders "glyph label" in the meta's color.
func (m Meta) StyledLabel() string {
	st := lipgloss.NewStyle().Foreground(m.Color)
	if m.Label == "Urgent" {
		st = st.Bold(true)
	}
	return st.Render(m.Glyph + " " + m.Label)
}

// UserColor parses the per-user color the server assigns (hex string);
// falls back to the secondary text color.
func UserColor(hex string) color.Color {
	if len(hex) == 7 && hex[0] == '#' {
		return lipgloss.Color(hex)
	}
	return Text2
}
