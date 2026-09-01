package views

import (
	"context"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/core"
	"github.com/KilicerDev/trackr/cli/internal/tui/components"
	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
	"github.com/KilicerDev/trackr/cli/internal/tui/ui"
)

// trackrTheme adapts huh's base theme to the trackr palette.
func trackrTheme(isDark bool) *huh.Styles {
	s := huh.ThemeBase(isDark)
	s.Focused.Base = s.Focused.Base.BorderForeground(theme.Accent)
	s.Blurred.Base = s.Blurred.Base.BorderForeground(theme.Border)
	s.Focused.Title = s.Focused.Title.Foreground(theme.Text).Bold(true)
	s.Blurred.Title = s.Blurred.Title.Foreground(theme.Text2)
	s.Focused.Description = s.Focused.Description.Foreground(theme.Text3)
	s.Blurred.Description = s.Blurred.Description.Foreground(theme.Text4)
	s.Focused.ErrorIndicator = s.Focused.ErrorIndicator.Foreground(theme.Danger)
	s.Focused.ErrorMessage = s.Focused.ErrorMessage.Foreground(theme.Danger)
	s.Focused.SelectSelector = s.Focused.SelectSelector.Foreground(theme.Accent)
	s.Focused.SelectedOption = s.Focused.SelectedOption.Foreground(theme.Accent)
	s.Focused.Option = s.Focused.Option.Foreground(theme.Text2)
	s.Focused.TextInput.Cursor = s.Focused.TextInput.Cursor.Foreground(theme.Accent)
	s.Focused.TextInput.Prompt = s.Focused.TextInput.Prompt.Foreground(theme.Accent)
	return s
}

// formModal wraps a huh form in the modal chrome. When the form
// completes, submit builds the action command and the modal closes.
type formModal struct {
	title  string
	form   *huh.Form
	submit func() tea.Cmd
	width  int
}

func newFormModal(title string, form *huh.Form, submit func() tea.Cmd) *formModal {
	form = form.
		WithTheme(huh.ThemeFunc(trackrTheme)).
		WithShowHelp(false)
	return &formModal{title: title, form: form, submit: submit}
}

func (m *formModal) Init() tea.Cmd { return m.form.Init() }

func (m *formModal) Update(msg tea.Msg) (components.Modal, tea.Cmd) {
	fm, cmd := m.form.Update(msg)
	if f, ok := fm.(*huh.Form); ok {
		m.form = f
	}
	switch m.form.State {
	case huh.StateCompleted:
		return nil, m.submit()
	case huh.StateAborted:
		return nil, cmd
	}
	return m, cmd
}

func (m *formModal) View(width, height int) string {
	w := components.ModalWidth(width)
	if w != m.width {
		m.width = w
		m.form = m.form.WithWidth(w - 4)
	}
	body := m.form.View()
	hints := theme.FaintStyle.Render(" enter: next · shift+tab: back · esc: cancel")
	body = " " + strings.ReplaceAll(body, "\n", "\n ") + "\n" + hints
	h := min(lipgloss.Height(body)+2, height-2)
	return components.Pane(m.title, true, w, h, body)
}

func notEmpty(field string) func(string) error {
	return func(s string) error {
		if strings.TrimSpace(s) == "" {
			return errors.New(field + " is required")
		}
		return nil
	}
}

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func optionalDate(s string) error {
	if s == "" {
		return nil
	}
	if !dateRe.MatchString(s) {
		return errors.New("use YYYY-MM-DD")
	}
	if _, err := time.Parse("2006-01-02", s); err != nil {
		return errors.New("not a real date")
	}
	return nil
}

func optionalInt(s string) error {
	if s == "" {
		return nil
	}
	if n, err := strconv.Atoi(s); err != nil || n < 0 {
		return errors.New("enter a number of minutes")
	}
	return nil
}

func metaOptions(values []string, meta func(string) theme.Meta) []huh.Option[string] {
	opts := make([]huh.Option[string], 0, len(values))
	for _, v := range values {
		opts = append(opts, huh.NewOption(meta(v).Label, v))
	}
	return opts
}

func splitTags(s string) []string {
	var tags []string
	for t := range strings.SplitSeq(s, ",") {
		if t = strings.TrimSpace(t); t != "" {
			tags = append(tags, t)
		}
	}
	return tags
}

