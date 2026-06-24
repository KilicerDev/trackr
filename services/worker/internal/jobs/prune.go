package jobs

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KilicerDev/trackr/services/shared/jobq"
	"github.com/KilicerDev/trackr/services/shared/jobworker"
)

type prunePayload struct {
	OlderThanDays int `json:"olderThanDays"`
}

// pruneJobs returns the `system.prune-jobs` handler bound to the DB. It deletes
// terminal jobs that finished more than olderThanDays ago, keeping the queue
// table bounded. Schedule it via a row in `schedules` (see services/README.md).
// The running prune job is not terminal, so it never deletes itself.
func pruneJobs(db *pgxpool.Pool) jobworker.Handler {
	return func(ctx context.Context, job jobq.Job) (map[string]any, error) {
		var p prunePayload
		if err := json.Unmarshal(job.Payload, &p); err != nil {
			return nil, fmt.Errorf("invalid payload: %w", err)
		}
		if p.OlderThanDays <= 0 {
			return nil, fmt.Errorf("olderThanDays must be > 0, got %d", p.OlderThanDays)
		}

		tag, err := db.Exec(ctx, `
			DELETE FROM jobs
			WHERE status IN ('succeeded', 'failed', 'cancelled')
				AND finished_at IS NOT NULL
				AND finished_at < now() - make_interval(days => $1)`, p.OlderThanDays)
		if err != nil {
			return nil, err
		}

		return map[string]any{"deleted": tag.RowsAffected()}, nil
	}
}
