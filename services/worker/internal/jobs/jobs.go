// Package jobs holds the worker's handlers and wires them to their dependencies.
//
// Each job type is one constructor (e.g. sendMail) that captures its deps and
// returns a jobworker.Handler; Register assembles the type → handler map the
// engine runs. Adding a job type = one file here + the matching entry in
// web/src/lib/server/jobs (same commit — there is no codegen).
package jobs

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KilicerDev/trackr/services/shared/jobworker"
	"github.com/KilicerDev/trackr/services/worker/internal/mail"
)

// Deps are the shared clients handlers need, injected by main() at startup.
// Add further clients (e.g. an S3 client) here as the worker grows.
type Deps struct {
	DB     *pgxpool.Pool
	Mailer mail.Sender
}

// Register builds the type → handler map for the engine.
func Register(d Deps) map[string]jobworker.Handler {
	return map[string]jobworker.Handler{
		"mail.send":           sendMail(d.Mailer),
		"prune.jobs":          pruneJobs(d.DB),
		"prune.invitations":   pruneInvitations(d.DB),
		"prune.notifications": pruneNotifications(d.DB),
	}
}
