package views

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/x/ansi"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/tui/ui"
)

func fixtureTaskList() *api.TaskList {
	return &api.TaskList{
		Tasks: []api.Task{
			{ID: "PRJ-1", UUID: "u1", Title: "Oldest todo", Status: "todo", Priority: "low", Updated: "2026-01-01T00:00:00Z"},
			{ID: "PRJ-2", UUID: "u2", Title: "Ship the TUI", Status: "in_progress", Priority: "high", Updated: "2026-03-01T00:00:00Z", Assignees: []string{"user1"}},
			{ID: "PRJ-3", UUID: "u3", Title: "Newest todo", Status: "todo", Priority: "none", Updated: "2026-02-01T00:00:00Z"},
			{ID: "PRJ-4", UUID: "u4", Title: "Shipped", Status: "done", Priority: "medium", Updated: "2026-02-15T00:00:00Z"},
		},
		Users: map[string]api.UserRef{"user1": {Name: "Maja Schmidt", Color: "#7fc8a9"}},
	}
}

func TestTasksGroupingAndOrder(t *testing.T) {
	v := NewTasksView(context.Background(), nil, &ui.Session{}, "")
	v.SetSize(100, 30, 40, 30)
	v.list = fixtureTaskList()
	v.rebuildRows()

	view := v.View()
	// Group order: In Progress before Todo before Done.
	ip := strings.Index(view, "In Progress")
	todo := strings.Index(view, "Todo")
	done := strings.Index(view, "Done")
	if ip == -1 || todo == -1 || done == -1 {
		t.Fatalf("missing group headers:\n%s", view)
	}
	if !(ip < todo && todo < done) {
		t.Fatalf("group order wrong (ip=%d todo=%d done=%d):\n%s", ip, todo, done, view)
	}
	// Within todo: newest updated first.
	p3 := strings.Index(view, "PRJ-3")
	p1 := strings.Index(view, "PRJ-1")
	if !(p3 < p1) {
		t.Fatalf("todo group not sorted by updated desc:\n%s", view)
	}
	// First selectable item is the first in_progress task.
	if got := v.lv.SelectedID(); got != "PRJ-2" {
		t.Fatalf("initial selection = %q, want PRJ-2", got)
	}
	// Assignee name resolved in the row.
	if !strings.Contains(view, "Maja") {
		t.Fatalf("assignee first name missing:\n%s", view)
	}
}

func TestTasksDetailPane(t *testing.T) {
	v := NewTasksView(context.Background(), nil, &ui.Session{}, "")
	v.SetSize(100, 30, 44, 30)
	v.list = fixtureTaskList()
	v.rebuildRows()

	detail := v.DetailView()
	for _, want := range []string{"Ship the TUI", "In Progress", "High", "Maja Schmidt"} {
		if !strings.Contains(detail, want) {
			t.Errorf("detail pane missing %q:\n%s", want, detail)
		}
	}
	if v.DetailTitle() != "PRJ-2" {
		t.Errorf("DetailTitle = %q, want PRJ-2", v.DetailTitle())
	}
}

func fixtureTicketDetail() *api.TicketDetail {
	return &api.TicketDetail{
		Ticket: api.Ticket{
			ID: "t1", DisplayID: "ACME-7", Subject: "Login broken",
			Status: "in_progress", Priority: "high", Category: "technical_issue",
			Channel: "email", OrgName: "Acme", Description: "Users are being logged out.",
		},
		Messages: []api.TicketMessage{
			{ID: "m1", AuthorID: "cust", Kind: "comment", Body: "Still happening on Safari.", CreatedAt: "2020-01-02T10:00:00Z"},
			{ID: "m2", AuthorID: "me", Kind: "comment", IsInternalNote: true, Body: "Repro'd — cookie expiry bug.", CreatedAt: "2020-01-02T11:00:00Z"},
			{ID: "m3", AuthorID: "me", Kind: "system", Body: "changed status from Open to In Progress", CreatedAt: "2020-01-02T12:00:00Z"},
			{ID: "m4", AuthorID: "me", Kind: "comment", Body: "Fix is deployed.", CreatedAt: "2020-01-02T13:00:00Z"},
		},
		Authors: map[string]api.UserRef{
			"cust": {Name: "Maja Schmidt", Color: "#7fc8a9"},
			"me":   {Name: "Nick Root", Color: "#7a9cf0"},
		},
		CanEdit:    true,
		CanComment: true,
	}
}

func TestRenderTicketConversation(t *testing.T) {
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	// Glamour interleaves ANSI sequences inside sentences; strip them so
	// substring assertions see the plain text.
	out := ansi.Strip(renderTicketConversation(fixtureTicketDetail(), "me", 100, now))

	for _, want := range []string{
		"In Progress", "High", "Technical issue", "Email", // chips
		"Users are being logged out.", // description
		"CONVERSATION",
		"Maja Schmidt", "Still happening on Safari.",
		"internal note", "cookie expiry bug",
		"changed status from Open to In Progress", // system line
		"Fix is deployed.",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("conversation missing %q", want)
		}
	}

	// System messages render as a rule line, not a bubble.
	sys := ""
	for line := range strings.SplitSeq(out, "\n") {
		if strings.Contains(line, "changed status") {
			sys = line
			break
		}
	}
	if !strings.Contains(sys, "──") {
		t.Errorf("system event should render as a rule line, got %q", sys)
	}
}

func TestRenderConversationEmpty(t *testing.T) {
	d := fixtureTicketDetail()
	d.Messages = nil
	out := renderTicketConversation(d, "me", 80, time.Now())
	if !strings.Contains(out, "no messages yet") {
		t.Errorf("empty conversation placeholder missing:\n%s", out)
	}
}
