package components

import (
	"strings"

	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"

	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
)

// RowKind separates selectable items from section headers.
type RowKind int

const (
	RowItem RowKind = iota
	RowHeader
)

// Row is one line of a ListView. Items carry a stable ID (cursor
// position survives refetches), a Filter string matched by "/", and a
// Render closure producing the row at a width in a selected state.
type Row struct {
	ID     string
	Kind   RowKind
	Filter string
	Render func(width int, selected bool) string
}

// ListView is a scrolling, filterable list with non-selectable section
// headers and vim movement. It renders plain rows into a fixed window
// (no viewport bubble) so the scroll math stays simple and testable.
type ListView struct {
	rows    []Row
	visible []int // indexes into rows after filtering
	cursor  int   // index into visible; always an item, -1 when empty
	top     int   // first visible index in the window

	width, height int

	filter    textinput.Model
	filtering bool // filter input focused
}

func NewListView() ListView {
	ti := textinput.New()
	ti.Placeholder = "filter…"
	ti.SetStyles(textinput.DefaultDarkStyles())
	ti.Prompt = "/ "
	return ListView{cursor: -1, filter: ti}
}

func (l *ListView) SetSize(w, h int) {
	l.width, l.height = w, h
	l.filter.SetWidth(max(w-4, 8))
	l.scrollToCursor()
}

// SetRows replaces the data, keeping the cursor on the same item ID
// when it still exists.
func (l *ListView) SetRows(rows []Row) {
	prev := l.SelectedID()
	l.rows = rows
	l.applyFilter()
	if prev != "" {
		for vi, ri := range l.visible {
			if l.rows[ri].Kind == RowItem && l.rows[ri].ID == prev {
				l.cursor = vi
				break
			}
		}
	}
	l.clampCursor()
	l.scrollToCursor()
}

// Selected returns the row under the cursor.
func (l *ListView) Selected() (Row, bool) {
	if l.cursor < 0 || l.cursor >= len(l.visible) {
		return Row{}, false
	}
	return l.rows[l.visible[l.cursor]], true
}

func (l *ListView) SelectedID() string {
	if row, ok := l.Selected(); ok {
		return row.ID
	}
	return ""
}

// FilterOpen reports whether the filter input currently owns keys.
func (l *ListView) FilterOpen() bool { return l.filtering }

// FilterActive reports whether a filter query is applied.
func (l *ListView) FilterActive() bool { return l.filter.Value() != "" }

func (l *ListView) ClearFilter() {
	l.filter.SetValue("")
	l.filter.Blur()
	l.filtering = false
	l.applyFilter()
	l.clampCursor()
	l.scrollToCursor()
}

// Update handles list keys. It returns handled=false for keys the
// caller (the owning view) should process itself.
func (l *ListView) Update(msg tea.Msg) (tea.Cmd, bool) {
	if wheel, ok := msg.(tea.MouseWheelMsg); ok {
		switch wheel.Button {
		case tea.MouseWheelUp:
			l.move(-1)
		case tea.MouseWheelDown:
			l.move(1)
		}
		return nil, true
	}
	key, ok := msg.(tea.KeyPressMsg)
	if !ok {
		return nil, false
	}

	if l.filtering {
		switch key.String() {
		case "enter":
			l.filtering = false
			l.filter.Blur()
		case "esc":
			l.ClearFilter()
		default:
			var cmd tea.Cmd
			l.filter, cmd = l.filter.Update(msg)
			l.applyFilter()
			l.clampCursor()
			l.scrollToCursor()
			return cmd, true
		}
		return nil, true
	}

	switch key.String() {
	case "j", "down":
		l.move(1)
	case "k", "up":
		l.move(-1)
	case "g", "home":
		l.moveTo(0)
	case "G", "end":
		l.moveTo(len(l.visible) - 1)
	case "ctrl+d", "pgdown":
		l.movePage(1)
	case "ctrl+u", "pgup":
		l.movePage(-1)
	case "/":
		l.filtering = true
		return l.filter.Focus(), true
	case "esc":
		if l.FilterActive() {
			l.ClearFilter()
			return nil, true
		}
		return nil, false
	default:
		return nil, false
	}
	return nil, true
}

