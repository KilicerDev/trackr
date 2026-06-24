package pg

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// How long to keep retrying the initial connection. Covers `docker compose up`
	// ordering, where the db may not be ready when a service starts.
	connectTimeout = 5 * time.Minute
	pingTimeout    = 5 * time.Second
	retryInterval  = 2 * time.Second
)

// Connect builds a pgx pool from dsn and retries pinging until Postgres is
// reachable or the timeout expires. The returned pool is ready for use; the
// caller owns Close.
func Connect(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}

	deadline := time.Now().Add(connectTimeout)
	for {
		pingCtx, cancel := context.WithTimeout(ctx, pingTimeout)
		err = pool.Ping(pingCtx)
		cancel()
		if err == nil {
			return pool, nil
		}
		if ctx.Err() != nil || time.Now().After(deadline) {
			pool.Close()
			return nil, err
		}
		slog.Info("postgres not ready, retrying", "error", err)
		select {
		case <-ctx.Done():
			pool.Close()
			return nil, ctx.Err()
		case <-time.After(retryInterval):
		}
	}
}
