package api

import (
	"context"
	"net/url"
)

// Search runs the global search (min 2 characters; shorter queries return an
// empty result server-side). Results are permission-scoped, max 10 per type.
func (c *Client) Search(ctx context.Context, query string) (*SearchResults, error) {
	q := url.Values{}
	q.Set("q", query)
	return get[SearchResults](ctx, c, "/api/v1/search", q)
}
