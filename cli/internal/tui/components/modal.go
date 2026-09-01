package components

import (
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

// Modal is an overlay that owns all input while open. Update returns
// the (possibly replaced) modal, or nil to close it.
type Modal interface {
	Update(msg tea.Msg) (Modal, tea.Cmd)
	// View renders the complete modal box for the given workspace size;
	// the app centers whatever comes back.
	View(width, height int) string
}

// ShowModalMsg asks the app root to open a modal overlay.
type ShowModalMsg struct{ Modal Modal }

// ShowModal builds a command that opens the given modal.
func ShowModal(m Modal) tea.Cmd {
	return func() tea.Msg { return ShowModalMsg{Modal: m} }
}

// Overlay composites the modal box centered over the workspace using a
// lipgloss canvas, so the workspace stays visible around it.
func Overlay(workspace, box string, width, height int) string {
	bw, bh := lipgloss.Width(box), lipgloss.Height(box)
	x := max((width-bw)/2, 0)
	y := max((height-bh)/2, 0)
	canvas := lipgloss.NewCanvas(width, height)
	canvas.Compose(lipgloss.NewLayer(workspace))
	canvas.Compose(lipgloss.NewLayer(box).X(x).Y(y).Z(1))
	return canvas.Render()
}

// ModalWidth picks the standard modal width for a workspace width.
func ModalWidth(workspace int) int {
	return min(workspace-8, 72)
}
