package views

import (
	"context"
	"strings"
	"time"

	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/viewport"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/core"
	"github.com/KilicerDev/trackr/cli/internal/tui/components"
	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
	"github.com/KilicerDev/trackr/cli/internal/tui/ui"
)

type ticketDetailLoadedMsg struct {
	seq int
	d   *api.TicketDetail
}

type ticketDetailErrMsg struct {
	seq int
	err error
}

type ticketPageKeyMap struct {
	Compose  key.Binding
	Send     key.Binding
	Internal key.Binding
	Status   key.Binding
	Priority key.Binding
	Refresh  key.Binding
	Back     key.Binding
}

var ticketPageKeys = ticketPageKeyMap{
	Compose:  key.NewBinding(key.WithKeys("i", "enter"), key.WithHelp("i", "reply")),
	Send:     key.NewBinding(key.WithKeys("ctrl+s", "ctrl+enter", "shift+enter"), key.WithHelp("ctrl+s", "send")),
	Internal: key.NewBinding(key.WithKeys("ctrl+t"), key.WithHelp("ctrl+t", "internal")),
	Status:   key.NewBinding(key.WithKeys("s"), key.WithHelp("s", "status")),
	Priority: key.NewBinding(key.WithKeys("p"), key.WithHelp("p", "priority")),
	Refresh:  key.NewBinding(key.WithKeys("r"), key.WithHelp("r", "refresh")),
	Back:     key.NewBinding(key.WithKeys("esc"), key.WithHelp("esc", "back")),
}

// TicketPage is the full-screen ticket conversation: header, chat
// timeline, and reply composer with an internal-note toggle.
type TicketPage struct {
	ctx     context.Context
	svc     ui.Service
	session *ui.Session

	ref     string
	detail  *api.TicketDetail
	loading bool
	seq     int

	vp            viewport.Model
	composer      components.Composer
	toBottom      bool
	width, height int
}

func NewTicketPage(ctx context.Context, svc ui.Service, session *ui.Session, ref string) *TicketPage {
	return &TicketPage{
		ctx:      ctx,
		svc:      svc,
		session:  session,
		ref:      ref,
		vp:       viewport.New(),
		composer: components.NewComposer("Write a reply… (i to focus · ctrl+s to send)"),
	}
}

func (p *TicketPage) Init() tea.Cmd { return p.fetch() }

func (p *TicketPage) fetch() tea.Cmd {
	p.seq++
	p.loading = true
	seq := p.seq
	ref := p.ref
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(p.ctx, ui.Timeout)
		defer cancel()
		d, err := p.svc.GetTicket(ctx, ref)
		if err != nil {
			return ticketDetailErrMsg{seq: seq, err: err}
		}
		return ticketDetailLoadedMsg{seq: seq, d: d}
	}
}

func (p *TicketPage) Title() string {
	if p.detail == nil {
		if p.loading {
			return "ticket ⋯"
		}
		return "ticket"
	}
	t := p.detail.Ticket
	title := t.DisplayID + " · " + t.Subject
	if p.loading {
		title += " ⋯"
	}
	return title
}

func (p *TicketPage) InputActive() bool { return p.composer.Focused() }

func (p *TicketPage) ShortHelp() []key.Binding {
	k := ticketPageKeys
	if p.composer.Focused() {
		hints := []key.Binding{k.Send}
		if p.session.Staff() {
			hints = append(hints, k.Internal)
		}
		return append(hints, key.NewBinding(key.WithKeys("esc"), key.WithHelp("esc", "blur")))
	}
	return []key.Binding{k.Compose, k.Status, k.Priority, k.Refresh, k.Back}
}

func (p *TicketPage) SetSize(w, h int) {
	p.width, p.height = w, h
	p.composer.SetWidth(w)
	p.resize()
	p.rebuildContent()
}

func (p *TicketPage) resize() {
	vpH := p.height
	if p.showComposer() {
		vpH -= p.composer.Height()
	}
	p.vp.SetWidth(p.width)
	p.vp.SetHeight(max(vpH, 3))
}

func (p *TicketPage) showComposer() bool {
	return p.detail == nil || p.detail.CanComment
}

