package api

import (
	"log/slog"
	"net/http"
	"sync"

	"github.com/KilicerDev/trackr/cli/internal/auth"
)

// authTransport injects the bearer credential and adopts rotated tokens.
// better-auth may attach a replacement token in a `set-auth-token` header on
// ANY response (sessions have a 7-day sliding expiry); persisting it
// immediately is what keeps the CLI logged in indefinitely under regular use.
//
// No cookies are ever sent: better-auth's origin check rejects replayed
// session cookies from non-browser clients (the iOS app disables cookies for
// the same reason), so the http.Client deliberately has no cookie jar.
type authTransport struct {
	base  http.RoundTripper
	store auth.TokenStore
	mu    sync.Mutex
}

func (t *authTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// RoundTrippers must not mutate the caller's request.
	req = req.Clone(req.Context())

	cur, err := t.store.Token()
	if err == nil && cur != "" {
		req.Header.Set("Authorization", "Bearer "+cur)
	}

	resp, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}

	if rotated := resp.Header.Get("set-auth-token"); rotated != "" && rotated != cur {
		t.mu.Lock()
		if saveErr := t.store.Save(rotated); saveErr != nil {
			// A failed persist must not fail the request; the old token is
			// still valid for now. Surface it for debugging only.
			slog.Debug("failed to persist rotated token", "error", saveErr)
		} else {
			slog.Debug("adopted rotated session token")
		}
		t.mu.Unlock()
	}
	return resp, nil
}
