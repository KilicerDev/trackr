// Package webhook implements the outbound side of Trackr webhooks: the URL
// policy (https-only, public addresses only), request signing, and an HTTP
// client whose dialer re-checks the policy on the address it actually connects
// to, so a DNS record that flips to a private IP between validation and send
// (DNS rebinding) is still refused.
//
// The web app applies the same policy when a subscription is saved
// (web/src/lib/server/webhooks/url.ts); this package is the enforcement point
// that matters, because it sees the real connection.
package webhook

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
	neturl "net/url"
	"strconv"
	"syscall"
	"time"
)

// Config tunes the client. Zero values fall back to safe defaults.
type Config struct {
	// Per-request timeout (connect + TLS + headers + body). Default 10s.
	Timeout time.Duration
	// Max bytes of the response body kept for the delivery log. Default 2048.
	MaxBody int
	// Permit private/loopback destinations. Off in production; only for
	// developing against a receiver on localhost or the LAN.
	AllowPrivate bool
}

func (c Config) timeout() time.Duration {
	if c.Timeout <= 0 {
		return 10 * time.Second
	}
	return c.Timeout
}

func (c Config) maxBody() int {
	if c.MaxBody <= 0 {
		return 2048
	}
	return c.MaxBody
}

// ErrPrivateAddress is returned when a destination resolves to a non-public IP.
var ErrPrivateAddress = errors.New("destination resolves to a private or reserved address")

// ValidateURL applies the static part of the policy: absolute https URL with a
// host, no credentials. Address checks happen at dial time (see Client).
func ValidateURL(raw string, allowPrivate bool) error {
	u, err := neturl.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid url: %w", err)
	}
	if u.Scheme != "https" && !(allowPrivate && u.Scheme == "http") {
		return errors.New("url must use https")
	}
	if u.Host == "" || u.Hostname() == "" {
		return errors.New("url must include a host")
	}
	if u.User != nil {
		return errors.New("url must not include credentials")
	}
	if !allowPrivate {
		if ip := net.ParseIP(u.Hostname()); ip != nil && !IsPublicIP(ip) {
			return ErrPrivateAddress
		}
		if u.Hostname() == "localhost" {
			return ErrPrivateAddress
		}
	}
	return nil
}

// IsPublicIP reports whether ip is a globally routable unicast address. It
// rejects loopback, link-local, RFC1918, CGNAT (100.64/10), unique-local
// (fc00::/7), multicast, unspecified and the IPv4-mapped forms of all of those.
func IsPublicIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if v4 := ip.To4(); v4 != nil {
		ip = v4
	}
	if ip.IsLoopback() || ip.IsUnspecified() || ip.IsMulticast() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsPrivate() {
		return false
	}
	if v4 := ip.To4(); v4 != nil {
		// 100.64.0.0/10 (carrier-grade NAT), 0.0.0.0/8, 192.0.0.0/24, 240/4.
		switch {
		case v4[0] == 100 && v4[1]&0xc0 == 64:
			return false
		case v4[0] == 0:
			return false
		case v4[0] == 192 && v4[1] == 0 && v4[2] == 0:
			return false
		case v4[0] >= 240:
			return false
		}
	}
	return true
}

// Sign computes the value for the X-Trackr-Signature header:
// "sha256=" + hex(HMAC-SHA256(secret, timestamp + "." + body)).
func Sign(secret string, timestamp int64, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(timestamp, 10)))
	mac.Write([]byte("."))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

// Client is the HTTP client used for deliveries. It never follows redirects
// (a 3xx is a failed delivery: the receiver should point at the final URL) and
// refuses non-public destinations at connect time unless AllowPrivate is set.
type Client struct {
	http *http.Client
	cfg  Config
}

func NewClient(cfg Config) *Client {
	dialer := &net.Dialer{Timeout: cfg.timeout()}
	if !cfg.AllowPrivate {
		dialer.Control = func(network, address string, _ syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				return err
			}
			if !IsPublicIP(net.ParseIP(host)) {
				return ErrPrivateAddress
			}
			return nil
		}
	}
	transport := &http.Transport{
		Proxy:                 nil, // deliveries never go through env proxies
		DialContext:           dialer.DialContext,
		ForceAttemptHTTP2:     true,
		TLSHandshakeTimeout:   cfg.timeout(),
		ResponseHeaderTimeout: cfg.timeout(),
		MaxIdleConns:          16,
		IdleConnTimeout:       60 * time.Second,
	}
	return &Client{
		cfg: cfg,
		http: &http.Client{
			Transport: transport,
			Timeout:   cfg.timeout(),
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

// Request is one delivery attempt.
type Request struct {
	URL        string
	Secret     string
	EventType  string
	DeliveryID string
	Body       []byte
}

// Result is what happened. StatusCode is 0 when no response was received;
// Err then says why. Headers are the request headers, for the delivery log.
type Result struct {
	StatusCode int
	Body       string
	Duration   time.Duration
	Headers    map[string]string
	Err        error
}

// Ok reports whether the receiver accepted the delivery (any 2xx).
func (r Result) Ok() bool { return r.StatusCode >= 200 && r.StatusCode < 300 }

// Do performs one signed POST. It never returns an error for a transport
// failure — that is a failed attempt, recorded in Result.Err — only for a
// request that cannot even be constructed.
func (c *Client) Do(ctx context.Context, r Request) Result {
	ts := time.Now().Unix()
	headers := map[string]string{
		"Content-Type":       "application/json",
		"User-Agent":         "Trackr-Webhooks/1",
		"X-Trackr-Event":     r.EventType,
		"X-Trackr-Delivery":  r.DeliveryID,
		"X-Trackr-Timestamp": strconv.FormatInt(ts, 10),
		"X-Trackr-Signature": Sign(r.Secret, ts, r.Body),
	}
	res := Result{Headers: headers}

	if err := ValidateURL(r.URL, c.cfg.AllowPrivate); err != nil {
		res.Err = err
		return res
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.URL, bytesReader(r.Body))
	if err != nil {
		res.Err = err
		return res
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	start := time.Now()
	resp, err := c.http.Do(req)
	res.Duration = time.Since(start)
	if err != nil {
		res.Err = err
		return res
	}
	defer resp.Body.Close()
	res.StatusCode = resp.StatusCode
	res.Body = readSnippet(resp, c.cfg.maxBody())
	if !res.Ok() {
		res.Err = fmt.Errorf("receiver returned HTTP %d", resp.StatusCode)
	}
	return res
}
