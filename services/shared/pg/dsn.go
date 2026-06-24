// Package pg holds the Postgres connection helpers shared by the queue
// producers/consumers (worker, scheduler). It never owns schema — /web defines
// and migrates every table these services read and write.
package pg

import (
	"fmt"
	"net/url"
	"os"
)

// ResolveDSN builds the Postgres connection string from the environment, mirroring
// web/src/lib/server/db/resolve-url.ts so the Go services and the SvelteKit app
// agree in dev and prod.
//
// Prefers DATABASE_URL (managed providers: Neon, Supabase, RDS, …); otherwise
// constructs one from POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB, with
// POSTGRES_HOST and POSTGRES_PORT defaulting to localhost / 5432.
func ResolveDSN() (string, error) {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v, nil
	}

	user := os.Getenv("POSTGRES_USER")
	password := os.Getenv("POSTGRES_PASSWORD")
	database := os.Getenv("POSTGRES_DB")
	if user == "" || password == "" || database == "" {
		return "", fmt.Errorf(
			"database connection is not configured: set DATABASE_URL, or POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB",
		)
	}

	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("POSTGRES_PORT")
	if port == "" {
		port = "5432"
	}

	u := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(user, password),
		Host:   host + ":" + port,
		Path:   "/" + database,
	}
	return u.String(), nil
}
