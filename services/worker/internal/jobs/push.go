package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KilicerDev/trackr/services/shared/jobq"
	"github.com/KilicerDev/trackr/services/shared/jobworker"
	"github.com/KilicerDev/trackr/services/worker/internal/push"
)

// pushPayload mirrors PushPayload in web/src/lib/server/jobs/services/push.ts.
type pushPayload struct {
	UserID string  `json:"userId"`
	Title  string  `json:"title"`
	Body   *string `json:"body"`
	URL    string  `json:"url"`
}

// sendPush returns the `push.send` handler: resolve the user's registered
// device tokens at send time (so tokens registered after enqueue still get
// the push) and deliver to each. Tokens APNs reports dead are deleted.
//
// A nil client (APNs env not configured) acks jobs as skipped instead of
// failing them — the web enqueues behind PUSH_ENABLED, but the two flags can
// legitimately drift during rollout.
func sendPush(db *pgxpool.Pool, apns *push.Client) jobworker.Handler {
	return func(ctx context.Context, job jobq.Job) (map[string]any, error) {
		var p pushPayload
		if err := json.Unmarshal(job.Payload, &p); err != nil {
			return nil, fmt.Errorf("invalid payload: %w", err)
		}
		if p.UserID == "" {
			return nil, fmt.Errorf("push.send: missing userId")
		}
		if apns == nil {
			return map[string]any{"skipped": "apns not configured"}, nil
		}

		rows, err := db.Query(ctx,
			`SELECT token FROM push_token WHERE user_id = $1 AND platform = 'ios'`, p.UserID)
		if err != nil {
			return nil, fmt.Errorf("push.send: loading tokens: %w", err)
		}
		var tokens []string
		for rows.Next() {
			var t string
			if err := rows.Scan(&t); err != nil {
				rows.Close()
				return nil, err
			}
			tokens = append(tokens, t)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		if len(tokens) == 0 {
			return map[string]any{"sent": 0}, nil
		}

		body := ""
		if p.Body != nil {
			body = *p.Body
		}

		sent, dropped := 0, 0
		var lastErr error
		for _, token := range tokens {
			err := apns.Send(ctx, push.Notification{
				DeviceToken: token,
				Title:       p.Title,
				Body:        body,
				URL:         p.URL,
			})
			switch {
			case err == nil:
				sent++
			case errors.As(err, &push.ErrUnregistered{}):
				// The device uninstalled the app or invalidated its token.
				if _, delErr := db.Exec(ctx,
					`DELETE FROM push_token WHERE token = $1`, token); delErr != nil {
					slog.Warn("push.send: deleting dead token failed", "error", delErr)
				}
				dropped++
			default:
				lastErr = err
			}
		}

		// Partial failure: report the transient error so the engine retries;
		// already-delivered devices getting a duplicate is acceptable.
		if sent == 0 && lastErr != nil {
			return nil, lastErr
		}
		return map[string]any{"sent": sent, "droppedTokens": dropped}, nil
	}
}
