package tui

import (
	"context"
	"errors"
	"net/url"
	"strings"

	"charm.land/bubbles/v2/help"
	"charm.land/bubbles/v2/key"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/config"
	"github.com/KilicerDev/trackr/cli/internal/tui/components"
	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
	"github.com/KilicerDev/trackr/cli/internal/tui/ui"
	"github.com/KilicerDev/trackr/cli/internal/tui/views"
)

type viewID int

const (
	viewTasks viewID = iota
	viewTickets
	viewInbox
	viewCount
)

type focusArea int

const (
	focusSidebar focusArea = iota
	focusList
	focusDetail
)

// workspaceView is what the three main views expose to the app root.
type workspaceView interface {
	Refresh() tea.Cmd
	// Update processes a message; handled reports whether a key press
	// was consumed (data messages always count as handled).
	Update(msg tea.Msg) (tea.Cmd, bool)
	View() string
	DetailView() string
	Title() string
	DetailTitle() string
	SetSize(listW, listH, detailW, detailH int)
	InputActive() bool
	ShortHelp() []key.Binding
}

// page is a full-screen detail page on the navigation stack.
type page interface {
	Init() tea.Cmd
	Update(msg tea.Msg) (tea.Cmd, bool)
	View() string
	Title() string
	SetSize(w, h int)
	InputActive() bool
	ShortHelp() []key.Binding
}

type meLoadedMsg struct{ me *api.Me }
type projectsLoadedMsg struct{ list *api.ProjectList }

const (
	minWidth  = 80
	minHeight = 20
)

// App is the root Bubble Tea model.
type App struct {
	ctx     context.Context
	svc     ui.Service
	session *ui.Session
	server  string

	width, height int
	tooSmall      bool
	lightWarned   bool

	// layout (outer pane sizes, computed on resize)
	workH, sideW, listW, detW int

	focus   focusArea
	view    viewID
	tasks   *views.TasksView
	tickets *views.TicketsView
	inbox   *views.InboxView
	loaded  [viewCount]bool

	sidebar sidebar
	pages   []page
	modal   components.Modal
	status  components.StatusBar
	help    help.Model
	helpVis bool

	fatalErr error
}

func newApp(ctx context.Context, cfg *config.Config, svc ui.Service) *App {
	session := &ui.Session{}
	a := &App{
		ctx:     ctx,
		svc:     svc,
		session: session,
		server:  cfg.Server,
		focus:   focusList,
		tasks:   views.NewTasksView(ctx, svc, session, cfg.DefaultProject),
		tickets: views.NewTicketsView(ctx, svc, session),
		inbox:   views.NewInboxView(ctx, svc, session),
		status:  components.NewStatusBar(),
		help:    help.New(),
	}
	a.help.Styles = help.DefaultDarkStyles()
	a.sidebar = sidebar{session: session, activeProject: cfg.DefaultProject}
	a.sidebar.rebuild()
	a.status.Identity = identityLine("", cfg.Server)
	return a
}

func identityLine(user, server string) string {
	host := server
	if u, err := url.Parse(server); err == nil && u.Host != "" {
		host = u.Host
	}
	if user == "" {
		return host
	}
	return user + " · " + host
}

func (a *App) Init() tea.Cmd {
	a.loaded[a.view] = true
	return tea.Batch(
		tea.RequestBackgroundColor,
		a.fetchMe(),
		a.fetchProjects(),
		a.activeView().Refresh(),
	)
}

func (a *App) fetchMe() tea.Cmd {
	return ui.Cmd(a.ctx, "load profile", func(ctx context.Context) (tea.Msg, error) {
		me, err := a.svc.Me(ctx)
		if err != nil {
			return nil, err
		}
		return meLoadedMsg{me: me}, nil
	})
}

func (a *App) fetchProjects() tea.Cmd {
	return ui.Cmd(a.ctx, "load projects", func(ctx context.Context) (tea.Msg, error) {
		list, err := a.svc.ListProjects(ctx)
		if err != nil {
			return nil, err
		}
		return projectsLoadedMsg{list: list}, nil
	})
}

func (a *App) activeView() workspaceView {
	switch a.view {
	case viewTickets:
		return a.tickets
	case viewInbox:
		return a.inbox
	default:
		return a.tasks
	}
}