func (l *ListView) View() string {
	lines := make([]string, 0, l.height)
	listH := l.height
	if l.filtering || l.FilterActive() {
		lines = append(lines, " "+l.filter.View())
		listH--
	}
	if len(l.visible) == 0 {
		if listH > 0 {
			lines = append(lines, theme.FaintStyle.Render("  nothing here"))
		}
		return strings.Join(lines, "\n")
	}
	end := min(l.top+listH, len(l.visible))
	for vi := l.top; vi < end; vi++ {
		row := l.rows[l.visible[vi]]
		lines = append(lines, row.Render(l.width, vi == l.cursor))
	}
	return strings.Join(lines, "\n")
}

// Count returns the number of visible selectable items.
func (l *ListView) Count() int {
	n := 0
	for _, ri := range l.visible {
		if l.rows[ri].Kind == RowItem {
			n++
		}
	}
	return n
}

func (l *ListView) window() int {
	h := l.height
	if l.filtering || l.FilterActive() {
		h--
	}
	return max(h, 1)
}

func (l *ListView) applyFilter() {
	query := strings.ToLower(strings.TrimSpace(l.filter.Value()))
	l.visible = l.visible[:0]
	if query == "" {
		for i := range l.rows {
			l.visible = append(l.visible, i)
		}
		return
	}
	// Keep a header only when at least one of its items matches.
	pendingHeader := -1
	for i, row := range l.rows {
		if row.Kind == RowHeader {
			pendingHeader = i
			continue
		}
		if strings.Contains(strings.ToLower(row.Filter), query) {
			if pendingHeader >= 0 {
				l.visible = append(l.visible, pendingHeader)
				pendingHeader = -1
			}
			l.visible = append(l.visible, i)
		}
	}
}

func (l *ListView) clampCursor() {
	if len(l.visible) == 0 {
		l.cursor = -1
		l.top = 0
		return
	}
	if l.cursor < 0 || l.cursor >= len(l.visible) {
		l.cursor = 0
	}
	if l.rows[l.visible[l.cursor]].Kind != RowItem {
		l.seekItem(l.cursor, 1)
	}
}

// seekItem moves the cursor from start in direction dir to the nearest
// item row, trying the opposite direction if none is found.
func (l *ListView) seekItem(start, dir int) {
	for i := start; i >= 0 && i < len(l.visible); i += dir {
		if l.rows[l.visible[i]].Kind == RowItem {
			l.cursor = i
			return
		}
	}
	for i := start; i >= 0 && i < len(l.visible); i -= dir {
		if l.rows[l.visible[i]].Kind == RowItem {
			l.cursor = i
			return
		}
	}
	l.cursor = -1
}

func (l *ListView) move(dir int) {
	for i := l.cursor + dir; i >= 0 && i < len(l.visible); i += dir {
		if l.rows[l.visible[i]].Kind == RowItem {
			l.cursor = i
			break
		}
	}
	l.scrollToCursor()
}

func (l *ListView) moveTo(vi int) {
	if len(l.visible) == 0 {
		return
	}
	vi = max(0, min(vi, len(l.visible)-1))
	dir := 1
	if vi == len(l.visible)-1 {
		dir = -1
	}
	l.seekItem(vi, dir)
	l.scrollToCursor()
}

func (l *ListView) movePage(dir int) {
	step := max(l.window()/2, 1)
	target := l.cursor + dir*step
	target = max(0, min(target, len(l.visible)-1))
	l.seekItem(target, dir)
	l.scrollToCursor()
}

func (l *ListView) scrollToCursor() {
	if l.cursor < 0 {
		l.top = 0
		return
	}
	h := l.window()
	if l.cursor < l.top {
		l.top = l.cursor
		// Pull the section header above into view when directly adjacent.
		if l.top > 0 && l.rows[l.visible[l.top-1]].Kind == RowHeader {
			l.top--
		}
	}
	if l.cursor >= l.top+h {
		l.top = l.cursor - h + 1
	}
	l.top = max(0, min(l.top, max(len(l.visible)-h, 0)))
}
