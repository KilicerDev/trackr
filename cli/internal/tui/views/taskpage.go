package views

import (
	"context"
	"fmt"
	"strings"
	"time"

	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/viewport"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/tui/components"
	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
	"github.com/KilicerDev/trackr/cli/internal/tui/ui"
)

type taskDetailLoadedMsg struct {
	seq int
	d   *api.TaskDetail
}

type taskDetailErrMsg struct {
	seq int
	err error
}

type taskPageKeyMap struct {
	Compose  key.Binding
	Send     key.Binding
	Done     key.Binding
	Status   key.Binding
	Priority key.Binding
	Edit     key.Binding
	LogTime  key.Binding
	Refresh  key.Binding
	Back     key.Binding
}

var taskPageKeys = taskPageKeyMap{
	Compose:  key.NewBinding(key.WithKeys("i", "enter"), key.WithHelp("i", "comment")),
	Send:     key.NewBinding(key.WithKeys("ctrl+s", "ctrl+enter", "shift+enter"), key.WithHelp("ctrl+s", "send")),
	Done:     key.NewBinding(key.WithKeys("d"), key.WithHelp("d", "done")),
	Status:   key.NewBinding(key.WithKeys("s"), key.WithHelp("s", "status")),
	Priority: key.NewBinding(key.WithKeys("p"), key.WithHelp("p", "priority")),
	Edit:     key.NewBinding(key.WithKeys("e"), key.WithHelp("e", "edit")),
	LogTime:  key.NewBinding(key.WithKeys("l"), key.WithHelp("l", "log time")),
	Refresh:  key.NewBinding(key.WithKeys("r"), key.WithHelp("r", "refresh")),
	Back:     key.NewBinding(key.WithKeys("esc"), key.WithHelp("esc", "back")),
}

// TaskPage is the full-screen task detail: metadata, description,
// checklist, comment thread, and a comment composer.
type TaskPage struct {
	ctx     context.Context
	svc     ui.Service
	session *ui.Session

	ref     string // uuid (or display ref — GetTask resolves both)
	detail  *api.TaskDetail
	loading bool
	seq     int

	vp            viewport.Model
	composer      components.Composer
	toBottom      bool // scroll to bottom after next content build
	width, height int
}

func NewTaskPage(ctx context.Context, svc ui.Service, session *ui.Session, ref string) *TaskPage {
	return &TaskPage{
		ctx:      ctx,
		svc:      svc,
		session:  session,
		ref:      ref,
		vp:       viewport.New(),
		composer: components.NewComposer("Write a comment… (i to focus · ctrl+s to send)"),
	}
}

func (p *TaskPage) Init() tea.Cmd { return p.fetch() }

func (p *TaskPage) fetch() tea.Cmd {
	p.seq++
	p.loading = true
	seq := p.seq
	ref := p.ref
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(p.ctx, ui.Timeout)
		defer cancel()
		d, err := p.svc.GetTask(ctx, ref)
		if err != nil {
			return taskDetailErrMsg{seq: seq, err: err}
		}
		return taskDetailLoadedMsg{seq: seq, d: d}
	}
}

func (p *TaskPage) Title() string {
	if p.detail == nil {
		if p.loading {
			return "task ⋯"
		}
		return "task"
	}
	t := p.detail.Task
	title := t.ID + " · " + t.Title
	if p.loading {
		title += " ⋯"
	}
	return title
}

func (p *TaskPage) InputActive() bool { return p.composer.Focused() }

func (p *TaskPage) ShortHelp() []key.Binding {
	k := taskPageKeys
	if p.composer.Focused() {
		return []key.Binding{k.Send, key.NewBinding(key.WithKeys("esc"), key.WithHelp("esc", "blur"))}
	}
	return []key.Binding{k.Compose, k.Status, k.Done, k.Edit, k.LogTime, k.Back}
}

func (p *TaskPage) SetSize(w, h int) {
	p.width, p.height = w, h
	p.composer.SetWidth(w)
	p.resize()
	p.rebuildContent()
}

func (p *TaskPage) resize() {
	vpH := p.height
	if p.showComposer() {
		vpH -= p.composer.Height()
	}
	p.vp.SetWidth(p.width)
	p.vp.SetHeight(max(vpH, 3))
}

func (p *TaskPage) showComposer() bool {
	return p.detail == nil || p.detail.CanComment
}

