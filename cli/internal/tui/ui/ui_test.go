package ui

import (
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/x/ansi"
)

func TestTruncate(t *testing.T) {
	cases := []struct {
		in   string
		w    int
		want string
	}{
		{"hello", 10, "hello"},
		{"hello", 5, "hello"},
		{"hello world", 8, "hello w…"},
		{"hello", 1, "…"},
		{"hello", 0, ""},
		{"line\nbreak", 20, "line break"},
		{"日本語のテスト", 6, "日本…"}, // CJK: double-width cells
		{"🎉🎉🎉🎉", 5, "🎉🎉…"},
	}
	for _, c := range cases {
		got := Truncate(c.in, c.w)
		if got != c.want {
			t.Errorf("Truncate(%q, %d) = %q, want %q", c.in, c.w, got, c.want)
		}
		if w := ansi.StringWidth(got); w > c.w {
			t.Errorf("Truncate(%q, %d) rendered width %d overflows", c.in, c.w, w)
		}
	}
}

func TestPad(t *testing.T) {
	for _, s := range []string{"", "ab", "日本語", "longer than width"} {
		got := Pad(s, 8)
		if w := ansi.StringWidth(got); w != 8 {
			t.Errorf("Pad(%q, 8) width = %d, want 8 (got %q)", s, w, got)
		}
	}
}

func TestRelTime(t *testing.T) {
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		stamp string
		want  string
	}{
		{now.Add(-10 * time.Second).Format(time.RFC3339), "just now"},
		{now.Add(-5 * time.Minute).Format(time.RFC3339), "5m ago"},
		{now.Add(-3 * time.Hour).Format(time.RFC3339), "3h ago"},
		{now.Add(-49 * time.Hour).Format(time.RFC3339), "2d ago"},
		{"bogus", ""},
	}
	for _, c := range cases {
		if got := RelTime(now, c.stamp); got != c.want {
			t.Errorf("RelTime(%q) = %q, want %q", c.stamp, got, c.want)
		}
	}
	// Old dates fall back to a short date.
	if got := RelTime(now, "2020-01-02T00:00:00Z"); !strings.Contains(got, "2020") {
		t.Errorf("old stamp should include year, got %q", got)
	}
}

func TestDueTone(t *testing.T) {
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.Local)
	if got := DueTone(now, "2026-08-01"); got != 2 {
		t.Errorf("past due tone = %d, want 2", got)
	}
	if got := DueTone(now, "2026-09-01"); got != 1 {
		t.Errorf("today tone = %d, want 1 (due soon)", got)
	}
	if got := DueTone(now, "2026-12-01"); got != 0 {
		t.Errorf("far tone = %d, want 0", got)
	}
	if got := DueTone(now, ""); got != 0 {
		t.Errorf("empty tone = %d, want 0", got)
	}
}

func TestDueLabel(t *testing.T) {
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.Local)
	if got := DueLabel(now, "2026-08-01"); got != "Overdue" {
		t.Errorf("DueLabel past = %q", got)
	}
	if got := DueLabel(now, "2026-09-01"); got != "Today" {
		t.Errorf("DueLabel today = %q", got)
	}
}

func TestFormatMinutes(t *testing.T) {
	cases := map[int]string{0: "", 45: "45m", 60: "1h", 90: "1h 30m", 150: "2h 30m"}
	for in, want := range cases {
		if got := FormatMinutes(in); got != want {
			t.Errorf("FormatMinutes(%d) = %q, want %q", in, got, want)
		}
	}
}
