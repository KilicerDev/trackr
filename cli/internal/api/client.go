// Package api is the typed HTTP client for the trackr server's /api/v1
// surface (plus the better-auth session endpoints). It is wire-faithful: one
// method per endpoint, request/response shapes mirroring the server, and the
// untouched response body retained for --json pass-through. Anything smarter
// — display-ref resolution, org lookups, composed operations — belongs in
// internal/core. This is the only package that speaks HTTP to the server
// (internal/auth's loopback *listener* is the documented exception).
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/KilicerDev/trackr/cli/internal/auth"
)

// Sentinel errors for the two statuses commands branch on. Wrapped by
// *APIError, so errors.Is works through the chain.
var (
	ErrUnauthorized = errors.New("not logged in — run 'trackr login'")
	ErrNotFound     = errors.New("not found (or no access)")
)

// APIError is a non-2xx response, message decoded from the server's {message}.
type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("server returned %d", e.Status)
}

func (e *APIError) Unwrap() error {
	switch e.Status {
	case http.StatusUnauthorized:
		return ErrUnauthorized
	case http.StatusNotFound:
		return ErrNotFound
	}
	return nil
}

type Client struct {
	base *url.URL
	http *http.Client
}

func New(serverURL string, store auth.TokenStore) (*Client, error) {
	if serverURL == "" {
		return nil, errors.New("no server configured — run 'trackr login --server <url>' or set TRACKR_SERVER")
	}
	if !strings.Contains(serverURL, "://") {
		serverURL = "https://" + serverURL
	}
	base, err := url.Parse(strings.TrimRight(serverURL, "/"))
	if err != nil || base.Host == "" {
		return nil, fmt.Errorf("invalid server URL %q", serverURL)
	}
	return &Client{
		base: base,
		http: &http.Client{
			Timeout:   30 * time.Second,
			Transport: &authTransport{base: http.DefaultTransport, store: store},
		},
	}, nil
}

// Server returns the canonical base URL the client talks to.
func (c *Client) Server() string { return c.base.String() }

// do performs a request and returns the raw response body. Typed wrappers
// decode it; keeping the raw bytes is what makes --json an exact
// pass-through of the server response.
func (c *Client) do(ctx context.Context, method, path string, query url.Values, body any) (json.RawMessage, error) {
	u := *c.base
	u.Path = strings.TrimRight(u.Path, "/") + path
	if query != nil {
		u.RawQuery = query.Encode()
	}

	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("encode request: %w", err)
		}
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, u.String(), reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		apiErr := &APIError{Status: resp.StatusCode}
		var msg struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(data, &msg) == nil {
			apiErr.Message = msg.Message
		}
		if apiErr.Status == http.StatusNotFound && apiErr.Message == "" {
			apiErr.Message = ErrNotFound.Error()
		}
		return nil, apiErr
	}
	return json.RawMessage(data), nil
}

// get decodes a GET response into v and stashes the raw body when v embeds Raw.
func get[T any](ctx context.Context, c *Client, path string, query url.Values) (*T, error) {
	raw, err := c.do(ctx, http.MethodGet, path, query, nil)
	if err != nil {
		return nil, err
	}
	return decode[T](raw)
}

func decode[T any](raw json.RawMessage) (*T, error) {
	v := new(T)
	if err := json.Unmarshal(raw, v); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if r, ok := any(v).(rawSetter); ok {
		r.setRaw(raw)
	}
	return v, nil
}
