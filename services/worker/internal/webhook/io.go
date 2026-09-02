package webhook

import (
	"bytes"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"
)

func bytesReader(b []byte) io.Reader { return bytes.NewReader(b) }

// readSnippet drains at most max bytes of the body (plus one to detect
// truncation) and returns it as valid UTF-8 for the delivery log.
func readSnippet(resp *http.Response, max int) string {
	b, _ := io.ReadAll(io.LimitReader(resp.Body, int64(max)+1))
	truncated := len(b) > max
	if truncated {
		b = b[:max]
	}
	s := strings.ToValidUTF8(string(b), "�")
	if !utf8.ValidString(s) {
		s = ""
	}
	if truncated {
		s += "…"
	}
	return s
}
