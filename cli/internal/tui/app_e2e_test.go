package tui

import (
	"bytes"
	"context"
	"sync"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/exp/teatest/v2"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/config"
	"github.com/KilicerDev/trackr/cli/internal/core"
)

// fakeService implements ui.Service with fixtures and records mutations.
type fakeService struct {
	mu    sync.Mutex
	calls []string
}

func (f *fakeService) record(call string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, call)
}

func (f *fakeService) Calls() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.calls...)
}

func (f *fakeService) Me(context.Context) (*api.Me, error) {
	return &api.Me{
		User: api.MeUser{ID: "me", Name: "Nick Root", Email: "root@trackr.dev"},
		Capabilities: api.Capabilities{
			UserType: "staff",
			Surfaces: map[string]bool{"tasks": true, "tickets": true, "projects": true},
		},
		Orgs:        []api.Org{{ID: "o1", Slug: "acme", Name: "Acme"}},
		UnreadCount: 2,
	}, nil
}

func (f *fakeService) ListProjects(context.Context) (*api.ProjectList, error) {
	return &api.ProjectList{Projects: []api.Project{{ID: "p1", Key: "PRJ", Name: "Payments", Status: "active"}}}, nil
}

func (f *fakeService) ListTasks(context.Context, core.ListTasksOptions) (*api.TaskList, error) {
	f.record("ListTasks")
	return &api.TaskList{
		Tasks: []api.Task{
			{ID: "PRJ-2", UUID: "u2", Title: "Ship the TUI", Status: "in_progress", Priority: "high", Project: "Payments", Updated: "2026-03-01T00:00:00Z"},
			{ID: "PRJ-1", UUID: "u1", Title: "Write the spec", Status: "done", Priority: "medium", Project: "Payments", Updated: "2026-01-01T00:00:00Z"},
		},
		Users: map[string]api.UserRef{},
	}, nil
}

func (f *fakeService) CreateTask(context.Context, core.CreateTaskInput) (*api.Created, error) {
	f.record("CreateTask")
	return &api.Created{DisplayID: "PRJ-3"}, nil
}

func (f *fakeService) GetTask(_ context.Context, ref string) (*api.TaskDetail, error) {
	f.record("GetTask:" + ref)
	return &api.TaskDetail{
		Task: api.Task{
			ID: "PRJ-2", UUID: "u2", Title: "Ship the TUI", Status: "in_progress",
			Priority: "high", Project: "Payments", Description: "Make it **best in class**.",
			Comments: []api.TaskComment{{ID: "c1", User: "me", Text: "On it.", CreatedAt: "2020-01-01T00:00:00Z"}},
		},
		Authors:    map[string]api.UserRef{"me": {Name: "Nick Root", Color: "#7a9cf0"}},
		CanEdit:    true,
		CanComment: true,
	}, nil
}

func (f *fakeService) CompleteTask(_ context.Context, ref string) error {
	f.record("CompleteTask:" + ref)
	return nil
}

func (f *fakeService) UpdateTaskStatus(_ context.Context, ref, status string) error {
	f.record("UpdateTaskStatus:" + ref + ":" + status)
	return nil
}

func (f *fakeService) CommentTask(_ context.Context, ref, body string) error {
	f.record("CommentTask:" + ref)
	return nil
}

func (f *fakeService) LogTime(context.Context, string, int, string, string) error {
	f.record("LogTime")
	return nil
}

func (f *fakeService) PatchTask(_ context.Context, uuid string, _ api.TaskPatch) error {
	f.record("PatchTask:" + uuid)
	return nil
}

func (f *fakeService) DeleteTask(_ context.Context, uuid string) error {
	f.record("DeleteTask:" + uuid)
	return nil
}

