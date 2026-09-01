// Package cmd defines the trackr command tree. Commands are thin: they parse
// flags, call into internal/core (or internal/auth for session commands), and
// render results via internal/output. No business logic lives here — the
// future TUI must be able to do everything commands can by calling the same
// core functions.
//
// Exit codes: 0 success · 1 generic/API/network error · 2 usage error (cobra)
// · 3 auth required (no/dead token, any 401) · 4 not found (which may also
// mean no access — the server deliberately conflates the two).
package cmd

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/KilicerDev/trackr/cli/internal/config"
	"github.com/KilicerDev/trackr/cli/internal/tui"
)

var (
	flagServer  string
	flagVerbose bool
)

var rootCmd = &cobra.Command{
	Use:   "trackr",
	Short: "trackr from the command line",
	Long: "trackr from the command line.\n\n" +
		"Run a subcommand for quick, scriptable actions, or run bare `trackr`\n" +
		"in a terminal to open the full-screen TUI.",
	SilenceUsage:  true,
	SilenceErrors: true,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		level := slog.LevelWarn
		if flagVerbose || os.Getenv("TRACKR_LOG") == "debug" {
			level = slog.LevelDebug
		}
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level}))
		slog.SetDefault(logger)
	},
	RunE: func(cmd *cobra.Command, args []string) error {
		// Piped or scripted invocations keep printing help; the TUI is
		// only for real terminals.
		if !term.IsTerminal(int(os.Stdin.Fd())) || !term.IsTerminal(int(os.Stdout.Fd())) {
			return cmd.Help()
		}
		d, err := newDeps()
		if err != nil {
			return err
		}
		// Fail auth before entering the alternate screen so the user
		// gets a plain, copyable error message.
		if _, err := d.store.Token(); err != nil {
			return fmt.Errorf("%w — run 'trackr login' first", err)
		}
		if err := d.client.ValidateSession(cmd.Context()); err != nil {
			return err
		}
		debug := flagVerbose || os.Getenv("TRACKR_LOG") == "debug"
		return tui.Run(cmd.Context(), d.cfg, d.service, debug)
	},
}

func init() {
	rootCmd.PersistentFlags().StringVar(&flagServer, "server", "", "trackr server URL (overrides TRACKR_SERVER and the config file)")
	rootCmd.PersistentFlags().BoolVar(&flagVerbose, "verbose", false, "enable debug logging on stderr")
}

// Execute runs the command tree and maps the outcome to a process exit code.
// Ctrl-C cancels the command context (long waits like `login` return cleanly).
func Execute() int {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if err := rootCmd.ExecuteContext(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "trackr: %v\n", err)
		return exitCodeFor(err)
	}
	return 0
}

// loadConfig resolves configuration with flag overrides applied.
func loadConfig() (*config.Config, error) {
	return config.Load(config.Overrides{Server: flagServer})
}