func (p *TicketPage) Update(msg tea.Msg) (tea.Cmd, bool) {
	switch msg := msg.(type) {
	case ticketDetailLoadedMsg:
		if msg.seq != p.seq {
			return nil, true
		}
		p.loading = false
		p.detail = msg.d
		p.resize()
		p.rebuildContent()
		if p.toBottom {
			p.toBottom = false
			p.vp.GotoBottom()
		}
		return nil, true

	case ticketDetailErrMsg:
		if msg.seq != p.seq {
			return nil, true
		}
		p.loading = false
		err := msg.err
		return func() tea.Msg { return ui.ErrMsg{Op: "load ticket", Err: err} }, true

	case tea.MouseWheelMsg:
		var cmd tea.Cmd
		p.vp, cmd = p.vp.Update(msg)
		return cmd, true

	case tea.KeyPressMsg:
		return p.handleKey(msg)
	}
	return nil, false
}

func (p *TicketPage) handleKey(msg tea.KeyPressMsg) (tea.Cmd, bool) {
	if p.composer.Focused() {
		switch {
		case msg.String() == "esc":
			p.composer.Blur()
			return nil, true
		case key.Matches(msg, ticketPageKeys.Send):
			return p.send(), true
		case key.Matches(msg, ticketPageKeys.Internal):
			return p.toggleInternal(), true
		}
		cmd := p.composer.Update(msg)
		p.resize()
		return cmd, true
	}

	if p.detail == nil {
		return nil, false
	}
	t := p.detail.Ticket

	switch {
	case key.Matches(msg, ticketPageKeys.Compose):
		if p.detail.CanComment {
			return p.composer.Focus(), true
		}
		return ui.Flash(ui.FlashInfo, "you cannot reply to this ticket"), true

	case key.Matches(msg, ticketPageKeys.Internal):
		return p.toggleInternal(), true

	case key.Matches(msg, ticketPageKeys.Status):
		return components.ShowModal(ticketStatusPicker(t.DisplayID, t.Status, func(status string) tea.Cmd {
			return p.mutate("update status", t.DisplayID+" → "+theme.TicketStatusMeta(status).Label, func(ctx context.Context) error {
				return p.svc.UpdateTicket(ctx, t.ID, core.UpdateTicketInput{Status: status})
			})
		})), true

	case key.Matches(msg, ticketPageKeys.Priority):
		return components.ShowModal(ticketPriorityPicker(t.DisplayID, t.Priority, func(priority string) tea.Cmd {
			return p.mutate("update priority", t.DisplayID+" priority → "+theme.PriorityMeta(priority).Label, func(ctx context.Context) error {
				return p.svc.UpdateTicket(ctx, t.ID, core.UpdateTicketInput{Priority: priority})
			})
		})), true

	case key.Matches(msg, ticketPageKeys.Refresh):
		return p.fetch(), true

	case msg.String() == "esc":
		if p.composer.Dirty() {
			p.composer.Reset()
			p.composer.SetInternal(false)
			return ui.Flash(ui.FlashInfo, "draft discarded"), true
		}
		return nil, false
	}

	return p.scroll(msg)
}

// scroll handles viewport movement keys; anything else is left for the
// app root (q, ?, ctrl+p, esc…).
func (p *TicketPage) scroll(msg tea.KeyPressMsg) (tea.Cmd, bool) {
	switch msg.String() {
	case "j", "down", "k", "up", "ctrl+d", "ctrl+u", "pgdown", "pgup":
		var cmd tea.Cmd
		p.vp, cmd = p.vp.Update(msg)
		return cmd, true
	case "g", "home":
		p.vp.GotoTop()
		return nil, true
	case "G", "end":
		p.vp.GotoBottom()
		return nil, true
	}
	return nil, false
}

func (p *TicketPage) toggleInternal() tea.Cmd {
	if !p.session.Staff() {
		return ui.Flash(ui.FlashInfo, "internal notes need a staff account")
	}
	if p.composer.ToggleInternal() {
		p.composer.SetPlaceholder("Internal note… (ctrl+s to send)")
	} else {
		p.composer.SetPlaceholder("Write a reply… (i to focus · ctrl+s to send)")
	}
	return nil
}

func (p *TicketPage) mutate(op, flash string, fn func(ctx context.Context) error) tea.Cmd {
	action := ui.Cmd(p.ctx, op, func(ctx context.Context) (tea.Msg, error) {
		if err := fn(ctx); err != nil {
			return nil, err
		}
		return ui.FlashMsg{Text: flash, Level: ui.FlashSuccess}, nil
	})
	return tea.Sequence(action, p.fetch())
}

