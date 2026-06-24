module github.com/KilicerDev/trackr/services/worker

go 1.26

require (
	github.com/KilicerDev/trackr/services/shared v0.0.0
	github.com/jackc/pgx/v5 v5.7.2
	github.com/joho/godotenv v1.5.1
	github.com/wneessen/go-mail v0.7.3
)

// The shared module is local to this monorepo. The workspace (services/go.work)
// resolves it in dev; this replace lets a single-module `go build` (e.g. the
// Dockerfile, with GOWORK=off) resolve it too.
replace github.com/KilicerDev/trackr/services/shared => ../shared

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/crypto v0.31.0 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/text v0.37.0 // indirect
)
