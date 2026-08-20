// Package push sends APNs notifications for the push.send job.
//
// Auth is token-based (the .p8 key from the Apple Developer portal): a JWT
// signed with ES256, cached and refreshed well inside Apple's 20–60 minute
// validity window. Transport is plain net/http — Go negotiates HTTP/2 over
// TLS automatically, which is all APNs requires. No third-party deps.
//
// Configuration is env-only so a deployment without the key simply runs with
// push disabled (the handler then acks jobs as skipped): APNS_KEY (PEM string
// or a path to the .p8 file), APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, and
// APNS_ENV (production | development, default production — development is the
// sandbox used by Xcode debug builds).
package push

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type Config struct {
	// PEM content of the .p8 key, or a filesystem path to it.
	Key      string
	KeyID    string
	TeamID   string
	BundleID string
	// "development" targets the APNs sandbox; anything else production.
	Environment string
}

// Enabled reports whether all required settings are present.
func (c Config) Enabled() bool {
	return c.Key != "" && c.KeyID != "" && c.TeamID != "" && c.BundleID != ""
}

type Client struct {
	cfg  Config
	key  *ecdsa.PrivateKey
	http *http.Client

	mu       sync.Mutex
	jwt      string
	jwtIssue time.Time
}

// Notification is one alert push to one device.
type Notification struct {
	DeviceToken string
	Title       string
	Body        string
	// In-app route (e.g. /tickets/abc) — delivered as a custom key for the
	// app to deep-link on tap.
	URL string
}

// ErrUnregistered marks a device token APNs rejected as gone — the caller
// should delete the stored token.
type ErrUnregistered struct{ Token string }

func (e ErrUnregistered) Error() string { return "apns: device token unregistered" }

func New(cfg Config) (*Client, error) {
	pemData := cfg.Key
	// A path is more convenient in compose files than an inline multi-line PEM.
	if !strings.Contains(pemData, "-----BEGIN") {
		raw, err := os.ReadFile(pemData)
		if err != nil {
			return nil, fmt.Errorf("apns: reading key file %q: %w", cfg.Key, err)
		}
		pemData = string(raw)
	}
	block, _ := pem.Decode([]byte(pemData))
	if block == nil {
		return nil, fmt.Errorf("apns: APNS_KEY is not valid PEM")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("apns: parsing key: %w", err)
	}
	ecKey, ok := parsed.(*ecdsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("apns: key is not an EC key")
	}
	return &Client{
		cfg:  cfg,
		key:  ecKey,
		http: &http.Client{Timeout: 15 * time.Second},
	}, nil
}

func (c *Client) host() string {
	if c.cfg.Environment == "development" {
		return "https://api.sandbox.push.apple.com"
	}
	return "https://api.push.apple.com"
}

// token returns a cached provider JWT, re-signing every 40 minutes (Apple
// accepts 20–60).
func (c *Client) token() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.jwt != "" && time.Since(c.jwtIssue) < 40*time.Minute {
		return c.jwt, nil
	}

	header, _ := json.Marshal(map[string]string{"alg": "ES256", "kid": c.cfg.KeyID})
	claims, _ := json.Marshal(map[string]any{"iss": c.cfg.TeamID, "iat": time.Now().Unix()})
	signing := base64.RawURLEncoding.EncodeToString(header) + "." +
		base64.RawURLEncoding.EncodeToString(claims)

	digest := sha256.Sum256([]byte(signing))
	r, s, err := ecdsa.Sign(rand.Reader, c.key, digest[:])
	if err != nil {
		return "", fmt.Errorf("apns: signing jwt: %w", err)
	}
	// JWT ES256 signatures are raw R||S, each left-padded to 32 bytes.
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])

	c.jwt = signing + "." + base64.RawURLEncoding.EncodeToString(sig)
	c.jwtIssue = time.Now()
	return c.jwt, nil
}

// Send delivers one alert notification. Returns ErrUnregistered when APNs
// reports the token gone; other errors are transient and retryable.
func (c *Client) Send(ctx context.Context, n Notification) error {
	jwt, err := c.token()
	if err != nil {
		return err
	}

	payload := map[string]any{
		"aps": map[string]any{
			"alert": map[string]string{
				"title": n.Title,
				"body":  n.Body,
			},
			"sound": "default",
		},
		"url": n.URL,
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost,
		c.host()+"/3/device/"+n.DeviceToken,
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "bearer "+jwt)
	req.Header.Set("apns-topic", c.cfg.BundleID)
	req.Header.Set("apns-push-type", "alert")
	req.Header.Set("content-type", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusOK {
		return nil
	}

	raw, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	var apnsErr struct {
		Reason string `json:"reason"`
	}
	_ = json.Unmarshal(raw, &apnsErr)

	// 410 Gone and BadDeviceToken both mean the stored token is dead.
	if res.StatusCode == http.StatusGone || apnsErr.Reason == "BadDeviceToken" ||
		apnsErr.Reason == "Unregistered" {
		return ErrUnregistered{Token: n.DeviceToken}
	}
	return fmt.Errorf("apns: %d %s", res.StatusCode, apnsErr.Reason)
}