func (p *TicketPage) send() tea.Cmd {
	body := p.composer.Value()
	if body == "" {
		return nil
	}
	t := p.detail.Ticket
	internal := p.composer.Internal()
	p.composer.Reset()
	p.composer.Blur()
	p.composer.SetInternal(false)
	p.composer.SetPlaceholder("Write a reply… (i to focus · ctrl+s to send)")
	p.toBottom = true
	flash := "reply sent"
	if internal {
		flash = "internal note added"
	}
	action := ui.Cmd(p.ctx, "send message", func(ctx context.Context) (tea.Msg, error) {
		if err := p.svc.MessageTicket(ctx, t.ID, body, internal); err != nil {
			return nil, err
		}
		return ui.FlashMsg{Text: flash, Level: ui.FlashSuccess}, nil
	})
	return tea.Sequence(action, p.fetch())
}

func (p *TicketPage) rebuildContent() {
	if p.detail == nil {
		p.vp.SetContent("\n " + theme.FaintStyle.Render("loading…"))
		return
	}
	p.vp.SetContent(renderTicketConversation(p.detail, p.session.UserID(), p.width-2, time.Now()))
}

func (p *TicketPage) View() string {
	out := p.vp.View()
	if p.showComposer() {
		out += "\n" + p.composer.View()
	}
	return out
}

// renderTicketConversation is a pure renderer for the ticket header +
// chat timeline (golden-testable).
func renderTicketConversation(d *api.TicketDetail, meID string, width int, now time.Time) string {
	t := d.Ticket
	var b strings.Builder

	// Header chips + metadata.
	chips := []string{
		theme.TicketStatusMeta(t.Status).StyledLabel(),
		theme.PriorityMeta(t.Priority).StyledLabel(),
		theme.TicketCategoryMeta(t.Category).Label,
	}
	if ch := theme.ChannelLabel[t.Channel]; ch != "" {
		chips = append(chips, theme.DimStyle.Render(ch))
	}
	b.WriteString(" " + strings.Join(chips, theme.FaintStyle.Render("  ·  ")) + "\n")

	meta := " " + theme.FaintStyle.Render(t.OrgName)
	if assignees := names(t.Assignees, d.Authors, true); assignees != "" {
		meta += theme.FaintStyle.Render("  ·  assigned ") + assignees
	}
	if len(t.Tags) > 0 {
		meta += theme.FaintStyle.Render("  ·  " + strings.Join(t.Tags, ", "))
	}
	b.WriteString(meta + "\n")

	if t.Description != "" {
		b.WriteString("\n" + sectionHeader("DESCRIPTION", width) + "\n")
		b.WriteString(indent(theme.Markdown(t.Description, width-2)) + "\n")
	}

	b.WriteString("\n" + sectionHeader("CONVERSATION", width) + "\n")
	if len(d.Messages) == 0 {
		b.WriteString(" " + theme.FaintStyle.Render("no messages yet") + "\n")
	}
	for _, m := range d.Messages {
		b.WriteString(renderTicketMessage(m, d.Authors, meID, width, now))
	}
	return b.String()
}

func renderTicketMessage(m api.TicketMessage, authors map[string]api.UserRef, meID string, width int, now time.Time) string {
	author := "unknown"
	authorColor := theme.Text2
	if ref, ok := authors[m.AuthorID]; ok && ref.Name != "" {
		author = ref.Name
		authorColor = theme.UserColor(ref.Color)
	}
	when := ui.RelTime(now, m.CreatedAt)

	// System events: one dim centered line, no bubble.
	if m.Kind == "system" {
		text := author + " " + strings.TrimSpace(m.Body)
		if when != "" {
			text += " · " + when
		}
		line := theme.FaintStyle.Render("── " + ui.Truncate(text, width-8) + " ──")
		return "\n" + lipgloss.PlaceHorizontal(width, lipgloss.Center, line) + "\n"
	}

	own := meID != "" && m.AuthorID == meID
	bubbleW := max(min(width*3/4, 76), 24)

	borderColor := theme.Border
	head := lipgloss.NewStyle().Foreground(authorColor).Bold(true).Render(author)
	if m.IsInternalNote {
		borderColor = theme.Internal
		head += " " + lipgloss.NewStyle().Foreground(theme.Internal).Render("· internal note")
	} else if own {
		borderColor = theme.BorderStrong
	}
	if when != "" {
		head += theme.FaintStyle.Render(" · " + when)
	}

	body := theme.Markdown(m.Body, bubbleW-4)
	bubble := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderColor).
		Padding(0, 1).
		Width(bubbleW - 2).
		Render(body)

	block := head + "\n" + bubble
	if own {
		aligned := lipgloss.PlaceHorizontal(width-1, lipgloss.Right, block)
		return "\n" + strings.ReplaceAll(aligned, "\n", "\n") + "\n"
	}
	return "\n " + strings.ReplaceAll(block, "\n", "\n ") + "\n"
}