func (p *TaskPage) Update(msg tea.Msg) (tea.Cmd, bool) {
	switch msg := msg.(type) {
	case taskDetailLoadedMsg:
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

	case taskDetailErrMsg:
		if msg.seq != p.seq {
			return nil, true
		}
		p.loading = false
		err := msg.err
		return func() tea.Msg { return ui.ErrMsg{Op: "load task", Err: err} }, true

	case tea.MouseWheelMsg:
		var cmd tea.Cmd
		p.vp, cmd = p.vp.Update(msg)
		return cmd, true

	case tea.KeyPressMsg:
		return p.handleKey(msg)
	}
	return nil, false
}

func (p *TaskPage) handleKey(msg tea.KeyPressMsg) (tea.Cmd, bool) {
	if p.composer.Focused() {
		switch {
		case msg.String() == "esc":
			p.composer.Blur()
			return nil, true
		case key.Matches(msg, taskPageKeys.Send):
			return p.send(), true
		}
		cmd := p.composer.Update(msg)
		p.resize()
		return cmd, true
	}

	if p.detail == nil {
		return nil, false
	}
	task := p.detail.Task

	switch {
	case key.Matches(msg, taskPageKeys.Compose):
		if p.detail.CanComment {
			return p.composer.Focus(), true
		}
		return ui.Flash(ui.FlashInfo, "you cannot comment on this task"), true

	case key.Matches(msg, taskPageKeys.Done):
		if task.Status != "done" {
			return p.mutate("complete task", task.ID+" → Done", func(ctx context.Context) error {
				return p.svc.CompleteTask(ctx, task.UUID)
			}), true
		}
		return nil, true

	case key.Matches(msg, taskPageKeys.Status):
		opts := make([]components.PickerOption, 0, len(theme.TaskStatusOptions))
		for _, s := range theme.TaskStatusOptions {
			meta := theme.TaskStatusMeta(s)
			opts = append(opts, components.PickerOption{Value: s, Glyph: meta.Styled(), Label: meta.Label})
		}
		return components.ShowModal(components.NewPicker("status · "+task.ID, opts, task.Status, func(status string) tea.Cmd {
			return p.mutate("update status", task.ID+" → "+theme.TaskStatusMeta(status).Label, func(ctx context.Context) error {
				return p.svc.UpdateTaskStatus(ctx, task.UUID, status)
			})
		})), true

	case key.Matches(msg, taskPageKeys.Priority):
		opts := make([]components.PickerOption, 0, len(theme.PriorityOptions))
		for _, pr := range theme.PriorityOptions {
			meta := theme.PriorityMeta(pr)
			opts = append(opts, components.PickerOption{Value: pr, Glyph: meta.Styled(), Label: meta.Label})
		}
		return components.ShowModal(components.NewPicker("priority · "+task.ID, opts, task.Priority, func(priority string) tea.Cmd {
			return p.mutate("update priority", task.ID+" priority → "+theme.PriorityMeta(priority).Label, func(ctx context.Context) error {
				return p.svc.PatchTask(ctx, task.UUID, api.TaskPatch{Priority: &priority})
			})
		})), true

	case key.Matches(msg, taskPageKeys.Edit):
		if !p.detail.CanEdit {
			return ui.Flash(ui.FlashInfo, "you cannot edit this task"), true
		}
		return components.ShowModal(NewEditTaskForm(p.ctx, p.svc, p.detail, p.fetch)), true

	case key.Matches(msg, taskPageKeys.LogTime):
		return components.ShowModal(NewLogTimeForm(p.ctx, p.svc, task.ID, task.UUID, p.fetch)), true

	case key.Matches(msg, taskPageKeys.Refresh):
		return p.fetch(), true

	case msg.String() == "esc":
		if p.composer.Dirty() {
			p.composer.Reset()
			return ui.Flash(ui.FlashInfo, "draft discarded"), true
		}
		return nil, false // let the app pop the page
	}

	return p.scroll(msg)
}

