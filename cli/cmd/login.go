package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/auth"
)

var (
	flagNoBrowser bool
	flagToken     bool
)

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Sign in to a trackr server",
	Long: "Sign in via the browser: trackr opens the server's login page and\n" +
		"receives the session token on a loopback callback. The token is stored\n" +
		"in the OS keychain. Use --token to paste a token manually instead\n" +
		"(e.g. over SSH), and --no-browser to print the URL without opening it.",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := loadConfig()
		if err != nil {
			return err
		}
		server := cfg.Server
		if server == "" {
			server, err = promptServer(cmd)
			if err != nil {
				return err
			}
			cfg.Server = strings.TrimRight(server, "/")
		}

		store, err := auth.NewStore(cfg)
		if err != nil {
			return err
		}
		client, err := api.New(cfg.Server, store)
		if err != nil {
			return err
		}
		ctx := cmd.Context()

		// Probe before touching a browser: fail fast on typos and non-trackr
		// hosts.
		inst, err := client.Instance(ctx)
		if err != nil {
			return fmt.Errorf("%s is not reachable as a trackr server: %w", cfg.Server, err)
		}
		if inst.Name != "trackr" {
			return fmt.Errorf("%s does not look like a trackr server", cfg.Server)
		}

		var token string
		if flagToken {
			token, err = promptToken(cmd)
		} else {
			token, err = auth.BrowserLogin(ctx, cfg.Server, cmd.ErrOrStderr(), flagNoBrowser)
		}
		if err != nil {
			return err
		}

		if err := store.Save(token); err != nil {
			return err
		}
		// Validate before declaring success; get-session returns 200+null for
		// a dead token, which ValidateSession maps to ErrUnauthorized.
		if err := client.ValidateSession(ctx); err != nil {
			_ = store.Clear()
			return fmt.Errorf("the received token is not valid: %w", err)
		}
		me, err := client.Me(ctx)
		if err != nil {
			_ = store.Clear()
			return err
		}

		// Persist the chosen server for future commands.
		if err := cfg.Save(); err != nil {
			return err
		}

		fmt.Fprintf(cmd.OutOrStdout(), "Logged in as %s <%s> (%s)\n", me.User.Name, me.User.Email, cfg.Server)
		return nil
	},
}

func promptServer(cmd *cobra.Command) (string, error) {
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return "", usagef("no server configured — pass --server <url> or set TRACKR_SERVER")
	}
	fmt.Fprint(cmd.ErrOrStderr(), "trackr server URL: ")
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil {
		return "", fmt.Errorf("read server URL: %w", err)
	}
	server := strings.TrimSpace(line)
	if server == "" {
		return "", usagef("no server URL given")
	}
	if !strings.Contains(server, "://") {
		server = "https://" + server
	}
	return server, nil
}

// promptToken reads a bearer token: hidden on a TTY, one line from stdin
// when piped (so `pbpaste | trackr login --token` works).
func promptToken(cmd *cobra.Command) (string, error) {
	if term.IsTerminal(int(os.Stdin.Fd())) {
		fmt.Fprint(cmd.ErrOrStderr(), "Paste bearer token (input hidden): ")
		b, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(cmd.ErrOrStderr())
		if err != nil {
			return "", fmt.Errorf("read token: %w", err)
		}
		if len(b) == 0 {
			return "", usagef("no token given")
		}
		return strings.TrimSpace(string(b)), nil
	}
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && line == "" {
		return "", fmt.Errorf("read token from stdin: %w", err)
	}
	token := strings.TrimSpace(line)
	if token == "" {
		return "", usagef("no token on stdin")
	}
	return token, nil
}

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Sign out and forget the stored token",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		d, err := newDeps()
		if err != nil {
			return err
		}
		// Best effort: revoke server-side, but a dead network must not stop
		// the local credential from being cleared.
		if err := d.client.SignOut(cmd.Context()); err != nil {
			fmt.Fprintf(cmd.ErrOrStderr(), "trackr: could not revoke server session (%v) — clearing local token anyway\n", err)
		}
		if err := d.store.Clear(); err != nil {
			return err
		}
		fmt.Fprintln(cmd.OutOrStdout(), "Logged out")
		return nil
	},
}

func init() {
	loginCmd.Flags().BoolVar(&flagNoBrowser, "no-browser", false, "print the sign-in URL instead of opening a browser")
	loginCmd.Flags().BoolVar(&flagToken, "token", false, "paste a bearer token manually instead of using the browser")
	rootCmd.AddCommand(loginCmd, logoutCmd)
}