func (a *App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		a.width, a.height = msg.Width, msg.Height
		a.layout()
		return a, nil

	case tea.BackgroundColorMsg:
		if !msg.IsDark() && !a.lightWarned {
			a.lightWarned = true
			return a, ui.Flash(ui.FlashInfo, "heads up: the trackr TUI is designed for dark terminals")
		}
		return a, nil

	case meLoadedMsg:
		a.session.Me = msg.me
		a.status.Identity = identityLine(msg.me.User.Name, a.server)
		a.sidebar.rebuild()
		return a, a.ensureViewAvailable()

	case projectsLoadedMsg:
		a.session.Projects = msg.list
		a.sidebar.rebuild()
		return a, nil

	case ui.RefreshMeMsg:
		return a, a.fetchMe()

	case components.ShowModalMsg:
		a.modal = msg.Modal
		if init, ok := msg.Modal.(interface{ Init() tea.Cmd }); ok {
			return a, init.Init()
		}
		return a, nil

	case ui.OpenEntityMsg:
		return a, a.openEntity(msg)

	case ui.ErrMsg:
		if errors.Is(msg.Err, api.ErrUnauthorized) {
			a.fatalErr = msg.Err
			a.modal = &authExpiredModal{}
			return a, nil
		}
		cmds := a.broadcast(msg)
		cmds = append(cmds, a.status.Update(ui.FlashMsg{
			Text:  msg.Op + ": " + msg.Err.Error(),
			Level: ui.FlashError,
		}))
		return a, tea.Batch(cmds...)

	case tea.MouseWheelMsg:
		// Wheel scrolls whatever is on top, never everything at once.
		if a.modal != nil || a.tooSmall {
			return a, nil
		}
		if n := len(a.pages); n > 0 {
			cmd, _ := a.pages[n-1].Update(msg)
			return a, cmd
		}
		cmd, _ := a.activeView().Update(msg)
		return a, cmd

	case tea.KeyPressMsg:
		return a.updateKey(msg)
	}

	// Data and tick messages: deliver everywhere they might belong.
	return a, tea.Batch(a.broadcast(msg)...)
}

// broadcast forwards a non-key message to the status bar, the modal,
// every view, and every page, so async results and ticks always reach
// their owner regardless of focus.
func (a *App) broadcast(msg tea.Msg) []tea.Cmd {
	var cmds []tea.Cmd
	if cmd := a.status.Update(msg); cmd != nil {
		cmds = append(cmds, cmd)
	}
	if a.modal != nil {
		var cmd tea.Cmd
		a.modal, cmd = a.modal.Update(msg)
		if cmd != nil {
			cmds = append(cmds, cmd)
		}
	}
	for _, v := range []workspaceView{a.tasks, a.tickets, a.inbox} {
		if cmd, _ := v.Update(msg); cmd != nil {
			cmds = append(cmds, cmd)
		}
	}
	for _, p := range a.pages {
		if cmd, _ := p.Update(msg); cmd != nil {
			cmds = append(cmds, cmd)
		}
	}
	return cmds
}

func (a *App) updateKey(msg tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if msg.String() == "ctrl+c" {
		return a, tea.Quit
	}

	if a.modal != nil {
		var cmd tea.Cmd
		a.modal, cmd = a.modal.Update(msg)
		return a, cmd
	}

	if a.helpVis {
		a.helpVis = false
		return a, nil
	}

	if a.tooSmall {
		if msg.String() == "q" {
			return a, tea.Quit
		}
		return a, nil
	}

	// Full-page stack owns input while non-empty.
	if n := len(a.pages); n > 0 {
		top := a.pages[n-1]
		if top.InputActive() {
			cmd, _ := top.Update(msg)
			return a, cmd
		}
		if cmd, handled := top.Update(msg); handled {
			return a, cmd
		}
		switch {
		case key.Matches(msg, globalKeys.Quit):
			return a, tea.Quit
		case key.Matches(msg, globalKeys.Help):
			a.helpVis = true
		case key.Matches(msg, globalKeys.Back):
			a.pages = a.pages[:n-1]
		case key.Matches(msg, globalKeys.Search):
			return a, a.openSearch()
		}
		return a, nil
	}

	active := a.activeView()

	// A focused text input (list filter) sees every key first.
	if a.focus != focusSidebar && active.InputActive() {
		cmd, _ := active.Update(msg)
		return a, cmd
	}

	switch {
	case key.Matches(msg, globalKeys.Quit):
		return a, tea.Quit
	case key.Matches(msg, globalKeys.Help):
		a.helpVis = true
		return a, nil
	case key.Matches(msg, globalKeys.Focus1):
		if a.sideW > 0 {
			a.focus = focusSidebar
		}
		return a, nil
	case key.Matches(msg, globalKeys.Focus2):
		a.focus = focusList
		return a, nil
	case key.Matches(msg, globalKeys.Focus3):
		if a.detW > 0 {
			a.focus = focusDetail
		}
		return a, nil
	case key.Matches(msg, globalKeys.CycleFoc):
		a.cycleFocus()
		return a, nil
	case key.Matches(msg, globalKeys.PrevView):
		return a, a.switchView(a.prevAvailable())
	case key.Matches(msg, globalKeys.NextView):
		return a, a.switchView(a.nextAvailable())
	case key.Matches(msg, globalKeys.Search):
		return a, a.openSearch()
	}

	if a.focus == focusSidebar {
		selected, handled := a.sidebar.update(msg)
		if selected != nil {
			return a, a.selectSidebarEntry(*selected)
		}
		if !handled && msg.String() == "esc" {
			a.focus = focusList
		}
		return a, nil
	}

	cmd, handled := active.Update(msg)
	if !handled && msg.String() == "esc" && a.focus == focusDetail {
		a.focus = focusList
	}
	return a, cmd
}

