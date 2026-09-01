package views

import (
	"context"
	"slices"
	"strings"
	"time"

	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/tui/components"
	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
	"github.com/KilicerDev/trackr/cli/internal/tui/ui"
)

const searchDebounce = 250 * time.Millisecond

type searchTickMsg struct{ seq int }

type searchResultsMsg struct {
	seq int
	res *api.SearchResults
}

type searchErrMsg struct {
	seq int
	err error
}

var searchTypeOrder = []string{"ticket", "task", "project", "wiki", "note"}

var searchTypeGlyph = map[string]string{
	"ticket":  "◉",
	"task":    "○",
	"project": "▤",
	"wiki":    "▷",
	"note":    "✎",
}

// SearchPalette is the telescope-style global search modal (ctrl+p).
type SearchPalette struct {
	ctx context.Context
	svc ui.Service

	input   textinput.Model
	results []api.SearchResult
	cursor  int
	seq     int
	loading bool
	queried bool
}

func NewSearchPalette(ctx context.Context, svc ui.Service) *SearchPalette {
	ti := textinput.New()
	ti.Placeholder = "search tickets, tasks, projects…"
	ti.SetStyles(textinput.DefaultDarkStyles())
	ti.Prompt = "  "
	ti.Focus()
	return &SearchPalette{ctx: ctx, svc: svc, input: ti}
}

func (s *SearchPalette) Update(msg tea.Msg) (components.Modal, tea.Cmd) {
	switch msg := msg.(type) {
	case searchTickMsg:
		if msg.seq != s.seq {
			return s, nil
		}
		query := strings.TrimSpace(s.input.Value())
		if len(query) < 2 {
			return s, nil
		}
		s.loading = true
		seq := s.seq
		return s, func() tea.Msg {
			ctx, cancel := context.WithTimeout(s.ctx, ui.Timeout)
			defer cancel()
			res, err := s.svc.Search(ctx, query)
			if err != nil {
				return searchErrMsg{seq: seq, err: err}
			}
			return searchResultsMsg{seq: seq, res: res}
		}

	case searchResultsMsg:
		if msg.seq != s.seq {
			return s, nil
		}
		s.loading = false
		s.queried = true
		s.results = sortResults(msg.res.Results)
		s.cursor = 0
		return s, nil

	case searchErrMsg:
		if msg.seq != s.seq {
			return s, nil
		}
		s.loading = false
		err := msg.err
		return s, func() tea.Msg { return ui.ErrMsg{Op: "search", Err: err} }

	case tea.KeyPressMsg:
		switch msg.String() {
		case "esc":
			return nil, nil
		case "down", "ctrl+n", "tab":
			if s.cursor < len(s.results)-1 {
				s.cursor++
			}
			return s, nil
		case "up", "ctrl+p", "shift+tab":
			if s.cursor > 0 {
				s.cursor--
			}
			return s, nil
		case "enter":
			return s.pick()
		}
		var cmd tea.Cmd
		s.input, cmd = s.input.Update(msg)
		s.seq++
		seq := s.seq
		tick := tea.Tick(searchDebounce, func(time.Time) tea.Msg { return searchTickMsg{seq: seq} })
		return s, tea.Batch(cmd, tick)
	}

	// Cursor blink etc.
	var cmd tea.Cmd
	s.input, cmd = s.input.Update(msg)
	return s, cmd
}

func (s *SearchPalette) pick() (components.Modal, tea.Cmd) {
	if s.cursor >= len(s.results) {
		return s, nil
	}
	r := s.results[s.cursor]
	switch r.Type {
	case "task", "ticket", "project":
		kind, ref := r.Type, r.ID
		return nil, func() tea.Msg { return ui.OpenEntityMsg{Kind: kind, Ref: ref} }
	default:
		return nil, ui.Flash(ui.FlashInfo, "%s results open in the web app", r.Type)
	}
}

func sortResults(results []api.SearchResult) []api.SearchResult {
	out := make([]api.SearchResult, 0, len(results))
	for _, t := range searchTypeOrder {
		for _, r := range results {
			if r.Type == t {
				out = append(out, r)
			}
		}
	}
	for _, r := range results {
		if !slices.Contains(searchTypeOrder, r.Type) {
			out = append(out, r)
		}
	}
	return out
}

func (s *SearchPalette) View(width, height int) string {
	w := min(width-8, 64)
	innerW := w - 2
	s.input.SetWidth(innerW - 4)

	var b strings.Builder
	b.WriteString(" " + s.input.View() + "\n")
	b.WriteString(theme.FaintStyle.Render(strings.Repeat("─", innerW)) + "\n")

	maxRows := max(min(height-10, 14), 4)
	switch {
	case s.loading:
		b.WriteString(" " + theme.FaintStyle.Render("searching…"))
	case len(s.results) == 0:
		hint := "type at least 2 characters"
		if s.queried {
			hint = "no results"
		}
		b.WriteString(" " + theme.FaintStyle.Render(hint))
	default:
		start := 0
		if s.cursor >= maxRows {
			start = s.cursor - maxRows + 1
		}
		lastType := ""
		shown := 0
		for i := start; i < len(s.results) && shown < maxRows; i++ {
			r := s.results[i]
			if r.Type != lastType {
				lastType = r.Type
			}
			marker := "  "
			titleStyle := theme.MutedStyle
			if i == s.cursor {
				marker = theme.AccentStyle.Render("▸ ")
				titleStyle = theme.TitleStyle
			}
			glyph := searchTypeGlyph[r.Type]
			if glyph == "" {
				glyph = "•"
			}
			line := marker + theme.DimStyle.Render(glyph) + " " + titleStyle.Render(r.Title)
			if r.Subtitle != "" {
				line += theme.FaintStyle.Render("  " + r.Subtitle)
			}
			b.WriteString(ui.Truncate(line, innerW-1) + "\n")
			shown++
		}
	}

	body := strings.TrimRight(b.String(), "\n")
	h := lipgloss.Height(body) + 2
	return components.Pane("search", true, w, h, body)
}