func (f *fakeService) ListTickets(context.Context, core.ListTicketsOptions) (*api.TicketList, error) {
	f.record("ListTickets")
	return &api.TicketList{
		Tickets: []api.Ticket{{
			ID: "t1", DisplayID: "ACME-7", Subject: "Login broken", Status: "open",
			Priority: "high", Category: "technical_issue", Channel: "email",
			OrgName: "Acme", MessageCount: 2, UpdatedAt: "2026-03-01T00:00:00Z", CreatedAt: "2026-02-01T00:00:00Z",
		}},
		Users: map[string]api.UserRef{},
	}, nil
}

func (f *fakeService) CreateTicket(context.Context, core.CreateTicketInput) (*api.Created, error) {
	f.record("CreateTicket")
	return &api.Created{DisplayID: "ACME-8"}, nil
}

func (f *fakeService) GetTicket(_ context.Context, ref string) (*api.TicketDetail, error) {
	f.record("GetTicket:" + ref)
	return &api.TicketDetail{
		Ticket: api.Ticket{ID: "t1", DisplayID: "ACME-7", Subject: "Login broken", Status: "open", Priority: "high", Category: "technical_issue", OrgName: "Acme"},
		Messages: []api.TicketMessage{
			{ID: "m1", AuthorID: "cust", Kind: "comment", Body: "Still broken.", CreatedAt: "2020-01-01T00:00:00Z"},
		},
		Authors:    map[string]api.UserRef{"cust": {Name: "Maja Schmidt", Color: "#7fc8a9"}},
		CanEdit:    true,
		CanComment: true,
	}, nil
}

func (f *fakeService) UpdateTicket(_ context.Context, ref string, _ core.UpdateTicketInput) error {
	f.record("UpdateTicket:" + ref)
	return nil
}

func (f *fakeService) MessageTicket(_ context.Context, ref, _ string, internal bool) error {
	if internal {
		f.record("MessageTicket:internal:" + ref)
	} else {
		f.record("MessageTicket:" + ref)
	}
	return nil
}

func (f *fakeService) Inbox(context.Context, bool, int, string) (*api.InboxPage, error) {
	f.record("Inbox")
	return &api.InboxPage{
		Items: []api.InboxItem{{
			ID: "n1", Kind: "ticket_message", Title: "New reply on ACME-7",
			ActorID: "cust", EntityType: "ticket", EntityID: "t1", CreatedAt: "2026-03-01T00:00:00Z",
		}},
		Actors: map[string]api.UserRef{"cust": {Name: "Maja Schmidt", Color: "#7fc8a9"}},
	}, nil
}

func (f *fakeService) MarkInboxRead(context.Context, string, bool) error {
	f.record("MarkInboxRead")
	return nil
}

func (f *fakeService) Search(_ context.Context, q string) (*api.SearchResults, error) {
	f.record("Search:" + q)
	return &api.SearchResults{Results: []api.SearchResult{
		{Type: "ticket", ID: "t1", Title: "Login broken", Subtitle: "ACME-7"},
	}}, nil
}

func newTestApp(t *testing.T) (*teatest.TestModel, *fakeService) {
	t.Helper()
	fake := &fakeService{}
	app := newApp(context.Background(), &config.Config{Server: "https://trackr.test"}, fake)
	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(120, 40))
	return tm, fake
}

// waitFor blocks until all wanted strings have appeared in the output
// stream. Note teatest's Output is consumed across calls: only call
// this when new frames are still coming (i.e. right after sending a
// key or during startup) — a quiescent app renders nothing new.
func waitFor(t *testing.T, tm *teatest.TestModel, wants ...string) {
	t.Helper()
	teatest.WaitFor(t, tm.Output(), func(b []byte) bool {
		for _, w := range wants {
			if !bytes.Contains(b, []byte(w)) {
				return false
			}
		}
		return true
	}, teatest.WithDuration(5*time.Second))
}

func typeKey(tm *teatest.TestModel, k string) {
	switch k {
	case "enter":
		tm.Send(tea.KeyPressMsg{Code: tea.KeyEnter})
	case "esc":
		tm.Send(tea.KeyPressMsg{Code: tea.KeyEscape})
	default:
		r := []rune(k)
		tm.Send(tea.KeyPressMsg{Code: r[0], Text: k})
	}
}

