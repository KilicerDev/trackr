package views

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"charm.land/bubbles/v2/key"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/core"
	"github.com/KilicerDev/trackr/cli/internal/tui/components"
	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
	"github.com/KilicerDev/trackr/cli/internal/tui/ui"
)

type ticketsLoadedMsg struct {
	seq  int
	list *api.TicketList
}

type ticketsErrMsg struct {
	seq int
	err error
}

type ticketKeyMap struct {
	Open     key.Binding
	Create   key.Binding
	Status   key.Binding
	Priority key.Binding
	Segment  key.Binding
	Filter   key.Binding
	Refresh  key.Binding
}

var ticketKeys = ticketKeyMap{
	Open:     key.NewBinding(key.WithKeys("enter"), key.WithHelp("enter", "open")),
	Create:   key.NewBinding(key.WithKeys("c"), key.WithHelp("c", "new ticket")),
	Status:   key.NewBinding(key.WithKeys("s"), key.WithHelp("s", "status")),
	Priority: key.NewBinding(key.WithKeys("p"), key.WithHelp("p", "priority")),
	Segment:  key.NewBinding(key.WithKeys("w"), key.WithHelp("w", "segment")),
	Filter:   key.NewBinding(key.WithKeys("/"), key.WithHelp("/", "filter")),
	Refresh:  key.NewBinding(key.WithKeys("r"), key.WithHelp("r", "refresh")),
}

// TicketsView is the support-ticket workspace view.
type TicketsView struct {
	ctx     context.Context
	svc     ui.Service
	session *ui.Session

	lv      components.ListView
	segment string // "" = mine, "watched", "all"
	touched bool   // user explicitly cycled the segment
	loading bool
	seq     int

	list *api.TicketList
	byID map[string]api.Ticket

	listW, listH, detW, detH int
}

func NewTicketsView(ctx context.Context, svc ui.Service, session *ui.Session) *TicketsView {
	return &TicketsView{
		ctx:     ctx,
		svc:     svc,
		session: session,
		lv:      components.NewListView(),
		byID:    map[string]api.Ticket{},
	}
}

func (v *TicketsView) SetSize(listW, listH, detW, detH int) {
	v.listW, v.listH, v.detW, v.detH = listW, listH, detW, detH
	v.lv.SetSize(listW, listH)
}

func (v *TicketsView) InputActive() bool { return v.lv.FilterOpen() }

func (v *TicketsView) segmentLabel() string {
	if v.segment == "" {
		return "mine"
	}
	return v.segment
}

func (v *TicketsView) Title() string {
	title := "Tickets · " + v.segmentLabel()
	if v.loading {
		title += " ⋯"
	}
	return title
}

func (v *TicketsView) DetailTitle() string {
	if t, ok := v.selectedTicket(); ok {
		return t.DisplayID
	}
	return "detail"
}

func (v *TicketsView) ShortHelp() []key.Binding {
	k := ticketKeys
	return []key.Binding{k.Open, k.Create, k.Status, k.Priority, k.Segment, k.Filter}
}

func (v *TicketsView) Refresh() tea.Cmd {
	// Staff triage across every org, so default them to the "all"
	// segment until they cycle it themselves; "mine" only lists
	// tickets you are assigned to.
	if !v.touched && v.session.Staff() {
		v.segment = "all"
	}
	v.seq++
	v.loading = true
	seq := v.seq
	segment := v.segment
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(v.ctx, ui.Timeout)
		defer cancel()
		list, err := v.svc.ListTickets(ctx, core.ListTicketsOptions{Segment: segment})
		if err != nil {
			return ticketsErrMsg{seq: seq, err: err}
		}
		return ticketsLoadedMsg{seq: seq, list: list}
	}
}

func (v *TicketsView) Update(msg tea.Msg) (tea.Cmd, bool) {
	switch msg := msg.(type) {
	case ticketsLoadedMsg:
		if msg.seq != v.seq {
			return nil, true
		}
		v.loading = false
		v.list = msg.list
		v.rebuildRows()
		return nil, true

	case ticketsErrMsg:
		if msg.seq != v.seq {
			return nil, true
		}
		v.loading = false
		err := msg.err
		return func() tea.Msg { return ui.ErrMsg{Op: "load tickets", Err: err} }, true

	case tea.MouseWheelMsg:
		return v.lv.Update(msg)

	case tea.KeyPressMsg:
		if cmd, handled := v.lv.Update(msg); handled {
			return cmd, true
		}
		return v.handleKey(msg)
	}
	return nil, false
}

