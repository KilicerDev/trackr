// Package ui is the shared leaf package of the TUI: the Service
// interface every view consumes, the cross-cutting message types, and
// small render helpers. It must not import any other tui package so
// that views, components, and the app root can all depend on it.
package ui

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/core"
)

// Service is exactly the operation surface the TUI uses. The concrete
// implementation wraps *core.Service (plus three api.Client
// passthroughs); tests substitute a fake.
type Service interface {
	Me(ctx context.Context) (*api.Me, error)
	ListProjects(ctx context.Context) (*api.ProjectList, error)

	ListTasks(ctx context.Context, opts core.ListTasksOptions) (*api.TaskList, error)
	CreateTask(ctx context.Context, in core.CreateTaskInput) (*api.Created, error)
	GetTask(ctx context.Context, ref string) (*api.TaskDetail, error)
	CompleteTask(ctx context.Context, ref string) error
	UpdateTaskStatus(ctx context.Context, ref, status string) error
	CommentTask(ctx context.Context, ref, body string) error
	LogTime(ctx context.Context, ref string, minutes int, date, note string) error
	PatchTask(ctx context.Context, uuid string, patch api.TaskPatch) error
	DeleteTask(ctx context.Context, uuid string) error

	ListTickets(ctx context.Context, opts core.ListTicketsOptions) (*api.TicketList, error)
	CreateTicket(ctx context.Context, in core.CreateTicketInput) (*api.Created, error)
	GetTicket(ctx context.Context, ref string) (*api.TicketDetail, error)
	UpdateTicket(ctx context.Context, ref string, in core.UpdateTicketInput) error
	MessageTicket(ctx context.Context, ref, body string, internal bool) error

	Inbox(ctx context.Context, unreadOnly bool, limit int, cursor string) (*api.InboxPage, error)
	MarkInboxRead(ctx context.Context, id string, all bool) error
	Search(ctx context.Context, query string) (*api.SearchResults, error)
}

// Session is the app-owned snapshot of identity data, shared with
// views by pointer; fields are nil until the initial fetches land.
type Session struct {
	Me       *api.Me
	Projects *api.ProjectList
}

// Staff reports whether the signed-in user is staff (internal notes,
// all-scope lists).
func (s *Session) Staff() bool {
	return s.Me != nil && s.Me.Capabilities.UserType == "staff"
}

// UserID returns the signed-in user's id ("" before /me loads).
func (s *Session) UserID() string {
	if s.Me == nil {
		return ""
	}
	return s.Me.User.ID
}

// Surface reports whether a feature surface is enabled for this user.
// Before /me loads it optimistically returns true.
func (s *Session) Surface(name string) bool {
	if s.Me == nil {
		return true
	}
	return s.Me.Capabilities.Surfaces[name]
}

// ErrMsg reports a failed async operation. Op is a short human phrase
// ("load tasks", "post comment") used in the status-bar flash.
type ErrMsg struct {
	Op  string
	Err error
}

// FlashLevel selects the status-bar flash color.
type FlashLevel int

const (
	FlashInfo FlashLevel = iota
	FlashSuccess
	FlashError
)

// FlashMsg shows a transient message in the status bar.
type FlashMsg struct {
	Text  string
	Level FlashLevel
}

// Flash builds a command that emits a FlashMsg.
func Flash(level FlashLevel, format string, args ...any) tea.Cmd {
	text := fmt.Sprintf(format, args...)
	return func() tea.Msg { return FlashMsg{Text: text, Level: level} }
}

// OpenEntityMsg asks the app root to open a full page for an entity
// (from the inbox, search palette, or a linked reference).
// Kind is "task" or "ticket"; Ref is a UUID or display ref.
type OpenEntityMsg struct {
	Kind string
	Ref  string
}

// RefreshMeMsg asks the app root to re-fetch /me (unread badge, orgs).
type RefreshMeMsg struct{}

// Timeout is the per-request budget for async service calls.
const Timeout = 15 * time.Second

// Cmd wraps an async service call: it derives a bounded context from
// the program context and converts an error into ErrMsg{op, err}.
func Cmd(ctx context.Context, op string, fn func(ctx context.Context) (tea.Msg, error)) tea.Cmd {
	return func() tea.Msg {
		cctx, cancel := context.WithTimeout(ctx, Timeout)
		defer cancel()
		msg, err := fn(cctx)
		if err != nil {
			return ErrMsg{Op: op, Err: err}
		}
		return msg
	}
}

// Truncate shortens s to at most w columns (grapheme-aware), appending
// "…" when anything was cut. Newlines collapse to spaces first.
func Truncate(s string, w int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	if w <= 0 {
		return ""
	}
	if ansi.StringWidth(s) <= w {
		return s
	}
	if w == 1 {
		return "…"
	}
	return ansi.Truncate(s, w-1, "") + "…"
}

// Pad right-pads s with spaces to exactly w columns, truncating first
// if it is too long.
func Pad(s string, w int) string {
	s = Truncate(s, w)
	if gap := w - ansi.StringWidth(s); gap > 0 {
		return s + strings.Repeat(" ", gap)
	}
	return s
}

// RelTime renders an RFC3339-ish timestamp the way the web UI does:
// "just now", "5m ago", "3h ago", "2d ago", then a short date.
func RelTime(now time.Time, stamp string) string {
	t, err := parseTime(stamp)
	if err != nil {
		return ""
	}
	d := now.Sub(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	case d < 30*24*time.Hour:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	}
	if t.Year() == now.Year() {
		return t.Format("2 Jan")
	}
	return t.Format("2 Jan 2006")
}

// DueTone classifies a due date: 2 = overdue, 1 = soon (<48h), 0 = far
// or unparseable.
func DueTone(now time.Time, due string) int {
	t, err := parseTime(due)
	if err != nil {
		return 0
	}
	// Dates without a time component are due at end of day.
	if t.Hour() == 0 && t.Minute() == 0 && t.Second() == 0 {
		t = t.Add(24*time.Hour - time.Second)
	}
	switch {
	case t.Before(now):
		return 2
	case t.Sub(now) < 48*time.Hour:
		return 1
	}
	return 0
}

// DueLabel renders a due date as the web does: "Overdue", "Today",
// "1 day left", "{n} days left", else a short date.
func DueLabel(now time.Time, due string) string {
	t, err := parseTime(due)
	if err != nil {
		return due
	}
	days := int(t.Sub(now).Hours() / 24)
	end := t
	if end.Hour() == 0 && end.Minute() == 0 && end.Second() == 0 {
		end = end.Add(24*time.Hour - time.Second)
	}
	switch {
	case end.Before(now):
		return "Overdue"
	case now.Format("2006-01-02") == t.Format("2006-01-02"):
		return "Today"
	case days <= 0:
		return "Today"
	case days == 1:
		return "1 day left"
	case days <= 7:
		return fmt.Sprintf("%d days left", days)
	}
	return t.Format("2 Jan")
}

// FormatMinutes renders minutes as "1h 30m" / "2h" / "45m".
func FormatMinutes(min int) string {
	if min <= 0 {
		return ""
	}
	h, m := min/60, min%60
	switch {
	case h > 0 && m > 0:
		return fmt.Sprintf("%dh %dm", h, m)
	case h > 0:
		return fmt.Sprintf("%dh", h)
	}
	return fmt.Sprintf("%dm", m)
}

func parseTime(s string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.Local(), nil
		}
	}
	// Date-only values are local calendar days, not UTC instants.
	if t, err := time.ParseInLocation("2006-01-02", s, time.Local); err == nil {
		return t, nil
	}
	return time.Time{}, fmt.Errorf("unparseable time %q", s)
}
