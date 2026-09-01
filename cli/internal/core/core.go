// Package core implements trackr operations exactly once, independent of any
// frontend. Quick commands (cmd/) and the future TUI are both thin
// consumers: they parse input, call a Service method, and render the
// returned value. Nothing here prints, prompts, or knows about flags — that
// separation is what lets the TUI reuse every operation unchanged.
//
// core is also where user-facing references become API identifiers: display
// refs like "PRJ-12"/"ACME-7" resolve to UUIDs, org slugs resolve to org
// ids. The wire-faithful HTTP calls themselves live in internal/api.
package core

import (
	"context"

	"github.com/KilicerDev/trackr/cli/internal/api"
)

type Service struct {
	api *api.Client
}

func New(c *api.Client) *Service {
	return &Service{api: c}
}

// API exposes the underlying client for callers that need raw endpoint
// access (e.g. whoami rendering Me directly).
func (s *Service) API() *api.Client { return s.api }

func (s *Service) Me(ctx context.Context) (*api.Me, error) {
	return s.api.Me(ctx)
}

func (s *Service) ListProjects(ctx context.Context) (*api.ProjectList, error) {
	return s.api.ListProjects(ctx)
}

func (s *Service) Inbox(ctx context.Context, unreadOnly bool, limit int, cursor string) (*api.InboxPage, error) {
	return s.api.Inbox(ctx, unreadOnly, limit, cursor)
}

func (s *Service) MarkInboxRead(ctx context.Context, id string, all bool) error {
	return s.api.MarkInboxRead(ctx, id, all)
}

func (s *Service) Search(ctx context.Context, query string) (*api.SearchResults, error) {
	return s.api.Search(ctx, query)
}
