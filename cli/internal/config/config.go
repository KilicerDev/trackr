// Package config resolves the CLI configuration. All input reading (flags,
// TRACKR_* environment variables, the config file) funnels through Load so
// precedence lives in exactly one place: flag > env > config file > default.
//
// The config file is ~/.config/trackr/config.toml on every Unix (including
// macOS — ~/.config is the de-facto convention for CLIs, and it keeps the
// path predictable across machines). $XDG_CONFIG_HOME is honored when set.
package config

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
)

type Config struct {
	// Base URL of the trackr server, e.g. https://trackr.example.com.
	// Flag --server, env TRACKR_SERVER, file key "server".
	Server string
	// Project key applied by `task create` when --project is omitted.
	// Env TRACKR_DEFAULT_PROJECT, file key "default_project".
	DefaultProject string
	// "keyring" (default) or "file" — where the bearer token is persisted.
	// File key "token_storage". The file fallback also engages automatically
	// when no keyring backend is available (headless Linux).
	TokenStorage string

	// path is where the config file was (or would be) loaded from, so Save
	// can write back to the same location.
	path string
}

// Overrides carries flag-level values into Load. Zero values mean "not set".
type Overrides struct {
	Server string
}

// fileConfig mirrors the on-disk TOML shape.
type fileConfig struct {
	Server         string `toml:"server"`
	DefaultProject string `toml:"default_project"`
	TokenStorage   string `toml:"token_storage"`
}

// Dir returns the trackr config directory, creating nothing.
func Dir() (string, error) {
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "trackr"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	return filepath.Join(home, ".config", "trackr"), nil
}

func Load(over Overrides) (*Config, error) {
	dir, err := Dir()
	if err != nil {
		return nil, err
	}
	path := filepath.Join(dir, "config.toml")

	var fc fileConfig
	if _, err := toml.DecodeFile(path, &fc); err != nil {
		// A missing file is the normal first-run state; anything else (parse
		// error, permission) should fail loudly rather than half-apply.
		if !errors.Is(err, fs.ErrNotExist) {
			return nil, fmt.Errorf("read %s: %w", path, err)
		}
	}

	cfg := &Config{
		Server:         firstOf(over.Server, os.Getenv("TRACKR_SERVER"), fc.Server),
		DefaultProject: firstOf(os.Getenv("TRACKR_DEFAULT_PROJECT"), fc.DefaultProject),
		TokenStorage:   firstOf(fc.TokenStorage, "keyring"),
		path:           path,
	}
	cfg.Server = strings.TrimRight(cfg.Server, "/")

	switch cfg.TokenStorage {
	case "keyring", "file":
	default:
		return nil, fmt.Errorf("%s: token_storage must be \"keyring\" or \"file\", got %q", path, cfg.TokenStorage)
	}
	return cfg, nil
}

// Save persists the current values back to the config file (0600, dir 0700).
// Only the durable fields are written; flag/env-derived values the user chose
// to persist (e.g. the server picked during `trackr login`) must be assigned
// to the struct before calling Save.
func (c *Config) Save() error {
	if err := os.MkdirAll(filepath.Dir(c.path), 0o700); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	var b strings.Builder
	enc := toml.NewEncoder(&b)
	if err := enc.Encode(fileConfig{
		Server:         c.Server,
		DefaultProject: c.DefaultProject,
		TokenStorage:   c.TokenStorage,
	}); err != nil {
		return fmt.Errorf("encode config: %w", err)
	}
	if err := os.WriteFile(c.path, []byte(b.String()), 0o600); err != nil {
		return fmt.Errorf("write %s: %w", c.path, err)
	}
	return nil
}

func firstOf(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
