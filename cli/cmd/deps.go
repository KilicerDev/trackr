package cmd

import (
	"fmt"
	"strings"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/auth"
	"github.com/KilicerDev/trackr/cli/internal/config"
	"github.com/KilicerDev/trackr/cli/internal/core"
)

// deps wires config → token store → api client → core service. Built lazily
// per command run (not in init) so commands like `version` and `login` never
// require a working configuration.
type deps struct {
	cfg     *config.Config
	store   auth.TokenStore
	client  *api.Client
	service *core.Service
}

func newDeps() (*deps, error) {
	cfg, err := loadConfig()
	if err != nil {
		return nil, err
	}
	store, err := auth.NewStore(cfg)
	if err != nil {
		return nil, err
	}
	client, err := api.New(cfg.Server, store)
	if err != nil {
		return nil, err
	}
	return &deps{cfg: cfg, store: store, client: client, service: core.New(client)}, nil
}

// splitMessage implements the -m convention: the first line becomes the
// title/subject, everything after the first blank line becomes the
// description. `\n` escapes in a single shell argument are honored, matching
// the documented example: trackr task create -m "Title\n\nBody".
func splitMessage(m string) (title, body string) {
	m = strings.ReplaceAll(m, `\n`, "\n")
	parts := strings.SplitN(m, "\n", 2)
	title = strings.TrimSpace(parts[0])
	if len(parts) == 2 {
		body = strings.TrimSpace(parts[1])
	}
	return title, body
}

// usagef builds a usageError (exit code 2) for bad flag/argument input.
func usagef(format string, args ...any) error {
	return usageError{fmt.Errorf(format, args...)}
}