// scroll handles viewport movement keys; anything else is left for the
// app root (q, ?, ctrl+p, esc…).
func (p *TaskPage) scroll(msg tea.KeyPressMsg) (tea.Cmd, bool) {
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

func (p *TaskPage) mutate(op, flash string, fn func(ctx context.Context) error) tea.Cmd {
	action := ui.Cmd(p.ctx, op, func(ctx context.Context) (tea.Msg, error) {
		if err := fn(ctx); err != nil {
			return nil, err
		}
		return ui.FlashMsg{Text: flash, Level: ui.FlashSuccess}, nil
	})
	return tea.Sequence(action, p.fetch())
}

func (p *TaskPage) send() tea.Cmd {
	body := p.composer.Value()
	if body == "" {
		return nil
	}
	task := p.detail.Task
	p.composer.Reset()
	p.composer.Blur()
	p.toBottom = true
	action := ui.Cmd(p.ctx, "post comment", func(ctx context.Context) (tea.Msg, error) {
		if err := p.svc.CommentTask(ctx, task.UUID, body); err != nil {
			return nil, err
		}
		return ui.FlashMsg{Text: "comment posted", Level: ui.FlashSuccess}, nil
	})
	return tea.Sequence(action, p.fetch())
}

func (p *TaskPage) rebuildContent() {
	if p.detail == nil {
		p.vp.SetContent("\n " + theme.FaintStyle.Render("loading…"))
		return
	}
	t := p.detail.Task
	w := p.width - 2
	var b strings.Builder

	// Chips row.
	status := theme.TaskStatusMeta(t.Status)
	prio := theme.PriorityMeta(t.Priority)
	chips := []string{status.StyledLabel(), prio.StyledLabel()}
	if t.Type != "" {
		tt := theme.TaskTypeMeta(t.Type)
		chips = append(chips, lipgloss.NewStyle().Foreground(tt.Color).Render(tt.Glyph+" "+tt.Label))
	}
	b.WriteString(" " + strings.Join(chips, theme.FaintStyle.Render("  ·  ")) + "\n\n")

	b.WriteString(renderFields(w, []field{
		{"Project", t.Project},
		{"Assignees", names(t.Assignees, p.detail.Authors, true)},
		{"Due", t.Due},
		{"Estimate", ui.FormatMinutes(t.Estimate)},
		{"Tags", strings.Join(t.Tags, ", ")},
		{"Created", ui.RelTime(time.Now(), t.CreatedAt)},
		{"Updated", ui.RelTime(time.Now(), t.Updated)},
	}))

	if t.Description != "" {
		b.WriteString("\n" + sectionHeader("DESCRIPTION", w) + "\n")
		b.WriteString(indent(theme.Markdown(t.Description, w-2)) + "\n")
	}

	if len(t.Checklist) > 0 {
		done := 0
		for _, item := range t.Checklist {
			if item.Done {
				done++
			}
		}
		b.WriteString("\n" + sectionHeader(fmt.Sprintf("CHECKLIST %d/%d", done, len(t.Checklist)), w) + "\n")
		for _, item := range t.Checklist {
			box := theme.FaintStyle.Render("☐")
			text := theme.MutedStyle.Render(item.Text)
			if item.Done {
				box = lipgloss.NewStyle().Foreground(theme.Success).Render("☑")
				text = theme.DimStyle.Render(item.Text)
			}
			b.WriteString(" " + box + " " + text + "\n")
		}
	}

	b.WriteString("\n" + sectionHeader(fmt.Sprintf("COMMENTS %d", len(t.Comments)), w) + "\n")
	if len(t.Comments) == 0 {
		b.WriteString(" " + theme.FaintStyle.Render("no comments yet") + "\n")
	}
	for _, c := range t.Comments {
		author := "unknown"
		authorColor := theme.Text2
		if ref, ok := p.detail.Authors[c.User]; ok && ref.Name != "" {
			author = ref.Name
			authorColor = theme.UserColor(ref.Color)
		}
		head := " " + lipgloss.NewStyle().Foreground(authorColor).Bold(true).Render(author) +
			theme.FaintStyle.Render(" · "+ui.RelTime(time.Now(), c.CreatedAt))
		b.WriteString("\n" + head + "\n")
		b.WriteString(indent(theme.Markdown(c.Text, w-3)) + "\n")
	}

	p.vp.SetContent(b.String())
}

func (p *TaskPage) View() string {
	out := p.vp.View()
	if p.showComposer() {
		out += "\n" + p.composer.View()
	}
	return out
}

func sectionHeader(label string, width int) string {
	head := " " + theme.FaintStyle.Bold(true).Render(label) + " "
	fill := width - lipgloss.Width(head) - 1
	if fill > 0 {
		head += theme.FaintStyle.Render(strings.Repeat("─", fill))
	}
	return head
}

func indent(text string) string {
	return "  " + strings.ReplaceAll(text, "\n", "\n  ")
}
