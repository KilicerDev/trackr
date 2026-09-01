package api

import (
	"bytes"
	"context"
	"net/http"
)

// Instance probes GET /api/v1/instance (unauthenticated). Callers must check
// Name == "trackr" before treating the host as a trackr server.
func (c *Client) Instance(ctx context.Context) (*Instance, error) {
	return get[Instance](ctx, c, "/api/v1/instance", nil)
}

// Me is the session bootstrap: identity, capabilities, orgs, unread badge.
// A 401 here means the stored token is dead.
func (c *Client) Me(ctx context.Context) (*Me, error) {
	return get[Me](ctx, c, "/api/v1/me", nil)
}

// ValidateSession checks the stored token against the better-auth session
// endpoint. Quirk: a dead token yields 200 with a literal `null` body — not
// a 401 — so both signals map to ErrUnauthorized here.
func (c *Client) ValidateSession(ctx context.Context) error {
	raw, err := c.do(ctx, http.MethodGet, "/api/auth/get-session", nil, nil)
	if err != nil {
		return err
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return &APIError{Status: http.StatusUnauthorized, Message: ErrUnauthorized.Error()}
	}
	return nil
}

// SignOut revokes the server-side session (POST /api/auth/sign-out).
func (c *Client) SignOut(ctx context.Context) error {
	_, err := c.do(ctx, http.MethodPost, "/api/auth/sign-out", nil, struct{}{})
	return err
}

// send performs a POST/PATCH/DELETE with a JSON body and decodes the response.
func send[T any](ctx context.Context, c *Client, method, path string, body any) (*T, error) {
	raw, err := c.do(ctx, method, path, nil, body)
	if err != nil {
		return nil, err
	}
	return decode[T](raw)
}
