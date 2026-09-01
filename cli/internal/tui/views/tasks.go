package views

import (
	"context"
	"sort"
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

type tasksLoadedMsg struct {
	seq  int
	list *api.TaskList
}

type tasksErrMsg struct {
	seq int
	err error
}

type taskKeyMap struct {
	Open     key.Binding
	Create   key.Binding
	Done     key.Binding
	Status   key.Binding
	Priority key.Binding
	Delete   key.Binding
	Scope    key.Binding
	Filter   key.Binding
	Refresh  key.Binding
}

var taskKeys = taskKeyMap{
	Open:     key.NewBinding(key.WithKeys("enter"), key.WithHelp("enter", "open")),
	Create:   key.NewBinding(key.WithKeys("c"), key.WithHelp("c", "new task")),
	Done:     key.NewBinding(key.WithKeys("d"), key.WithHelp("d", "done")),
	Status:   key.NewBinding(key.WithKeys("s"), key.WithHelp("s", "status")),
	Priority: key.NewBinding(key.WithKeys("p"), key.WithHelp("p", "priority")),
	Delete:   key.NewBinding(key.WithKeys("x"), key.WithHelp("x", "delete")),
	Scope:    key.NewBinding(key.WithKeys("m"), key.WithHelp("m", "mine/all")),
	Filter:   key.NewBinding(key.WithKeys("/"), key.WithHelp("/", "filter")),
	Refresh:  key.NewBinding(key.WithKeys("r"), key.WithHelp("r", "refresh")),
}

// TasksView is the tasks workspace view: a status-grouped list plus
// the metadata side pane.
type TasksView struct {
	ctx     context.Context
	svc     ui.Service
	session *ui.Session

	lv      components.ListView
	scope   string // "" = mine, "all"
	project string // project key filter
	loading bool
	seq     int

	list  *api.TaskList
	byRef map[string]api.Task

	listW, listH, detW, detH int
}

func NewTasksView(ctx context.Context, svc ui.Service, session *ui.Session, defaultProject string) *TasksView {
	return &TasksView{
		ctx:     ctx,
		svc:     svc,
		session: session,
		lv:      components.NewListView(),
		project: defaultProject,
		byRef:   map[string]api.Task{},
	}
}

func (v *TasksView) SetProjectFilter(key string) { v.project = key }

func (v *TasksView) SetSize(listW, listH, detW, detH int) {
	v.listW, v.listH, v.detW, v.detH = listW, listH, detW, detH
	v.lv.SetSize(listW, listH)
}

func (v *TasksView) InputActive() bool { return v.lv.FilterOpen() }

func (v *TasksView) Title() string {
	scope := "mine"
	if v.scope == "all" {
		scope = "all"
	}
	title := "Tasks · " + scope
	if v.project != "" {
		title += " · " + strings.ToUpper(v.project)
	}
	if v.loading {
		title += " ⋯"
	}
	return title
}

func (v *TasksView) DetailTitle() string {
	if row, ok := v.lv.Selected(); ok {
		return row.ID
	}
	return "detail"
}

func (v *TasksView) ShortHelp() []key.Binding {
	k := taskKeys
	return []key.Binding{k.Open, k.Create, k.Done, k.Status, k.Priority, k.Filter}
}

func (v *TasksView) Refresh() tea.Cmd {
	v.seq++
	v.loading = true
	seq := v.seq
	scope, project := v.scope, v.project
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(v.ctx, ui.Timeout)
		defer cancel()
		list, err := v.svc.ListTasks(ctx, core.ListTasksOptions{Scope: scope, Project: project})
		if err != nil {
			return tasksErrMsg{seq: seq, err: err}
		}
		return tasksLoadedMsg{seq: seq, list: list}
	}
}

