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
	// Second alert line under the title (the entity label). Empty = omitted.
	Subtitle string
	Body     string
	// In-app route (e.g. /tickets/abc) — delivered as a custom key for the
	// app to deep-link on tap.
	URL string
	// APNs thread-id: notifications sharing it group together on the lock
	// screen. Empty = ungrouped.
	ThreadID string
	// App icon badge count. Nil = leave the badge untouched.
	Badge *int
}

// ErrUnregistered marks a device token APNs rejected as gone — the caller
// should delete the stored token.
type ErrUnregistered struct{ Token string }

func (e ErrUnregistered) Error() string { return "apns: device token unregistered" }

func New(cfg Config) (*Client, error) {
	der, err := keyDER(cfg.Key)
	if err != nil {
		return nil, err
	}
	parsed, err := x509.ParsePKCS8PrivateKey(der)
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

// keyDER resolves APNS_KEY into PKCS8 DER bytes. Three accepted forms, so
// env UIs that can't hold multi-line values still work:
//  1. full PEM content (with escaped "\n" tolerated),
//  2. a filesystem path to the .p8,
//  3. the bare base64 body of the .p8 (the PEM without its header/footer).
func keyDER(raw string) ([]byte, error) {
	value := strings.TrimSpace(raw)

	if strings.Contains(value, "-----BEGIN") {
		// Env UIs often store newlines as the two characters \ n.
		value = strings.ReplaceAll(value, `\n`, "\n")
		block, _ := pem.Decode([]byte(value))
		if block == nil {
			return nil, fmt.Errorf("apns: APNS_KEY is not valid PEM")
		}
		return block.Bytes, nil
	}

	if fileData, err := os.ReadFile(value); err == nil {
		block, _ := pem.Decode(fileData)
		if block == nil {
			return nil, fmt.Errorf("apns: key file %q is not valid PEM", value)
		}
		return block.Bytes, nil
	}

	// Not PEM, not a readable file — try the bare base64 body.
	compact := strings.Map(func(r rune) rune {
		if r == ' ' || r == '\n' || r == '\r' || r == '\t' {
			return -1
		}
		return r
	}, value)
	if der, err := base64.StdEncoding.DecodeString(compact); err == nil {
		return der, nil
	}
	return nil, fmt.Errorf(
		"apns: APNS_KEY is neither PEM content, a readable file path, nor base64 key data",
	)
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

	alert := map[string]string{"title": n.Title}
	if n.Subtitle != "" {
		alert["subtitle"] = n.Subtitle
	}
	if n.Body != "" {
		alert["body"] = n.Body
	}
	aps := map[string]any{
		"alert": alert,
		"sound": "default",
	}
	if n.ThreadID != "" {
		aps["thread-id"] = n.ThreadID
	}
	if n.Badge != nil {
		aps["badge"] = *n.Badge
	}
	payload := map[string]any{
		"aps": aps,
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