func (v *TicketsView) handleKey(msg tea.KeyPressMsg) (tea.Cmd, bool) {
	ticket, hasTicket := v.selectedTicket()
	switch {
	case key.Matches(msg, ticketKeys.Open):
		if hasTicket {
			id := ticket.ID
			return func() tea.Msg { return ui.OpenEntityMsg{Kind: "ticket", Ref: id} }, true
		}
		return nil, true
	case key.Matches(msg, ticketKeys.Create):
		return components.ShowModal(NewCreateTicketForm(v.ctx, v.svc, v.session, v.Refresh)), true
	case key.Matches(msg, ticketKeys.Status):
		if hasTicket {
			return components.ShowModal(ticketStatusPicker(ticket.DisplayID, ticket.Status, func(status string) tea.Cmd {
				return v.mutate("update status", ticket.DisplayID+" → "+theme.TicketStatusMeta(status).Label, func(ctx context.Context) error {
					return v.svc.UpdateTicket(ctx, ticket.ID, core.UpdateTicketInput{Status: status})
				})
			})), true
		}
		return nil, true
	case key.Matches(msg, ticketKeys.Priority):
		if hasTicket {
			return components.ShowModal(ticketPriorityPicker(ticket.DisplayID, ticket.Priority, func(priority string) tea.Cmd {
				return v.mutate("update priority", ticket.DisplayID+" priority → "+theme.PriorityMeta(priority).Label, func(ctx context.Context) error {
					return v.svc.UpdateTicket(ctx, ticket.ID, core.UpdateTicketInput{Priority: priority})
				})
			})), true
		}
		return nil, true
	case key.Matches(msg, ticketKeys.Segment):
		v.touched = true
		v.segment = v.nextSegment()
		return v.Refresh(), true
	case key.Matches(msg, ticketKeys.Refresh):
		return v.Refresh(), true
	}
	return nil, false
}

func (v *TicketsView) nextSegment() string {
	switch v.segment {
	case "":
		return "watched"
	case "watched":
		if v.session.Staff() {
			return "all"
		}
		return ""
	default:
		return ""
	}
}

func (v *TicketsView) mutate(op, flash string, fn func(ctx context.Context) error) tea.Cmd {
	action := ui.Cmd(v.ctx, op, func(ctx context.Context) (tea.Msg, error) {
		if err := fn(ctx); err != nil {
			return nil, err
		}
		return ui.FlashMsg{Text: flash, Level: ui.FlashSuccess}, nil
	})
	return tea.Sequence(action, v.Refresh())
}

func (v *TicketsView) selectedTicket() (api.Ticket, bool) {
	t, ok := v.byID[v.lv.SelectedID()]
	return t, ok
}

func (v *TicketsView) rebuildRows() {
	v.byID = map[string]api.Ticket{}
	if v.list == nil {
		v.lv.SetRows(nil)
		return
	}
	tickets := make([]api.Ticket, len(v.list.Tickets))
	copy(tickets, v.list.Tickets)
	sort.SliceStable(tickets, func(i, j int) bool {
		return lastActivity(tickets[i]) > lastActivity(tickets[j])
	})
	now := time.Now()
	rows := make([]components.Row, 0, len(tickets))
	for _, t := range tickets {
		ticket := t
		v.byID[ticket.ID] = ticket
		rows = append(rows, components.Row{
			ID:     ticket.ID,
			Kind:   components.RowItem,
			Filter: ticket.DisplayID + " " + ticket.Subject + " " + ticket.OrgName + " " + strings.Join(ticket.Tags, " "),
			Render: func(width int, selected bool) string {
				return v.renderRow(ticket, now, width, selected)
			},
		})
	}
	v.lv.SetRows(rows)
}