func (v *TasksView) Update(msg tea.Msg) (tea.Cmd, bool) {
	switch msg := msg.(type) {
	case tasksLoadedMsg:
		if msg.seq != v.seq {
			return nil, true
		}
		v.loading = false
		v.list = msg.list
		v.rebuildRows()
		return nil, true

	case tasksErrMsg:
		if msg.seq != v.seq {
			return nil, true
		}
		v.loading = false
		err := msg.err
		return func() tea.Msg { return ui.ErrMsg{Op: "load tasks", Err: err} }, true

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

func (v *TasksView) handleKey(msg tea.KeyPressMsg) (tea.Cmd, bool) {
	task, hasTask := v.selectedTask()
	switch {
	case key.Matches(msg, taskKeys.Open):
		if hasTask {
			uuid := task.UUID
			return func() tea.Msg { return ui.OpenEntityMsg{Kind: "task", Ref: uuid} }, true
		}
		return nil, true
	case key.Matches(msg, taskKeys.Create):
		return components.ShowModal(NewCreateTaskForm(v.ctx, v.svc, v.session, v.project, v.Refresh)), true
	case key.Matches(msg, taskKeys.Done):
		if hasTask && task.Status != "done" {
			return v.mutate("complete task", task.ID+" → Done", func(ctx context.Context) error {
				return v.svc.CompleteTask(ctx, task.UUID)
			}), true
		}
		return nil, true
	case key.Matches(msg, taskKeys.Status):
		if hasTask {
			return components.ShowModal(v.statusPicker(task)), true
		}
		return nil, true
	case key.Matches(msg, taskKeys.Priority):
		if hasTask {
			return components.ShowModal(v.priorityPicker(task)), true
		}
		return nil, true
	case key.Matches(msg, taskKeys.Delete):
		if hasTask {
			return components.ShowModal(components.NewConfirm(
				"delete task",
				"Delete "+task.ID+" — "+task.Title+"? This cannot be undone.",
				true,
				v.mutate("delete task", task.ID+" deleted", func(ctx context.Context) error {
					return v.svc.DeleteTask(ctx, task.UUID)
				}),
			)), true
		}
		return nil, true
	case key.Matches(msg, taskKeys.Scope):
		if !v.session.Staff() {
			return ui.Flash(ui.FlashInfo, "the all-tasks scope needs a staff account"), true
		}
		if v.scope == "all" {
			v.scope = ""
		} else {
			v.scope = "all"
		}
		return v.Refresh(), true
	case key.Matches(msg, taskKeys.Refresh):
		return v.Refresh(), true
	}
	return nil, false
}

// mutate runs an action then refetches, flashing on success.
func (v *TasksView) mutate(op, flash string, fn func(ctx context.Context) error) tea.Cmd {
	action := ui.Cmd(v.ctx, op, func(ctx context.Context) (tea.Msg, error) {
		if err := fn(ctx); err != nil {
			return nil, err
		}
		return ui.FlashMsg{Text: flash, Level: ui.FlashSuccess}, nil
	})
	return tea.Sequence(action, v.Refresh())
}

func (v *TasksView) statusPicker(task api.Task) components.Modal {
	opts := make([]components.PickerOption, 0, len(theme.TaskStatusOptions))
	for _, s := range theme.TaskStatusOptions {
		meta := theme.TaskStatusMeta(s)
		opts = append(opts, components.PickerOption{Value: s, Glyph: meta.Styled(), Label: meta.Label})
	}
	return components.NewPicker("status · "+task.ID, opts, task.Status, func(status string) tea.Cmd {
		return v.mutate("update status", task.ID+" → "+theme.TaskStatusMeta(status).Label, func(ctx context.Context) error {
			return v.svc.UpdateTaskStatus(ctx, task.UUID, status)
		})
	})
}

func (v *TasksView) priorityPicker(task api.Task) components.Modal {
	opts := make([]components.PickerOption, 0, len(theme.PriorityOptions))
	for _, p := range theme.PriorityOptions {
		meta := theme.PriorityMeta(p)
		opts = append(opts, components.PickerOption{Value: p, Glyph: meta.Styled(), Label: meta.Label})
	}
	return components.NewPicker("priority · "+task.ID, opts, task.Priority, func(priority string) tea.Cmd {
		return v.mutate("update priority", task.ID+" priority → "+theme.PriorityMeta(priority).Label, func(ctx context.Context) error {
			return v.svc.PatchTask(ctx, task.UUID, api.TaskPatch{Priority: &priority})
		})
	})
}

func (v *TasksView) selectedTask() (api.Task, bool) {
	task, ok := v.byRef[v.lv.SelectedID()]
	return task, ok
}

func (v *TasksView) rebuildRows() {
	v.byRef = map[string]api.Task{}
	if v.list == nil {
		v.lv.SetRows(nil)
		return
	}
	groups := map[string][]api.Task{}
	for _, t := range v.list.Tasks {
		groups[t.Status] = append(groups[t.Status], t)
		v.byRef[t.ID] = t
	}
	users := v.list.Users
	now := time.Now()
	var rows []components.Row
	for _, status := range theme.TaskStatusOrder {
		tasks := groups[status]
		if len(tasks) == 0 {
			continue
		}
		sort.SliceStable(tasks, func(i, j int) bool { return tasks[i].Updated > tasks[j].Updated })
		meta := theme.TaskStatusMeta(status)
		rows = append(rows, components.Row{
			Kind: components.RowHeader,
			Render: func(width int, _ bool) string {
				return groupHeader(width, meta, len(tasks))
			},
		})
		for _, t := range tasks {
			task := t
			rows = append(rows, components.Row{
				ID:     task.ID,
				Kind:   components.RowItem,
				Filter: task.ID + " " + task.Title + " " + strings.Join(task.Tags, " ") + " " + names(task.Assignees, users, false),
				Render: func(width int, selected bool) string {
					return v.renderRow(task, users, now, width, selected)
				},
			})
		}
	}
	v.lv.SetRows(rows)
}

func (v *TasksView) renderRow(t api.Task, users map[string]api.UserRef, now time.Time, width int, selected bool) string {
	status := theme.TaskStatusMeta(t.Status)
	prio := theme.PriorityMeta(t.Priority)

	assignee := ""
	if len(t.Assignees) > 0 {
		assignee = firstName(t.Assignees[0], users)
		if len(t.Assignees) > 1 {
			assignee += "+"
		}
	}

	// Fixed right-hand columns; the title absorbs the rest.
	const refW, prioW, dueW, whoW = 9, 3, 11, 9
	left := status.Styled() + " " + theme.DimStyle.Render(ui.Pad(t.ID, refW))
	right := prio.Styled() + " " + dueCell(now, t.Due, dueW) + " " + theme.FaintStyle.Render(ui.Pad(assignee, whoW))

	titleW := width - 2 - lipgloss.Width(left) - lipgloss.Width(right) - 2
	titleStyle := lipgloss.NewStyle().Foreground(theme.Text)
	if t.Status == "done" {
		titleStyle = theme.DimStyle
	}
	title := titleStyle.Render(ui.Pad(t.Title, max(titleW, 4)))

	return rowLine(width, selected, left+title+" "+right)
}

func (v *TasksView) View() string { return v.lv.View() }

func (v *TasksView) DetailView() string {
	task, ok := v.selectedTask()
	if !ok {
		return "\n" + theme.FaintStyle.Render("  no task selected")
	}
	var users map[string]api.UserRef
	if v.list != nil {
		users = v.list.Users
	}
	status := theme.TaskStatusMeta(task.Status)
	prio := theme.PriorityMeta(task.Priority)

	var b strings.Builder
	b.WriteString(wrap(theme.TitleStyle.Render(task.Title), v.detW-2) + "\n\n")
	fields := []field{
		{"Status", status.StyledLabel()},
		{"Priority", prio.StyledLabel()},
		{"Type", theme.TaskTypeMeta(task.Type).Label},
		{"Project", task.Project},
		{"Assignees", names(task.Assignees, users, true)},
		{"Due", task.Due},
		{"Estimate", ui.FormatMinutes(task.Estimate)},
		{"Tags", strings.Join(task.Tags, ", ")},
		{"Updated", ui.RelTime(time.Now(), task.Updated)},
	}
	if task.Type == "" {
		fields[2].value = ""
	}
	b.WriteString(renderFields(v.detW, fields))
	b.WriteString("\n" + theme.FaintStyle.Render(" enter: open full view"))
	return b.String()
}
