package components

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
)

// Confirm is a yes/no modal. Enter or y runs onYes and closes; esc or
// n closes without action.
type Confirm struct {
	title  string
	prompt string
	danger bool
	onYes  tea.Cmd
}

func NewConfirm(title, prompt string, danger bool, onYes tea.Cmd) *Confirm {
	return &Confirm{title: title, prompt: prompt, danger: danger, onYes: onYes}
}

func (c *Confirm) Update(msg tea.Msg) (Modal, tea.Cmd) {
	key, ok := msg.(tea.KeyPressMsg)
	if !ok {
		return c, nil
	}
	switch key.String() {
	case "y", "enter":
		return nil, c.onYes
	case "n", "esc", "q":
		return nil, nil
	}
	return c, nil
}

func (c *Confirm) View(width, height int) string {
	w := min(48, width-4)
	prompt := lipgloss.NewStyle().Width(w - 4).Foreground(theme.Text2).Render(c.prompt)
	yes := "enter/y: confirm"
	if c.danger {
		yes = theme.DangerStyle.Render(yes)
	} else {
		yes = theme.DimStyle.Render(yes)
	}
	hints := yes + theme.FaintStyle.Render("  ·  esc/n: cancel")
	body := " " + strings.ReplaceAll(prompt, "\n", "\n ") + "\n\n " + hints
	h := lipgloss.Height(body) + 2
	return Pane(c.title, true, w, h, body)
}
