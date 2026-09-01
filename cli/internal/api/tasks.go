package api

import (
	"context"
	"net/http"
	"net/url"
)

// ListTasks fetches GET /api/v1/tasks. scope is "mine" (assigned to or
// created by the caller — the server default) or "all". The endpoint has no
// other filters and no pagination; it returns every accessible task.
func (c *Client) ListTasks(ctx context.Context, scope string) (*TaskList, error) {
	q := url.Values{}
	if scope != "" {
		q.Set("scope", scope)
	}
	return get[TaskList](ctx, c, "/api/v1/tasks", q)
}

func (c *Client) CreateTask(ctx context.Context, in CreateTaskRequest) (*Created, error) {
	return send[Created](ctx, c, http.MethodPost, "/api/v1/tasks", in)
}

// GetTask takes the task UUID (never the "PRJ-12" display ref — resolution
// lives in core).
func (c *Client) GetTask(ctx context.Context, uuid string) (*TaskDetail, error) {
	return get[TaskDetail](ctx, c, "/api/v1/tasks/"+url.PathEscape(uuid), nil)
}

func (c *Client) PatchTask(ctx context.Context, uuid string, patch TaskPatch) error {
	_, err := send[OK](ctx, c, http.MethodPatch, "/api/v1/tasks/"+url.PathEscape(uuid), patch)
	return err
}

func (c *Client) DeleteTask(ctx context.Context, uuid string) error {
	_, err := c.do(ctx, http.MethodDelete, "/api/v1/tasks/"+url.PathEscape(uuid), nil, nil)
	return err
}

func (c *Client) AddTaskComment(ctx context.Context, uuid, body string) error {
	_, err := c.do(ctx, http.MethodPost, "/api/v1/tasks/"+url.PathEscape(uuid)+"/comments",
		nil, map[string]string{"body": body})
	return err
}

// LogTaskTime records a time entry. date is "YYYY-MM-DD".
func (c *Client) LogTaskTime(ctx context.Context, uuid string, minutes int, date, note string) error {
	payload := map[string]any{"minutes": minutes, "date": date}
	if note != "" {
		payload["note"] = note
	}
	_, err := c.do(ctx, http.MethodPost, "/api/v1/tasks/"+url.PathEscape(uuid)+"/time", nil, payload)
	return err
}
