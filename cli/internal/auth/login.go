package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"time"
)

// loginTimeout bounds how long `trackr login` waits for the browser round
// trip. It doubles as the effective TTL of the state parameter — the server
// stays stateless about state and merely echoes it back.
const loginTimeout = 5 * time.Minute

// successPage is shown in the browser tab once the token has been delivered.
const successPage = `<!doctype html><meta charset="utf-8"><title>trackr</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1>Signed in</h1><p>You can close this tab and return to your terminal.</p></div>`

// BrowserLogin acquires a bearer token via the server's browser sign-in:
// it starts a loopback-only HTTP listener on a random port, opens
// {server}/login?client=cli&port=…&state=… in the default browser, and waits
// for the login form action to redirect the browser to
// http://127.0.0.1:<port>/callback?token=…&state=….
//
// The state parameter is generated here and compared in constant time on the
// callback, so another local process cannot inject a token into our listener.
// The token never leaves the machine: the redirect targets the loopback
// interface by construction (the server only ever accepts a port, not a URL).
//
// Progress messages go to out (the user's terminal, stderr). The returned
// token is validated and persisted by the caller.
func BrowserLogin(ctx context.Context, serverURL string, out io.Writer, noBrowser bool) (string, error) {
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return "", fmt.Errorf("start callback listener: %w", err)
	}
	defer ln.Close()
	port := ln.Addr().(*net.TCPAddr).Port

	stateBytes := make([]byte, 16)
	if _, err := rand.Read(stateBytes); err != nil {
		return "", fmt.Errorf("generate state: %w", err)
	}
	state := hex.EncodeToString(stateBytes)

	loginURL := fmt.Sprintf("%s/login?client=cli&port=%d&state=%s", serverURL, port, url.QueryEscape(state))

	tokenCh := make(chan string, 1)
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/callback" {
			http.NotFound(w, r)
			return
		}
		got := r.URL.Query().Get("state")
		token := r.URL.Query().Get("token")
		if token == "" || subtle.ConstantTimeCompare([]byte(got), []byte(state)) != 1 {
			// Wrong or replayed state: reject but keep listening for the real
			// callback — a stray request must not kill the login.
			http.Error(w, "invalid sign-in callback", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, successPage)
		select {
		case tokenCh <- token:
		default:
		}
	})}
	go func() { _ = srv.Serve(ln) }()
	defer srv.Close()

	if noBrowser || InSSHSession() {
		fmt.Fprintf(out, "Open this URL in a browser on THIS machine to sign in:\n\n  %s\n\n", loginURL)
		if InSSHSession() {
			fmt.Fprintf(out, "(You appear to be in an SSH session — the callback only works on this\nmachine. From another device, use `trackr login --token` instead.)\n\n")
		}
	} else if err := OpenURL(loginURL); err != nil {
		fmt.Fprintf(out, "Could not open a browser. Open this URL to sign in:\n\n  %s\n\n", loginURL)
	}

	fmt.Fprintln(out, "Waiting for browser sign-in… (Ctrl-C to cancel)")

	select {
	case token := <-tokenCh:
		return token, nil
	case <-ctx.Done():
		return "", errors.New("sign-in cancelled")
	case <-time.After(loginTimeout):
		return "", fmt.Errorf("sign-in timed out after %s", loginTimeout)
	}
}
