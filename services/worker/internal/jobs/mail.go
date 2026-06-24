package jobs

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/KilicerDev/trackr/services/shared/jobq"
	"github.com/KilicerDev/trackr/services/shared/jobworker"
	"github.com/KilicerDev/trackr/services/worker/internal/mail"
)

// sendMail returns the `mail.send` handler bound to a mailer. Fan-out (e.g.
// notifying 100 users) is one mail.send job per recipient, so each retries
// independently; priority lets transactional mail jump ahead of bulk. The email
// is already rendered by /web; this just transmits it.
func sendMail(mailer mail.Sender) jobworker.Handler {
	return func(ctx context.Context, job jobq.Job) (map[string]any, error) {
		var m mail.Message
		if err := json.Unmarshal(job.Payload, &m); err != nil {
			return nil, fmt.Errorf("invalid payload: %w", err)
		}
		if m.To == "" {
			return nil, fmt.Errorf("mail.send: missing recipient")
		}

		if err := mailer.Send(ctx, m); err != nil {
			return nil, err // retried with backoff by the engine
		}

		return map[string]any{"to": m.To, "subject": m.Subject}, nil
	}
}