func (a *App) cycleFocus() {
	order := []focusArea{focusList}
	if a.sideW > 0 {
		order = []focusArea{focusSidebar, focusList}
	}
	if a.detW > 0 {
		order = append(order, focusDetail)
	}
	for i, f := range order {
		if f == a.focus {
			a.focus = order[(i+1)%len(order)]
			return
		}
	}
	a.focus = focusList
}

func (a *App) available(id viewID) bool {
	switch id {
	case viewTasks:
		return a.session.Surface("tasks")
	case viewTickets:
		return a.session.Surface("tickets")
	}
	return true
}

func (a *App) nextAvailable() viewID {
	id := a.view
	for range int(viewCount) {
		id = (id + 1) % viewCount
		if a.available(id) {
			return id
		}
	}
	return a.view
}

func (a *App) prevAvailable() viewID {
	id := a.view
	for range int(viewCount) {
		id = (id + viewCount - 1) % viewCount
		if a.available(id) {
			return id
		}
	}
	return a.view
}

// ensureViewAvailable moves off a view the loaded capabilities exclude.
func (a *App) ensureViewAvailable() tea.Cmd {
	if a.available(a.view) {
		return nil
	}
	return a.switchView(a.nextAvailable())
}

func (a *App) switchView(id viewID) tea.Cmd {
	if !a.available(id) {
		return nil
	}
	a.view = id
	a.sidebar.activeView = id
	if a.focus == focusDetail && a.detW == 0 {
		a.focus = focusList
	}
	if !a.loaded[id] {
		a.loaded[id] = true
		return a.activeView().Refresh()
	}
	return nil
}

func (a *App) selectSidebarEntry(e sidebarEntry) tea.Cmd {
	switch e.kind {
	case entryView:
		a.focus = focusList
		return a.switchView(e.view)
	case entryProject:
		if a.sidebar.activeProject == e.projectKey {
			a.sidebar.activeProject = ""
		} else {
			a.sidebar.activeProject = e.projectKey
		}
		a.tasks.SetProjectFilter(a.sidebar.activeProject)
		a.focus = focusList
		cmd := a.switchView(viewTasks)
		return tea.Batch(cmd, a.tasks.Refresh())
	}
	return nil
}

func (a *App) openEntity(msg ui.OpenEntityMsg) tea.Cmd {
	var p page
	switch msg.Kind {
	case "task":
		p = views.NewTaskPage(a.ctx, a.svc, a.session, msg.Ref)
	case "ticket":
		p = views.NewTicketPage(a.ctx, a.svc, a.session, msg.Ref)
	case "project":
		// From the search palette: focus the tasks view on it.
		if a.session.Projects != nil {
			for _, proj := range a.session.Projects.Projects {
				if proj.ID == msg.Ref || strings.EqualFold(proj.Key, msg.Ref) {
					a.sidebar.activeProject = proj.Key
					a.tasks.SetProjectFilter(proj.Key)
					a.focus = focusList
					return tea.Batch(a.switchView(viewTasks), a.tasks.Refresh())
				}
			}
		}
		return ui.Flash(ui.FlashInfo, "project not found")
	default:
		return ui.Flash(ui.FlashInfo, "%s items open in the web app", msg.Kind)
	}
	p.SetSize(a.width-2, a.workH-2)
	a.pages = append(a.pages, p)
	return p.Init()
}

