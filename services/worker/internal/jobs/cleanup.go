package jobs

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KilicerDev/trackr/services/shared/jobq"
	"github.com/KilicerDev/trackr/services/shared/jobworker"
)

// pruneInvitations returns the `prune.invitations` handler. It deletes
// invitations that are done — accepted, or past their expiry — and have been
// untouched for more than olderThanDays, so the table doesn't accumulate dead
// tokens. Pending, still-valid invitations are never touched. (Reuses
// prunePayload from prune.go — same package.)
func pruneInvitations(db *pgxpool.Pool) jobworker.Handler {
	return func(ctx context.Context, job jobq.Job) (map[string]any, error) {
		var p prunePayload
		if err := json.Unmarshal(job.Payload, &p); err != nil {
			return nil, fmt.Errorf("invalid payload: %w", err)
		}
		if p.OlderThanDays <= 0 {
			return nil, fmt.Errorf("olderThanDays must be > 0, got %d", p.OlderThanDays)
		}

		tag, err := db.Exec(ctx, `
			DELETE FROM invitation
			WHERE (accepted_at IS NOT NULL OR expires_at < now())
				AND updated_at < now() - make_interval(days => $1)`, p.OlderThanDays)
		if err != nil {
			return nil, err
		}

		return map[string]any{"deleted": tag.RowsAffected()}, nil
	}
}

// pruneNotifications returns the `prune.notifications` handler. It deletes read
// in-app notifications older than olderThanDays, keeping the inbox table
// bounded. Unread notifications are always kept.
func pruneNotifications(db *pgxpool.Pool) jobworker.Handler {
	return func(ctx context.Context, job jobq.Job) (map[string]any, error) {
		var p prunePayload
		if err := json.Unmarshal(job.Payload, &p); err != nil {
			return nil, fmt.Errorf("invalid payload: %w", err)
		}
		if p.OlderThanDays <= 0 {
			return nil, fmt.Errorf("olderThanDays must be > 0, got %d", p.OlderThanDays)
		}

		tag, err := db.Exec(ctx, `
			DELETE FROM notification
			WHERE read_at IS NOT NULL
				AND read_at < now() - make_interval(days => $1)`, p.OlderThanDays)
		if err != nil {
			return nil, err
		}

		return map[string]any{"deleted": tag.RowsAffected()}, nil
	}
}