// NewCreateTaskForm builds the "new task" modal.
func NewCreateTaskForm(ctx context.Context, svc ui.Service, session *ui.Session, defaultProject string, refresh func() tea.Cmd) components.Modal {
	var (
		title       = ""
		description = ""
		project     = strings.ToUpper(defaultProject)
		priority    = "none"
		taskType    = "task"
		due         = ""
		estimate    = ""
		tags        = ""
	)

	fields := []huh.Field{
		huh.NewInput().Title("Title").Value(&title).Validate(notEmpty("title")),
		huh.NewText().Title("Description").Lines(4).Value(&description),
	}
	if session.Projects != nil && len(session.Projects.Projects) > 0 {
		opts := make([]huh.Option[string], 0, len(session.Projects.Projects))
		for _, p := range session.Projects.Projects {
			opts = append(opts, huh.NewOption(p.Key+" · "+p.Name, p.Key))
		}
		if project == "" {
			project = session.Projects.Projects[0].Key
		}
		fields = append(fields, huh.NewSelect[string]().Title("Project").Options(opts...).Value(&project))
	} else {
		fields = append(fields, huh.NewInput().Title("Project key").Value(&project).Validate(notEmpty("project")))
	}
	fields = append(fields,
		huh.NewSelect[string]().Title("Priority").Options(metaOptions(theme.PriorityOptions, theme.PriorityMeta)...).Value(&priority),
		huh.NewSelect[string]().Title("Type").Options(metaOptions(theme.TaskTypeOptions, theme.TaskTypeMeta)...).Value(&taskType),
		huh.NewInput().Title("Due").Placeholder("YYYY-MM-DD (optional)").Value(&due).Validate(optionalDate),
		huh.NewInput().Title("Estimate").Placeholder("minutes (optional)").Value(&estimate).Validate(optionalInt),
		huh.NewInput().Title("Tags").Placeholder("comma,separated (optional)").Value(&tags),
	)

	form := huh.NewForm(huh.NewGroup(fields...))
	return newFormModal("new task", form, func() tea.Cmd {
		estimateMin, _ := strconv.Atoi(estimate)
		in := core.CreateTaskInput{
			Title:       strings.TrimSpace(title),
			Description: strings.TrimSpace(description),
			ProjectKey:  strings.TrimSpace(project),
			Priority:    priority,
			Type:        taskType,
			Due:         due,
			EstimateMin: estimateMin,
			Tags:        splitTags(tags),
		}
		action := ui.Cmd(ctx, "create task", func(ctx context.Context) (tea.Msg, error) {
			created, err := svc.CreateTask(ctx, in)
			if err != nil {
				return nil, err
			}
			ref := created.DisplayID
			if ref == "" {
				ref = "task"
			}
			return ui.FlashMsg{Text: ref + " created", Level: ui.FlashSuccess}, nil
		})
		return tea.Sequence(action, refresh())
	})
}

// NewCreateTicketForm builds the "new ticket" modal.
func NewCreateTicketForm(ctx context.Context, svc ui.Service, session *ui.Session, refresh func() tea.Cmd) components.Modal {
	var (
		org         = ""
		subject     = ""
		description = ""
	)

	var fields []huh.Field
	if session.Me != nil && len(session.Me.Orgs) > 0 {
		orgs := session.Me.Orgs
		org = orgs[0].Slug
		if len(orgs) > 1 {
			opts := make([]huh.Option[string], 0, len(orgs))
			for _, o := range orgs {
				opts = append(opts, huh.NewOption(o.Name, o.Slug))
			}
			fields = append(fields, huh.NewSelect[string]().Title("Organization").Options(opts...).Value(&org))
		}
	} else {
		fields = append(fields, huh.NewInput().Title("Organization slug").Value(&org).Validate(notEmpty("organization")))
	}
	fields = append(fields,
		huh.NewInput().Title("Subject").Value(&subject).Validate(notEmpty("subject")),
		huh.NewText().Title("Description").Lines(5).Value(&description),
	)

	form := huh.NewForm(huh.NewGroup(fields...))
	return newFormModal("new ticket", form, func() tea.Cmd {
		in := core.CreateTicketInput{
			Org:         strings.TrimSpace(org),
			Subject:     strings.TrimSpace(subject),
			Description: strings.TrimSpace(description),
		}
		action := ui.Cmd(ctx, "create ticket", func(ctx context.Context) (tea.Msg, error) {
			created, err := svc.CreateTicket(ctx, in)
			if err != nil {
				return nil, err
			}
			ref := created.DisplayID
			if ref == "" {
				ref = "ticket"
			}
			return ui.FlashMsg{Text: ref + " created", Level: ui.FlashSuccess}, nil
		})
		return tea.Sequence(action, refresh())
	})
}

