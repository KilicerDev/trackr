package components

import (
	"time"

	"charm.land/bubbles/v2/spinner"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/KilicerDev/trackr/cli/internal/tui/theme"
	"github.com/KilicerDev/trackr/cli/internal/tui/ui"
)

// flashExpiredMsg clears a flash; the id guards against a newer flash
// being clobbered by an older timer.
type flashExpiredMsg struct{ id int }

const flashDuration = 3 * time.Second

// StatusBar is the single-row bar at the bottom of the workspace:
// identity on the left, transient flash in the middle, contextual key
// hints on the right, and a spinner while any fetch is in flight.
type StatusBar struct {
	Identity string // "nick · trackr.example.com"
	Hints    string // pre-rendered short help for the focused context

	spinner  spinner.Model
	busy     int // count of in-flight operations
	flash    string
	flashLvl ui.FlashLevel
	flashID  int
}

func NewStatusBar() StatusBar {
	sp := spinner.New(spinner.WithSpinner(spinner.MiniDot))
	sp.Style = theme.AccentStyle
	return StatusBar{spinner: sp}
}

// Busy tracks in-flight async work; delta is +1 on fetch start, -1 on
// completion. The spinner shows while the count is positive.
func (s *StatusBar) Busy(delta int) tea.Cmd {
	wasIdle := s.busy <= 0
	s.busy += delta
	if s.busy < 0 {
		s.busy = 0
	}
	if wasIdle && s.busy > 0 {
		return s.spinner.Tick
	}
	return nil
}

func (s *StatusBar) Update(msg tea.Msg) tea.Cmd {
	switch msg := msg.(type) {
	case ui.FlashMsg:
		s.flash = msg.Text
		s.flashLvl = msg.Level
		s.flashID++
		id := s.flashID
		return tea.Tick(flashDuration, func(time.Time) tea.Msg { return flashExpiredMsg{id: id} })
	case flashExpiredMsg:
		if msg.id == s.flashID {
			s.flash = ""
		}
	case spinner.TickMsg:
		if s.busy > 0 {
			var cmd tea.Cmd
			s.spinner, cmd = s.spinner.Update(msg)
			return cmd
		}
	}
	return nil
}

func (s *StatusBar) View(width int) string {
	left := " " + theme.DimStyle.Render(ui.Truncate(s.Identity, width/3))
	if s.busy > 0 {
		left += " " + s.spinner.View()
	}

	mid := ""
	if s.flash != "" {
		st := theme.DimStyle
		switch s.flashLvl {
		case ui.FlashSuccess:
			st = lipgloss.NewStyle().Foreground(theme.Success)
		case ui.FlashError:
			st = theme.DangerStyle
		}
		mid = st.Render(ui.Truncate(s.flash, width/2))
	}

	right := s.Hints + " "

	used := ansi.StringWidth(left) + ansi.StringWidth(mid) + ansi.StringWidth(right)
	gap := width - used
	if gap < 2 {
		// Drop hints first, then the flash, to fit.
		right = " "
		gap = width - ansi.StringWidth(left) - ansi.StringWidth(mid) - 1
		if gap < 2 {
			mid = ""
			gap = width - ansi.StringWidth(left) - 1
		}
	}
	lgap := gap / 2
	rgap := gap - lgap
	if lgap < 0 {
		lgap, rgap = 0, 0
	}
	return left + pad(lgap) + mid + pad(rgap) + right
}

func pad(n int) string {
	if n <= 0 {
		return ""
	}
	b := make([]byte, n)
	for i := range b {
		b[i] = ' '
	}
	return string(b)
}