func TestAppWorkspaceSmoke(t *testing.T) {
	tm, fake := newTestApp(t)

	// Tasks view paints with data, identity, and sidebar.
	waitFor(t, tm, "Ship the TUI", "Nick Root · trackr.test", "Payments")

	// Open the task page. (Glamour splits sentences into styled chunks,
	// so assert on single words.)
	typeKey(tm, "enter")
	waitFor(t, tm, "COMMENTS", "class")

	// Back to the list, over to tickets.
	typeKey(tm, "esc")
	typeKey(tm, "]")
	waitFor(t, tm, "Login broken")

	// Open the conversation.
	typeKey(tm, "enter")
	waitFor(t, tm, "CONVERSATION", "Maja")
	typeKey(tm, "esc")

	// Inbox.
	typeKey(tm, "]")
	waitFor(t, tm, "New reply on ACME-7")

	// Help overlay.
	typeKey(tm, "?")
	waitFor(t, tm, "quit")
	typeKey(tm, "esc")

	// Quit cleanly.
	typeKey(tm, "q")
	tm.WaitFinished(t, teatest.WithFinalTimeout(5*time.Second))

	calls := fake.Calls()
	if len(calls) == 0 {
		t.Fatal("no service calls recorded")
	}
}

func TestAppStatusPickerFlow(t *testing.T) {
	tm, fake := newTestApp(t)
	waitFor(t, tm, "Ship the TUI")

	// Open the status picker on the selected task and pick "In Review"
	// (j moves from current in_progress → paused → wait; simpler: jump
	// to "done" with G then enter).
	typeKey(tm, "s")
	waitFor(t, tm, "Backlog") // picker open
	typeKey(tm, "G")          // last option: Done
	typeKey(tm, "enter")
	waitFor(t, tm, "PRJ-2 → Done")

	typeKey(tm, "q")
	tm.WaitFinished(t, teatest.WithFinalTimeout(5*time.Second))

	found := false
	for _, c := range fake.Calls() {
		if c == "UpdateTaskStatus:u2:done" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected UpdateTaskStatus:u2:done, calls: %v", fake.Calls())
	}
}

func TestAppOverlaysAndScope(t *testing.T) {
	tm, _ := newTestApp(t)
	waitFor(t, tm, "Ship the TUI")

	// Help overlay (full key list includes bindings the status bar never shows).
	typeKey(tm, "?")
	waitFor(t, tm, "prev view")
	typeKey(tm, "esc")

	// Search palette.
	tm.Send(tea.KeyPressMsg{Code: 'p', Mod: tea.ModCtrl})
	waitFor(t, tm, "search tickets, tasks")
	typeKey(tm, "esc")

	// Scope toggle (fake user is staff).
	typeKey(tm, "m")
	waitFor(t, tm, "Tasks · all")

	typeKey(tm, "q")
	tm.WaitFinished(t, teatest.WithFinalTimeout(5*time.Second))
}

func TestAppComposerSend(t *testing.T) {
	tm, fake := newTestApp(t)
	waitFor(t, tm, "Ship the TUI")

	// Open the task page and focus the composer.
	typeKey(tm, "enter")
	waitFor(t, tm, "COMMENTS")
	typeKey(tm, "i")
	// The diff-based renderer splits typed text across frames at
	// arbitrary points; force a full repaint via a resize so the whole
	// composer line is emitted contiguously.
	for _, r := range "hello world" {
		typeKey(tm, string(r))
	}
	tm.Send(tea.WindowSizeMsg{Width: 121, Height: 40})
	waitFor(t, tm, "hello world")
	tm.Send(tea.KeyPressMsg{Code: 's', Mod: tea.ModCtrl})
	waitFor(t, tm, "comment posted")

	typeKey(tm, "q")
	tm.WaitFinished(t, teatest.WithFinalTimeout(5*time.Second))

	found := false
	for _, c := range fake.Calls() {
		if c == "CommentTask:u2" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected CommentTask:u2, calls: %v", fake.Calls())
	}
}
