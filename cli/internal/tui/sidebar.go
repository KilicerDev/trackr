package tui

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
	"github.com/KilicerDev/trackr/cli/internal/tui/ui"
)

type sidebarEntryKind int

const (
	entryView sidebarEntryKind = iota
	entryProject
)

type sidebarEntry struct {
	kind       sidebarEntryKind
	view       viewID
	projectKey string
	label      string
	badge      string
}

// sidebar is the left pane: switchable views plus the project list
// (which toggles the tasks project filter).
type sidebar struct {
	session       *ui.Session
	entries       []sidebarEntry
	cursor        int
	activeView    viewID
	activeProject string
	width, height int
}

func (s *sidebar) rebuild() {
	s.entries = s.entries[:0]
	if s.session.Surface("tasks") {
		s.entries = append(s.entries, sidebarEntry{kind: entryView, view: viewTasks, label: "Tasks"})
	}
	if s.session.Surface("tickets") {
		s.entries = append(s.entries, sidebarEntry{kind: entryView, view: viewTickets, label: "Tickets"})
	}
	badge := ""
	if s.session.Me != nil && s.session.Me.UnreadCount > 0 {
		badge = fmt.Sprintf("(%d)", s.session.Me.UnreadCount)
	}
	s.entries = append(s.entries, sidebarEntry{kind: entryView, view: viewInbox, label: "Inbox", badge: badge})
	if s.session.Projects != nil && s.session.Surface("tasks") {
		for _, p := range s.session.Projects.Projects {
			s.entries = append(s.entries, sidebarEntry{
				kind:       entryProject,
				projectKey: p.Key,
				label:      p.Name,
				badge:      p.Key,
			})
		}
	}
	if s.cursor >= len(s.entries) {
		s.cursor = max(len(s.entries)-1, 0)
	}
}

// update handles keys while the sidebar is focused. It returns the
// selected entry on enter/space.
func (s *sidebar) update(key tea.KeyPressMsg) (selected *sidebarEntry, handled bool) {
	switch key.String() {
	case "j", "down":
		if s.cursor < len(s.entries)-1 {
			s.cursor++
		}
	case "k", "up":
		if s.cursor > 0 {
			s.cursor--
		}
	case "g":
		s.cursor = 0
	case "G":
		s.cursor = max(len(s.entries)-1, 0)
	case "enter", "space", "l":
		if s.cursor < len(s.entries) {
			e := s.entries[s.cursor]
			return &e, true
		}
	default:
		return nil, false
	}
	return nil, true
}

func (s *sidebar) view(focused bool) string {
	var b strings.Builder
	section := theme.FaintStyle.Bold(true)
	wroteProjects := false
	b.WriteString(" " + section.Render("VIEWS") + "\n")
	for i, e := range s.entries {
		if e.kind == entryProject && !wroteProjects {
			b.WriteString("\n " + section.Render("PROJECTS") + "\n")
			wroteProjects = true
		}
		marker := "  "
		style := theme.MutedStyle
		switch e.kind {
		case entryView:
			if e.view == s.activeView {
				marker = theme.AccentStyle.Render("● ")
				style = theme.TitleStyle
			}
		case entryProject:
			if e.projectKey == s.activeProject {
				marker = theme.AccentStyle.Render("● ")
				style = theme.TitleStyle
			}
		}
		if focused && i == s.cursor {
			marker = theme.AccentStyle.Render("▸ ")
		}
		line := " " + marker
		if e.kind == entryProject {
			line += theme.FaintStyle.Render(ui.Pad(e.projectKey, 5))
			line += style.Render(ui.Truncate(e.label, s.width-11))
		} else {
			line += style.Render(e.label)
			if e.badge != "" {
				line += " " + theme.AccentStyle.Render(e.badge)
			}
		}
		b.WriteString(line + "\n")
	}
	return b.String()
}
