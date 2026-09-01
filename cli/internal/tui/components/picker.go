package components

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
)

// PickerOption is one row in a single-select popup.
type PickerOption struct {
	Value string
	Glyph string // pre-styled glyph (may be empty)
	Label string
}

// Picker is a small single-select modal (status, priority, segment…).
// Enter runs onPick with the selected value and closes.
type Picker struct {
	title   string
	options []PickerOption
	cursor  int
	onPick  func(value string) tea.Cmd
}

// NewPicker builds a picker with the cursor preset to current (when it
// matches an option value).
func NewPicker(title string, options []PickerOption, current string, onPick func(value string) tea.Cmd) *Picker {
	p := &Picker{title: title, options: options, onPick: onPick}
	for i, o := range options {
		if o.Value == current {
			p.cursor = i
			break
		}
	}
	return p
}

func (p *Picker) Update(msg tea.Msg) (Modal, tea.Cmd) {
	key, ok := msg.(tea.KeyPressMsg)
	if !ok {
		return p, nil
	}
	switch key.String() {
	case "esc", "q":
		return nil, nil
	case "j", "down":
		if p.cursor < len(p.options)-1 {
			p.cursor++
		}
	case "k", "up":
		if p.cursor > 0 {
			p.cursor--
		}
	case "g":
		p.cursor = 0
	case "G":
		p.cursor = len(p.options) - 1
	case "enter":
		cmd := p.onPick(p.options[p.cursor].Value)
		return nil, cmd
	}
	return p, nil
}

func (p *Picker) View(width, height int) string {
	w := min(34, width-4)
	var b strings.Builder
	for i, o := range p.options {
		marker := "  "
		label := theme.MutedStyle.Render(o.Label)
		if i == p.cursor {
			marker = theme.AccentStyle.Render("▸ ")
			label = theme.TitleStyle.Render(o.Label)
		}
		row := marker
		if o.Glyph != "" {
			row += o.Glyph + " "
		}
		row += label
		b.WriteString(row)
		if i < len(p.options)-1 {
			b.WriteString("\n")
		}
	}
	body := b.String()
	h := lipgloss.Height(body) + 2
	return Pane(p.title, true, w, h, body)
}