// NewEditTaskForm builds the edit modal for a task, submitting only
// the fields that changed as a patch.
func NewEditTaskForm(ctx context.Context, svc ui.Service, detail *api.TaskDetail, refresh func() tea.Cmd) components.Modal {
	t := detail.Task
	var (
		title       = t.Title
		description = t.Description
		priority    = t.Priority
		taskType    = t.Type
		due         = t.Due
	)
	if priority == "" {
		priority = "none"
	}
	if taskType == "" {
		taskType = "task"
	}

	form := huh.NewForm(huh.NewGroup(
		huh.NewInput().Title("Title").Value(&title).Validate(notEmpty("title")),
		huh.NewText().Title("Description").Lines(5).Value(&description),
		huh.NewSelect[string]().Title("Priority").Options(metaOptions(theme.PriorityOptions, theme.PriorityMeta)...).Value(&priority),
		huh.NewSelect[string]().Title("Type").Options(metaOptions(theme.TaskTypeOptions, theme.TaskTypeMeta)...).Value(&taskType),
		huh.NewInput().Title("Due").Placeholder("YYYY-MM-DD").Value(&due).Validate(optionalDate),
	))

	return newFormModal("edit · "+t.ID, form, func() tea.Cmd {
		var patch api.TaskPatch
		changed := false
		if v := strings.TrimSpace(title); v != t.Title {
			patch.Title = &v
			changed = true
		}
		if v := strings.TrimSpace(description); v != t.Description {
			patch.Description = &v
			changed = true
		}
		if priority != t.Priority && !(t.Priority == "" && priority == "none") {
			p := priority
			patch.Priority = &p
			changed = true
		}
		if taskType != t.Type && !(t.Type == "" && taskType == "task") {
			tt := taskType
			patch.Type = &tt
			changed = true
		}
		if due != t.Due {
			d := due
			patch.Due = &d
			changed = true
		}
		if !changed {
			return ui.Flash(ui.FlashInfo, "nothing changed")
		}
		action := ui.Cmd(ctx, "update task", func(ctx context.Context) (tea.Msg, error) {
			if err := svc.PatchTask(ctx, t.UUID, patch); err != nil {
				return nil, err
			}
			return ui.FlashMsg{Text: t.ID + " updated", Level: ui.FlashSuccess}, nil
		})
		return tea.Sequence(action, refresh())
	})
}

// NewLogTimeForm builds the log-time modal for a task.
func NewLogTimeForm(ctx context.Context, svc ui.Service, ref, uuid string, refresh func() tea.Cmd) components.Modal {
	var (
		minutes = ""
		date    = time.Now().Format("2006-01-02")
		note    = ""
	)

	form := huh.NewForm(huh.NewGroup(
		huh.NewInput().Title("Minutes").Value(&minutes).Validate(func(s string) error {
			n, err := strconv.Atoi(strings.TrimSpace(s))
			if err != nil || n <= 0 {
				return errors.New("enter a positive number of minutes")
			}
			return nil
		}),
		huh.NewInput().Title("Date").Value(&date).Validate(optionalDate),
		huh.NewInput().Title("Note").Placeholder("optional").Value(&note),
	))

	return newFormModal("log time · "+ref, form, func() tea.Cmd {
		min, _ := strconv.Atoi(strings.TrimSpace(minutes))
		action := ui.Cmd(ctx, "log time", func(ctx context.Context) (tea.Msg, error) {
			if err := svc.LogTime(ctx, uuid, min, date, strings.TrimSpace(note)); err != nil {
				return nil, err
			}
			return ui.FlashMsg{Text: ui.FormatMinutes(min) + " logged on " + ref, Level: ui.FlashSuccess}, nil
		})
		return tea.Sequence(action, refresh())
	})
}
