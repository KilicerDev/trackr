package api

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
)

// Inbox fetches one page of notifications. The only cursor-paginated
// endpoint: pass the previous page's NextCursor to continue. limit is
// clamped server-side to 1..100 (default 30).
func (c *Client) Inbox(ctx context.Context, unreadOnly bool, limit int, cursor string) (*InboxPage, error) {
	q := url.Values{}
	if unreadOnly {
		q.Set("filter", "unread")
	}
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	if cursor != "" {
		q.Set("cursor", cursor)
	}
	return get[InboxPage](ctx, c, "/api/v1/inbox", q)
}

func (c *Client) InboxBadge(ctx context.Context) (int, error) {
	type badge struct {
		Unread int `json:"unread"`
	}
	b, err := get[badge](ctx, c, "/api/v1/inbox/badge", nil)
	if err != nil {
		return 0, err
	}
	return b.Unread, nil
}

// MarkInboxRead marks one notification (by id) or everything (all=true).
func (c *Client) MarkInboxRead(ctx context.Context, id string, all bool) error {
	var payload any
	if all {
		payload = map[string]bool{"all": true}
	} else {
		payload = map[string]string{"id": id}
	}
	_, err := c.do(ctx, http.MethodPost, "/api/v1/inbox/read", nil, payload)
	return err
}