func (a *App) openSearch() tea.Cmd {
	a.modal = views.NewSearchPalette(a.ctx, a.svc)
	return nil
}

func (a *App) layout() {
	a.tooSmall = a.width < minWidth || a.height < minHeight
	a.workH = a.height - 1

	a.sideW = 0
	if a.width >= 100 {
		a.sideW = 24
	}
	a.detW = 0
	if a.width >= 110 {
		a.detW = max(32, (a.width-a.sideW)*2/5)
	}
	a.listW = a.width - a.sideW - a.detW

	if a.focus == focusSidebar && a.sideW == 0 {
		a.focus = focusList
	}
	if a.focus == focusDetail && a.detW == 0 {
		a.focus = focusList
	}

	a.sidebar.width, a.sidebar.height = a.sideW-2, a.workH-2
	for _, v := range []workspaceView{a.tasks, a.tickets, a.inbox} {
		v.SetSize(a.listW-2, a.workH-2, max(a.detW-2, 0), a.workH-2)
	}
	for _, p := range a.pages {
		p.SetSize(a.width-2, a.workH-2)
	}
}

func (a *App) View() tea.View {
	v := tea.NewView(a.render())
	v.AltScreen = true
	v.MouseMode = tea.MouseModeCellMotion
	return v
}

func (a *App) render() string {
	if a.width <= 0 || a.height <= 0 {
		return ""
	}
	if a.tooSmall {
		msg := theme.MutedStyle.Render("terminal too small") + "\n" +
			theme.FaintStyle.Render("trackr needs at least 80×20") + "\n" +
			theme.FaintStyle.Render("(q to quit)")
		return lipgloss.Place(a.width, a.height, lipgloss.Center, lipgloss.Center, msg)
	}

	var body string
	var context []key.Binding

	if n := len(a.pages); n > 0 {
		top := a.pages[n-1]
		body = components.Pane(top.Title(), true, a.width, a.workH, top.View())
		context = top.ShortHelp()
	} else {
		active := a.activeView()
		var panes []string
		if a.sideW > 0 {
			panes = append(panes, components.Pane("trackr", a.focus == focusSidebar, a.sideW, a.workH, a.sidebar.view(a.focus == focusSidebar)))
		}
		panes = append(panes, components.Pane(active.Title(), a.focus == focusList, a.listW, a.workH, active.View()))
		if a.detW > 0 {
			panes = append(panes, components.Pane(active.DetailTitle(), a.focus == focusDetail, a.detW, a.workH, active.DetailView()))
		}
		body = lipgloss.JoinHorizontal(lipgloss.Top, panes...)
		context = active.ShortHelp()
	}

	a.status.Hints = a.help.ShortHelpView(append(context, globalKeys.short()...))
	out := body + "\n" + a.status.View(a.width)

	if a.helpVis {
		out = components.Overlay(out, a.renderHelp(), a.width, a.height)
	}
	if a.modal != nil {
		out = components.Overlay(out, a.modal.View(a.width, a.workH), a.width, a.height)
	}
	return out
}

func (a *App) renderHelp() string {
	var context []key.Binding
	if n := len(a.pages); n > 0 {
		context = a.pages[n-1].ShortHelp()
	} else {
		context = a.activeView().ShortHelp()
	}
	body := a.help.FullHelpView([][]key.Binding{context, globalKeys.full()})
	w := min(lipgloss.Width(body)+6, a.width-4)
	h := lipgloss.Height(body) + 2
	return components.Pane("keys", true, w, h, " "+strings.ReplaceAll(body, "\n", "\n "))
}

// authExpiredModal blocks all input and quits on the next key press;
// App.fatalErr carries the unauthorized error out to the exit code.
type authExpiredModal struct{}

func (m *authExpiredModal) Update(msg tea.Msg) (components.Modal, tea.Cmd) {
	if _, ok := msg.(tea.KeyPressMsg); ok {
		return m, tea.Quit
	}
	return m, nil
}

func (m *authExpiredModal) View(width, height int) string {
	body := " " + theme.DangerStyle.Render("Your session has expired.") + "\n\n" +
		" " + theme.MutedStyle.Render("Run 'trackr login' to sign in again.") + "\n" +
		" " + theme.FaintStyle.Render("press any key to exit")
	w := min(46, width-4)
	return components.Pane("session expired", true, w, lipgloss.Height(body)+2, body)
}
