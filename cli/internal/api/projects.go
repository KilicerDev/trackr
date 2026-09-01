package api

import (
	"context"
	"net/url"
)

func (c *Client) ListProjects(ctx context.Context) (*ProjectList, error) {
	return get[ProjectList](ctx, c, "/api/v1/projects", nil)
}

func (c *Client) GetProject(ctx context.Context, id string) (*Project, error) {
	return get[Project](ctx, c, "/api/v1/projects/"+url.PathEscape(id), nil)
}
