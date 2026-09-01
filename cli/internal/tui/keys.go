package tui

import "charm.land/bubbles/v2/key"

// globalKeys are the bindings the app root handles regardless of the
// focused pane (modals and text inputs excepted).
type globalKeyMap struct {
	Quit     key.Binding
	Help     key.Binding
	Refresh  key.Binding
	Focus1   key.Binding
	Focus2   key.Binding
	Focus3   key.Binding
	CycleFoc key.Binding
	PrevView key.Binding
	NextView key.Binding
	Search   key.Binding
	Back     key.Binding
}

var globalKeys = globalKeyMap{
	Quit:     key.NewBinding(key.WithKeys("q", "ctrl+c"), key.WithHelp("q", "quit")),
	Help:     key.NewBinding(key.WithKeys("?"), key.WithHelp("?", "help")),
	Refresh:  key.NewBinding(key.WithKeys("r"), key.WithHelp("r", "refresh")),
	Focus1:   key.NewBinding(key.WithKeys("1"), key.WithHelp("1", "sidebar")),
	Focus2:   key.NewBinding(key.WithKeys("2"), key.WithHelp("2", "list")),
	Focus3:   key.NewBinding(key.WithKeys("3"), key.WithHelp("3", "detail")),
	CycleFoc: key.NewBinding(key.WithKeys("tab"), key.WithHelp("tab", "cycle focus")),
	PrevView: key.NewBinding(key.WithKeys("["), key.WithHelp("[", "prev view")),
	NextView: key.NewBinding(key.WithKeys("]"), key.WithHelp("]", "next view")),
	Search:   key.NewBinding(key.WithKeys("ctrl+p"), key.WithHelp("ctrl+p", "search")),
	Back:     key.NewBinding(key.WithKeys("esc"), key.WithHelp("esc", "back")),
}

func (g globalKeyMap) short() []key.Binding {
	return []key.Binding{g.Help, g.Quit}
}

func (g globalKeyMap) full() []key.Binding {
	return []key.Binding{
		g.Quit, g.Help, g.Refresh, g.Focus1, g.Focus2, g.Focus3,
		g.CycleFoc, g.PrevView, g.NextView, g.Search, g.Back,
	}
}
