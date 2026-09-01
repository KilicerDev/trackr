package api

import (
	"context"
	"net/http"
	"net/url"
)

// ListTickets fetches GET /api/v1/tickets. segment is "mine" (server
// default), "watched", or "all"; status optionally narrows to one ticket
// status. Sorted by last activity, unpaginated.
func (c *Client) ListTickets(ctx context.Context, segment, status string) (*TicketList, error) {
	q := url.Values{}
	if segment != "" {
		q.Set("segment", segment)
	}
	if status != "" {
		q.Set("status", status)
	}
	return get[TicketList](ctx, c, "/api/v1/tickets", q)
}

// CreateTicket posts a new ticket. The server forces priority "medium",
// category "general", channel "api" on API-created tickets.
func (c *Client) CreateTicket(ctx context.Context, in CreateTicketRequest) (*Created, error) {
	return send[Created](ctx, c, http.MethodPost, "/api/v1/tickets", in)
}

func (c *Client) GetTicket(ctx context.Context, id string) (*TicketDetail, error) {
	return get[TicketDetail](ctx, c, "/api/v1/tickets/"+url.PathEscape(id), nil)
}

func (c *Client) PatchTicket(ctx context.Context, id string, patch TicketPatch) error {
	_, err := send[OK](ctx, c, http.MethodPatch, "/api/v1/tickets/"+url.PathEscape(id), patch)
	return err
}

// AddTicketMessage posts to the ticket timeline; internal marks a staff-only
// internal note.
func (c *Client) AddTicketMessage(ctx context.Context, id, body string, internal bool) error {
	payload := map[string]any{"body": body}
	if internal {
		payload["internal"] = true
	}
	_, err := c.do(ctx, http.MethodPost, "/api/v1/tickets/"+url.PathEscape(id)+"/messages", nil, payload)
	return err
}
