// Package tui is the full-screen terminal UI, launched by bare
// `trackr`. It consumes internal/core like the quick commands do; the
// app root model lives in app.go, reusable widgets in components/,
// screens in views/, and design tokens in theme/.
package tui

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"

	tea "charm.land/bubbletea/v2"

	"github.com/KilicerDev/trackr/cli/internal/config"
	"github.com/KilicerDev/trackr/cli/internal/core"
)

// Run starts the TUI and blocks until it exits. The returned error is
// nil on a normal quit; otherwise it flows through cmd's exit-code
// mapping (a dead session surfaces api.ErrUnauthorized → exit 3).
//
// While the alternate screen is active any stderr logging would
// corrupt the display, so the default slog logger is swapped out for
// the duration: discarded normally, or written to a file when debug
// logging is on.
func Run(ctx context.Context, cfg *config.Config, svc *core.Service, debug bool) error {
	restore := silenceLogs(debug)
	defer restore()

	app := newApp(ctx, cfg, svcAdapter{svc})
	p := tea.NewProgram(app, tea.WithContext(ctx))
	final, err := p.Run()
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return nil // interrupted (SIGINT/SIGTERM): a clean exit
		}
		return fmt.Errorf("tui: %w", err)
	}
	if a, ok := final.(*App); ok && a.fatalErr != nil {
		return a.fatalErr
	}
	return nil
}

func silenceLogs(debug bool) (restore func()) {
	prev := slog.Default()
	if !debug {
		slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))
		return func() { slog.SetDefault(prev) }
	}
	path := filepath.Join(os.TempDir(), "trackr-tui.log")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))
		return func() { slog.SetDefault(prev) }
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(f, &slog.HandlerOptions{Level: slog.LevelDebug})))
	return func() {
		slog.SetDefault(prev)
		f.Close()
		fmt.Fprintf(os.Stderr, "debug log: %s\n", path)
	}
}
