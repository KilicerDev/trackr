package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KilicerDev/trackr/services/shared/jobq"
	"github.com/KilicerDev/trackr/services/shared/jobworker"
)

// recurPath is the web endpoint that creates the tasks for due recurring
// series (web/src/routes/api/internal/recurring-tasks/run/+server.ts).
const recurPath = "/api/internal/recurring-tasks/run"

// recurTasks returns the `tasks.recur` handler, driven by a 5-minute schedule.
// Task creation (numbering, activity, webhooks, notifications, audit) lives in
// the web app, so this handler only decides whether there is anything to do
// and, if so, asks web to do it. The cheap due-check keeps idle runs from
// making an HTTP call at all.
func recurTasks(db *pgxpool.Pool, webURL string) jobworker.Handler {
	client := &http.Client{Timeout: 3 * time.Minute}
	return func(ctx context.Context, _ jobq.Job) (map[string]any, error) {
		var due bool
		if err := db.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM task_recurrence
				WHERE paused_at IS NULL AND next_run_at <= now()
			)`).Scan(&due); err != nil {
			return nil, fmt.Errorf("check due series: %w", err)
		}
		if !due {
			return map[string]any{"due": false}, nil
		}
		if webURL == "" {
			return map[string]any{"skipped": "WEB_URL is not set"}, nil
		}

		var secret string
		err := db.QueryRow(ctx, `SELECT value FROM internal_secret WHERE name = 'worker'`).Scan(&secret)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("internal_secret 'worker' missing (migrations not applied?)")
		}
		if err != nil {
			return nil, fmt.Errorf("load worker secret: %w", err)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, webURL+recurPath, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+secret)
		req.Header.Set("Accept", "application/json")
		res, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("call web: %w", err)
		}
		defer res.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(res.Body, 64<<10))
		if res.StatusCode != http.StatusOK {
			// Non-2xx retries with backoff; the series stay due until web
			// answers, and the schedule's dedupe key stops runs piling up.
			return nil, fmt.Errorf("web answered %d: %.200s", res.StatusCode, body)
		}
		result := map[string]any{}
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("decode web response: %w", err)
		}
		return result, nil
	}
}
