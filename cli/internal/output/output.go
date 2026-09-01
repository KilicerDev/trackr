// Package output renders command results for humans and scripts. Human
// output is plain text via tabwriter (styling arrives with the TUI in M3);
// --json prints the server's response body untouched. All rendering writes
// to a caller-provided writer — stdout for results, never diagnostics.
package output

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"text/tabwriter"

	"golang.org/x/term"
)

// RawJSONer is any api response type embedding api.Raw.
type RawJSONer interface{ RawJSON() json.RawMessage }

// JSON prints the raw server response body followed by a newline — an exact
// pass-through, so scripts see the documented API shape, not a Go re-encode.
func JSON(w io.Writer, v RawJSONer) error {
	raw := v.RawJSON()
	if len(raw) == 0 {
		raw = json.RawMessage("null")
	}
	_, err := fmt.Fprintf(w, "%s\n", raw)
	return err
}

// Table prints a header row and rows with aligned columns.
func Table(w io.Writer, headers []string, rows [][]string) {
	tw := tabwriter.NewWriter(w, 0, 4, 2, ' ', 0)
	fmt.Fprintln(tw, strings.Join(headers, "\t"))
	for _, row := range rows {
		fmt.Fprintln(tw, strings.Join(row, "\t"))
	}
	tw.Flush()
}

// Detail prints "Field:  value" pairs for view commands, skipping empty
// values so sparse records stay compact.
func Detail(w io.Writer, pairs [][2]string) {
	tw := tabwriter.NewWriter(w, 0, 4, 2, ' ', 0)
	for _, p := range pairs {
		if p[1] == "" {
			continue
		}
		fmt.Fprintf(tw, "%s:\t%s\n", p[0], p[1])
	}
	tw.Flush()
}

// Truncate shortens s to max runes with an ellipsis. Used to keep one row
// per record in tables.
func Truncate(s string, max int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	if max <= 3 {
		max = 3
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max-1]) + "…"
}

// TermWidth returns the terminal width for stdout, or 120 when stdout is not
// a terminal (pipes, CI).
func TermWidth() int {
	if w, _, err := term.GetSize(int(os.Stdout.Fd())); err == nil && w > 20 {
		return w
	}
	return 120
}
