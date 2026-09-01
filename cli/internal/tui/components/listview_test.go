package components

import (
	"fmt"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func testRows(groups map[string][]string, order []string) []Row {
	var rows []Row
	for _, g := range order {
		group := g
		rows = append(rows, Row{
			Kind:   RowHeader,
			Render: func(int, bool) string { return "== " + group },
		})
		for _, id := range groups[g] {
			item := id
			rows = append(rows, Row{
				ID:     item,
				Kind:   RowItem,
				Filter: item,
				Render: func(_ int, selected bool) string {
					if selected {
						return "> " + item
					}
					return "  " + item
				},
			})
		}
	}
	return rows
}

func newTestList(t *testing.T) ListView {
	t.Helper()
	lv := NewListView()
	lv.SetSize(40, 6)
	lv.SetRows(testRows(map[string][]string{
		"a": {"a1", "a2"},
		"b": {"b1", "b2", "b3"},
	}, []string{"a", "b"}))
	return lv
}

func press(lv *ListView, keys ...string) {
	for _, k := range keys {
		var msg tea.KeyPressMsg
		switch k {
		case "esc":
			msg = tea.KeyPressMsg{Code: tea.KeyEscape}
		case "enter":
			msg = tea.KeyPressMsg{Code: tea.KeyEnter}
		default:
			r := []rune(k)
			msg = tea.KeyPressMsg{Code: r[0], Text: k}
		}
		lv.Update(msg)
	}
}

func TestCursorSkipsHeaders(t *testing.T) {
	lv := newTestList(t)
	if got := lv.SelectedID(); got != "a1" {
		t.Fatalf("initial selection = %q, want a1", got)
	}
	press(&lv, "j")
	if got := lv.SelectedID(); got != "a2" {
		t.Fatalf("after j = %q, want a2", got)
	}
	press(&lv, "j") // must skip the "b" header
	if got := lv.SelectedID(); got != "b1" {
		t.Fatalf("after jj = %q, want b1", got)
	}
	press(&lv, "k")
	if got := lv.SelectedID(); got != "a2" {
		t.Fatalf("after jjk = %q, want a2", got)
	}
}

func TestJumpAndClamp(t *testing.T) {
	lv := newTestList(t)
	press(&lv, "G")
	if got := lv.SelectedID(); got != "b3" {
		t.Fatalf("G = %q, want b3", got)
	}
	press(&lv, "j") // clamped at end
	if got := lv.SelectedID(); got != "b3" {
		t.Fatalf("G then j = %q, want b3", got)
	}
	press(&lv, "g")
	if got := lv.SelectedID(); got != "a1" {
		t.Fatalf("g = %q, want a1", got)
	}
	press(&lv, "k") // clamped at start
	if got := lv.SelectedID(); got != "a1" {
		t.Fatalf("g then k = %q, want a1", got)
	}
}

func TestWindowingFollowsCursor(t *testing.T) {
	lv := NewListView()
	lv.SetSize(20, 3) // window of 3 rows
	var rows []Row
	for i := range 10 {
		id := fmt.Sprintf("item%d", i)
		item := id
		rows = append(rows, Row{ID: item, Kind: RowItem, Filter: item,
			Render: func(_ int, sel bool) string {
				if sel {
					return "> " + item
				}
				return "  " + item
			}})
	}
	lv.SetRows(rows)
	press(&lv, "G")
	view := lv.View()
	if !strings.Contains(view, "> item9") {
		t.Fatalf("after G the last row must be visible:\n%s", view)
	}
	if strings.Contains(view, "item0") {
		t.Fatalf("after G the first row must be scrolled out:\n%s", view)
	}
	if got := strings.Count(view, "item"); got != 3 {
		t.Fatalf("window shows %d rows, want 3:\n%s", got, view)
	}
}

func TestFilter(t *testing.T) {
	lv := newTestList(t)
	press(&lv, "/", "b")
	if !lv.FilterOpen() {
		t.Fatal("filter input should be open after /")
	}
	press(&lv, "enter") // apply filter, close input
	if lv.FilterOpen() {
		t.Fatal("enter should close the filter input")
	}
	if !lv.FilterActive() {
		t.Fatal("filter should stay applied")
	}
	view := lv.View()
	if strings.Contains(view, "a1") || strings.Contains(view, "== a") {
		t.Fatalf("filtered view still shows group a:\n%s", view)
	}
	if !strings.Contains(view, "b1") {
		t.Fatalf("filtered view lost matches:\n%s", view)
	}
	if got := lv.Count(); got != 3 {
		t.Fatalf("filtered count = %d, want 3", got)
	}
	press(&lv, "esc") // clear filter entirely
	if lv.FilterActive() {
		t.Fatal("esc should clear the filter")
	}
}

func TestSetRowsKeepsSelection(t *testing.T) {
	lv := newTestList(t)
	press(&lv, "j", "j") // b1
	lv.SetRows(testRows(map[string][]string{
		"a": {"a1"},
		"b": {"b0", "b1"},
	}, []string{"a", "b"}))
	if got := lv.SelectedID(); got != "b1" {
		t.Fatalf("selection after SetRows = %q, want b1", got)
	}
}
