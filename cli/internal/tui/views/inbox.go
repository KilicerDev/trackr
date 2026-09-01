package views

import (
	"context"
	"maps"
	"strings"
	"time"

	"charm.land/bubbles/v2/key"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/tui/components"
	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
	"github.com/KilicerDev/trackr/cli/internal/tui/ui"
)

const inboxPageSize = 50

type inboxLoadedMsg struct {
	seq    int
	page   *api.InboxPage
	append bool
}

type inboxErrMsg struct {
	seq int
	err error
}

type inboxKeyMap struct {
	Open     key.Binding
	Read     key.Binding
	ReadAll  key.Binding
	Unread   key.Binding
	LoadMore key.Binding
	Refresh  key.Binding
}

var inboxKeys = inboxKeyMap{
	Open:     key.NewBinding(key.WithKeys("enter"), key.WithHelp("enter", "open")),
	Read:     key.NewBinding(key.WithKeys("m"), key.WithHelp("m", "mark read")),
	ReadAll:  key.NewBinding(key.WithKeys("M"), key.WithHelp("M", "read all")),
	Unread:   key.NewBinding(key.WithKeys("u"), key.WithHelp("u", "unread only")),
	LoadMore: key.NewBinding(key.WithKeys("L"), key.WithHelp("L", "load older")),
	Refresh:  key.NewBinding(key.WithKeys("r"), key.WithHelp("r", "refresh")),
}

// InboxView is the notification inbox.
type InboxView struct {
	ctx     context.Context
	svc     ui.Service
	session *ui.Session

	lv         components.ListView
	unreadOnly bool
	loading    bool
	seq        int

	items      []api.InboxItem
	actors     map[string]api.UserRef
	nextCursor string
	byID       map[string]api.InboxItem

	listW, listH, detW, detH int
}

func NewInboxView(ctx context.Context, svc ui.Service, session *ui.Session) *InboxView {
	return &InboxView{
		ctx:     ctx,
		svc:     svc,
		session: session,
		lv:      components.NewListView(),
		actors:  map[string]api.UserRef{},
		byID:    map[string]api.InboxItem{},
	}
}

func (v *InboxView) SetSize(listW, listH, detW, detH int) {
	v.listW, v.listH, v.detW, v.detH = listW, listH, detW, detH
	v.lv.SetSize(listW, listH)
}

func (v *InboxView) InputActive() bool { return v.lv.FilterOpen() }

func (v *InboxView) Title() string {
	title := "Inbox"
	if v.unreadOnly {
		title += " · unread"
	}
	if v.loading {
		title += " ⋯"
	}
	return title
}

func (v *InboxView) DetailTitle() string { return "notification" }

func (v *InboxView) ShortHelp() []key.Binding {
	k := inboxKeys
	return []key.Binding{k.Open, k.Read, k.ReadAll, k.Unread, k.LoadMore}
}

func (v *InboxView) Refresh() tea.Cmd {
	return v.fetch("", false)
}

func (v *InboxView) fetch(cursor string, appendPage bool) tea.Cmd {
	v.seq++
	v.loading = true
	seq := v.seq
	unreadOnly := v.unreadOnly
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(v.ctx, ui.Timeout)
		defer cancel()
		page, err := v.svc.Inbox(ctx, unreadOnly, inboxPageSize, cursor)
		if err != nil {
			return inboxErrMsg{seq: seq, err: err}
		}
		return inboxLoadedMsg{seq: seq, page: page, append: appendPage}
	}
}