func lastActivity(t api.Ticket) string {
	if t.LastMessageAt != "" {
		return t.LastMessageAt
	}
	return t.UpdatedAt
}

func (v *TicketsView) renderRow(t api.Ticket, now time.Time, width int, selected bool) string {
	status := theme.TicketStatusMeta(t.Status)
	prio := theme.PriorityMeta(t.Priority)

	const refW, orgW, msgW, timeW = 10, 10, 5, 9
	left := status.Styled() + " " + theme.DimStyle.Render(ui.Pad(t.DisplayID, refW))
	msgs := ""
	if t.MessageCount > 0 {
		msgs = fmt.Sprintf("✉ %d", t.MessageCount)
	}
	right := prio.Styled() + " " +
		theme.FaintStyle.Render(ui.Pad(t.OrgName, orgW)) + " " +
		theme.FaintStyle.Render(ui.Pad(msgs, msgW)) + " " +
		theme.DimStyle.Render(ui.Pad(ui.RelTime(now, lastActivity(t)), timeW))

	subjectW := width - 2 - lipgloss.Width(left) - lipgloss.Width(right) - 2
	subject := lipgloss.NewStyle().Foreground(theme.Text).Render(ui.Pad(t.Subject, max(subjectW, 4)))

	return rowLine(width, selected, left+subject+" "+right)
}

func (v *TicketsView) View() string { return v.lv.View() }

func (v *TicketsView) DetailView() string {
	t, ok := v.selectedTicket()
	if !ok {
		return "\n" + theme.FaintStyle.Render("  no ticket selected")
	}
	var users map[string]api.UserRef
	if v.list != nil {
		users = v.list.Users
	}
	var b strings.Builder
	b.WriteString(wrap(theme.TitleStyle.Render(t.Subject), v.detW-2) + "\n\n")
	b.WriteString(renderFields(v.detW, []field{
		{"Status", theme.TicketStatusMeta(t.Status).StyledLabel()},
		{"Priority", theme.PriorityMeta(t.Priority).StyledLabel()},
		{"Category", theme.TicketCategoryMeta(t.Category).Label},
		{"Org", t.OrgName},
		{"Channel", theme.ChannelLabel[t.Channel]},
		{"Assignees", names(t.Assignees, users, true)},
		{"Tags", strings.Join(t.Tags, ", ")},
		{"Messages", strconv.Itoa(t.MessageCount)},
		{"Created", ui.RelTime(time.Now(), t.CreatedAt)},
		{"Updated", ui.RelTime(time.Now(), t.UpdatedAt)},
	}))
	if t.Description != "" {
		b.WriteString("\n" + theme.FaintStyle.Render(" DESCRIPTION") + "\n")
		b.WriteString(wrap(theme.MutedStyle.Render(firstLines(t.Description, 6)), v.detW-2) + "\n")
	}
	b.WriteString("\n" + theme.FaintStyle.Render(" enter: open conversation"))
	return b.String()
}

// firstLines returns at most n lines of text.
func firstLines(text string, n int) string {
	lines := strings.Split(text, "\n")
	if len(lines) <= n {
		return text
	}
	return strings.Join(lines[:n], "\n") + " …"
}

// ticketStatusPicker/ticketPriorityPicker are shared with the
// conversation page.
func ticketStatusPicker(ref, current string, onPick func(string) tea.Cmd) components.Modal {
	opts := make([]components.PickerOption, 0, len(theme.TicketStatusOptions))
	for _, s := range theme.TicketStatusOptions {
		meta := theme.TicketStatusMeta(s)
		opts = append(opts, components.PickerOption{Value: s, Glyph: meta.Styled(), Label: meta.Label})
	}
	return components.NewPicker("status · "+ref, opts, current, onPick)
}

func ticketPriorityPicker(ref, current string, onPick func(string) tea.Cmd) components.Modal {
	opts := make([]components.PickerOption, 0, len(theme.TicketPriorityOptions))
	for _, p := range theme.TicketPriorityOptions {
		meta := theme.PriorityMeta(p)
		opts = append(opts, components.PickerOption{Value: p, Glyph: meta.Styled(), Label: meta.Label})
	}
	return components.NewPicker("priority · "+ref, opts, current, onPick)
}
