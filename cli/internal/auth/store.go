// Package auth owns the session credential: obtaining a bearer token through
// the browser sign-in flow and persisting it. Tokens live in the OS keyring
// keyed by server URL, with a 0600 file fallback for environments without a
// keyring backend (headless Linux, some CI). Nothing here prints command
// output; the login flow writes progress to a caller-provided writer.
package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/zalando/go-keyring"

	"github.com/KilicerDev/trackr/cli/internal/config"
)

// ErrNoToken means no credential is stored for the server.
var ErrNoToken = errors.New("no stored token")

const keyringService = "trackr-cli"

// TokenStore persists the bearer token for one server. Implementations are
// safe for concurrent use — the HTTP transport rotates tokens mid-flight.
type TokenStore interface {
	Token() (string, error) // ErrNoToken when absent
	Save(token string) error
	Clear() error
}

// NewStore picks the backend from config. With "keyring" configured but no
// backend available (headless Linux), it degrades to the file store with a
// one-time warning on stderr rather than failing every command.
func NewStore(cfg *config.Config) (TokenStore, error) {
	server := CanonicalServer(cfg.Server)
	if cfg.TokenStorage == "file" {
		return newFileStore(server)
	}
	ks := &keyringStore{server: server}
	// Probe availability once; go-keyring surfaces missing backends as errors.
	if _, err := keyring.Get(keyringService, server); err != nil &&
		!errors.Is(err, keyring.ErrNotFound) {
		fmt.Fprintln(os.Stderr, "trackr: OS keyring unavailable, storing token in a file instead (chmod 0600)")
		return newFileStore(server)
	}
	return ks, nil
}

// CanonicalServer normalizes a server URL into a stable storage key:
// lowercased scheme+host[:port], no path, no trailing slash.
func CanonicalServer(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" {
		return strings.ToLower(strings.TrimRight(raw, "/"))
	}
	return strings.ToLower(u.Scheme + "://" + u.Host)
}

type keyringStore struct {
	server string
	mu     sync.Mutex
	cached string
}

func (s *keyringStore) Token() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cached != "" {
		return s.cached, nil
	}
	tok, err := keyring.Get(keyringService, s.server)
	if errors.Is(err, keyring.ErrNotFound) {
		return "", ErrNoToken
	}
	if err != nil {
		return "", fmt.Errorf("read keyring: %w", err)
	}
	s.cached = tok
	return tok, nil
}

func (s *keyringStore) Save(token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := keyring.Set(keyringService, s.server, token); err != nil {
		return fmt.Errorf("write keyring: %w", err)
	}
	s.cached = token
	return nil
}

func (s *keyringStore) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cached = ""
	err := keyring.Delete(keyringService, s.server)
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return fmt.Errorf("clear keyring: %w", err)
	}
	return nil
}

type fileStore struct {
	path   string
	mu     sync.Mutex
	cached string
}

func newFileStore(server string) (*fileStore, error) {
	dir, err := config.Dir()
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256([]byte(server))
	return &fileStore{path: filepath.Join(dir, "tokens", hex.EncodeToString(sum[:]))}, nil
}

func (s *fileStore) Token() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cached != "" {
		return s.cached, nil
	}
	b, err := os.ReadFile(s.path)
	if errors.Is(err, fs.ErrNotExist) {
		return "", ErrNoToken
	}
	if err != nil {
		return "", fmt.Errorf("read token file: %w", err)
	}
	s.cached = strings.TrimSpace(string(b))
	if s.cached == "" {
		return "", ErrNoToken
	}
	return s.cached, nil
}

func (s *fileStore) Save(token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return fmt.Errorf("create token dir: %w", err)
	}
	if err := os.WriteFile(s.path, []byte(token+"\n"), 0o600); err != nil {
		return fmt.Errorf("write token file: %w", err)
	}
	s.cached = token
	return nil
}

func (s *fileStore) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cached = ""
	if err := os.Remove(s.path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("remove token file: %w", err)
	}
	return nil
}
