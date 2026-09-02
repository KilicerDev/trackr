package webhook

import (
	"net"
	"testing"
)

func TestIsPublicIP(t *testing.T) {
	private := []string{
		"127.0.0.1", "::1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1",
		"169.254.169.254", "100.64.0.1", "100.127.255.255", "0.0.0.0", "fe80::1", "fc00::1", "fd12::1",
		"::ffff:10.0.0.1", "224.0.0.1", "255.255.255.255", "192.0.0.1",
	}
	for _, s := range private {
		if IsPublicIP(net.ParseIP(s)) {
			t.Errorf("%s should be private", s)
		}
	}
	public := []string{"8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "93.184.216.34"}
	for _, s := range public {
		if !IsPublicIP(net.ParseIP(s)) {
			t.Errorf("%s should be public", s)
		}
	}
}

func TestValidateURL(t *testing.T) {
	bad := []string{"http://example.com/hook", "https://", "https://user:pw@example.com/x", "ftp://example.com", "https://127.0.0.1/x", "https://localhost/x", "https://[::1]/x", "not a url"}
	for _, u := range bad {
		if err := ValidateURL(u, false); err == nil {
			t.Errorf("%q should be rejected", u)
		}
	}
	if err := ValidateURL("https://hooks.example.com/trackr?x=1", false); err != nil {
		t.Errorf("valid url rejected: %v", err)
	}
	if err := ValidateURL("http://localhost:5678/hook", true); err != nil {
		t.Errorf("allowPrivate should accept localhost http: %v", err)
	}
}

func TestSign(t *testing.T) {
	// Known vector: HMAC-SHA256("secret", "1756800000.{}").
	got := Sign("secret", 1756800000, []byte("{}"))
	const want = "sha256=eb2a678dc6331e3e2747092457e11e3493000f141d9caaa3573a95d5af50655c"
	if got != want {
		t.Fatalf("got %s want %s", got, want)
	}
	if Sign("secret", 1756800000, []byte("{}")) != got {
		t.Fatal("not deterministic")
	}
	if Sign("other", 1756800000, []byte("{}")) == got {
		t.Fatal("secret not mixed in")
	}
}