func (v *InboxView) Update(msg tea.Msg) (tea.Cmd, bool) {
	switch msg := msg.(type) {
	case inboxLoadedMsg:
		if msg.seq != v.seq {
			return nil, true
		}
		v.loading = false
		if msg.append {
			v.items = append(v.items, msg.page.Items...)
		} else {
			v.items = msg.page.Items
		}
		maps.Copy(v.actors, msg.page.Actors)
		v.nextCursor = msg.page.NextCursor
		v.rebuildRows()
		return nil, true

	case inboxErrMsg:
		if msg.seq != v.seq {
			return nil, true
		}
		v.loading = false
		err := msg.err
		return func() tea.Msg { return ui.ErrMsg{Op: "load inbox", Err: err} }, true

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

func (v *InboxView) handleKey(msg tea.KeyPressMsg) (tea.Cmd, bool) {
	item, hasItem := v.selectedItem()
	switch {
	case key.Matches(msg, inboxKeys.Open):
		if !hasItem {
			return nil, true
		}
		var cmds []tea.Cmd
		if item.ReadAt == "" {
			cmds = append(cmds, v.markRead(item, false))
		}
		kind, ref := item.EntityType, item.EntityID
		if kind == "task" || kind == "ticket" {
			cmds = append(cmds, func() tea.Msg { return ui.OpenEntityMsg{Kind: kind, Ref: ref} })
		} else {
			cmds = append(cmds, ui.Flash(ui.FlashInfo, "this notification opens in the web app"))
		}
		return tea.Batch(cmds...), true

	case key.Matches(msg, inboxKeys.Read):
		if hasItem && item.ReadAt == "" {
			return v.markRead(item, true), true
		}
		return nil, true

	case key.Matches(msg, inboxKeys.ReadAll):
		return components.ShowModal(components.NewConfirm(
			"inbox", "Mark every notification as read?", false,
			tea.Sequence(
				ui.Cmd(v.ctx, "mark all read", func(ctx context.Context) (tea.Msg, error) {
					if err := v.svc.MarkInboxRead(ctx, "", true); err != nil {
						return nil, err
					}
					return ui.FlashMsg{Text: "inbox cleared", Level: ui.FlashSuccess}, nil
				}),
				v.Refresh(),
				func() tea.Msg { return ui.RefreshMeMsg{} },
			),
		)), true

	case key.Matches(msg, inboxKeys.Unread):
		v.unreadOnly = !v.unreadOnly
		return v.Refresh(), true

	case key.Matches(msg, inboxKeys.LoadMore):
		if v.nextCursor != "" {
			return v.fetch(v.nextCursor, true), true
		}
		return ui.Flash(ui.FlashInfo, "no older notifications"), true

	case key.Matches(msg, inboxKeys.Refresh):
		return tea.Batch(v.Refresh(), func() tea.Msg { return ui.RefreshMeMsg{} }), true
	}
	return nil, false
}

// markRead marks one item read; refetch keeps the list honest (and
// refresh=false skips it for the open-and-navigate case, where the
// page push makes an immediate refetch visually pointless).
func (v *InboxView) markRead(item api.InboxItem, refresh bool) tea.Cmd {
	action := ui.Cmd(v.ctx, "mark read", func(ctx context.Context) (tea.Msg, error) {
		if err := v.svc.MarkInboxRead(ctx, item.ID, false); err != nil {
			return nil, err
		}
		return ui.RefreshMeMsg{}, nil
	})
	if refresh {
		return tea.Sequence(action, v.Refresh())
	}
	// Mark locally so the row stops rendering as unread.
	for i := range v.items {
		if v.items[i].ID == item.ID {
			v.items[i].ReadAt = time.Now().Format(time.RFC3339)
		}
	}
	v.rebuildRows()
	return action
}

func (v *InboxView) selectedItem() (api.InboxItem, bool) {
	item, ok := v.byID[v.lv.SelectedID()]
	return item, ok
}

func (v *InboxView) rebuildRows() {
	v.byID = map[string]api.InboxItem{}
	now := time.Now()
	rows := make([]components.Row, 0, len(v.items))
	for _, it := range v.items {
		item := it
		v.byID[item.ID] = item
		actor := ""
		if item.ActorID != "" {
			actor = firstName(item.ActorID, v.actors)
		}
		rows = append(rows, components.Row{
			ID:     item.ID,
			Kind:   components.RowItem,
			Filter: item.Title + " " + item.Body + " " + actor,
			Render: func(width int, selected bool) string {
				return v.renderRow(item, actor, now, width, selected)
			},
		})
	}
	v.lv.SetRows(rows)
}

func (v *InboxView) renderRow(item api.InboxItem, actor string, now time.Time, width int, selected bool) string {
	dot := "  "
	titleStyle := theme.MutedStyle
	if item.ReadAt == "" {
		dot = theme.AccentStyle.Render("● ")
		titleStyle = theme.TitleStyle
	}
	const timeW = 9
	right := theme.DimStyle.Render(ui.Pad(ui.RelTime(now, item.CreatedAt), timeW))

	text := item.Title
	if actor != "" {
		text = actor + ": " + text
	}
	if item.Body != "" {
		text += theme.FaintStyle.Render(" — " + item.Body)
	}
	textW := width - 2 - 2 - timeW - 2
	content := dot + titleStyle.Render(ui.Pad(text, max(textW, 4))) + " " + right
	return rowLine(width, selected, content)
}

func (v *InboxView) View() string {
	out := v.lv.View()
	if v.nextCursor != "" {
		out += "\n" + theme.FaintStyle.Render("  — L: load older —")
	}
	return out
}

func (v *InboxView) DetailView() string {
	item, ok := v.selectedItem()
	if !ok {
		return "\n" + theme.FaintStyle.Render("  nothing selected")
	}
	var b strings.Builder
	b.WriteString(wrap(theme.TitleStyle.Render(item.Title), v.detW-2) + "\n\n")
	actor := ""
	if item.ActorID != "" {
		if ref, ok := v.actors[item.ActorID]; ok {
			actor = lipgloss.NewStyle().Foreground(theme.UserColor(ref.Color)).Render(ref.Name)
		}
	}
	read := "unread"
	if item.ReadAt != "" {
		read = "read"
	}
	b.WriteString(renderFields(v.detW, []field{
		{"From", actor},
		{"Kind", item.Kind},
		{"Entity", item.EntityType},
		{"State", read},
		{"When", ui.RelTime(time.Now(), item.CreatedAt)},
	}))
	if item.Body != "" {
		b.WriteString("\n" + wrap(theme.MutedStyle.Render(item.Body), v.detW-2) + "\n")
	}
	if item.EntityType == "task" || item.EntityType == "ticket" {
		b.WriteString("\n" + theme.FaintStyle.Render(" enter: open "+item.EntityType))
	}
	return b.String()
}
