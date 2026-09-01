package components

import (
	"strings"

	"charm.land/bubbles/v2/textarea"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
)

// Composer wraps a textarea as the message/comment input at the bottom
// of a detail page. The parent view decides what "send" means; the
// composer owns focus state, sizing, and the internal-note tone.
type Composer struct {
	ta       textarea.Model
	internal bool // internal-note tone (yellow chrome)
	width    int
}

func NewComposer(placeholder string) Composer {
	ta := textarea.New()
	ta.Placeholder = placeholder
	ta.Prompt = ""
	ta.ShowLineNumbers = false
	ta.DynamicHeight = true
	ta.MinHeight = 1
	ta.MaxHeight = 6
	ta.CharLimit = 0
	ta.SetStyles(textarea.DefaultDarkStyles())
	return Composer{ta: ta}
}

func (c *Composer) SetWidth(w int) {
	c.width = w
	c.ta.SetWidth(max(w-2, 8)) // inside the border
}

func (c *Composer) Focus() tea.Cmd { return c.ta.Focus() }
func (c *Composer) Blur()          { c.ta.Blur() }
func (c *Composer) Focused() bool  { return c.ta.Focused() }

func (c *Composer) SetPlaceholder(s string) { c.ta.Placeholder = s }

func (c *Composer) Value() string { return strings.TrimSpace(c.ta.Value()) }
func (c *Composer) Dirty() bool   { return c.Value() != "" }
func (c *Composer) Reset()        { c.ta.Reset() }

// Internal reports / SetInternal arms the internal-note tone.
func (c *Composer) Internal() bool       { return c.internal }
func (c *Composer) SetInternal(on bool)  { c.internal = on }
func (c *Composer) ToggleInternal() bool { c.internal = !c.internal; return c.internal }

func (c *Composer) Update(msg tea.Msg) tea.Cmd {
	var cmd tea.Cmd
	c.ta, cmd = c.ta.Update(msg)
	return cmd
}

// Height reports the total rendered height including the border.
func (c *Composer) Height() int { return c.ta.Height() + 2 }

func (c *Composer) View() string {
	borderColor := theme.Border
	if c.internal {
		borderColor = theme.Internal
	} else if c.Focused() {
		borderColor = theme.Accent
	}
	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderColor).
		Width(c.width - 2)
	return box.Render(c.ta.View())
}
