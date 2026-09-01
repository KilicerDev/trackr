package tui

import (
	"context"
	"testing"

	"github.com/KilicerDev/trackr/cli/internal/config"
)

func TestLayout(t *testing.T) {
	a := newApp(context.Background(), &config.Config{Server: "https://trackr.test"}, nil)

	cases := []struct {
		w, h     int
		tooSmall bool
	}{
		{79, 24, true},
		{80, 19, true},
		{80, 24, false},  // no sidebar, no detail
		{100, 30, false}, // sidebar, no detail
		{120, 40, false}, // everything
		{200, 50, false},
	}
	for _, c := range cases {
		a.width, a.height = c.w, c.h
		a.layout()
		if a.tooSmall != c.tooSmall {
			t.Errorf("%dx%d tooSmall = %v, want %v", c.w, c.h, a.tooSmall, c.tooSmall)
		}
		if c.tooSmall {
			continue
		}
		if (a.sideW > 0) != (c.w >= 100) {
			t.Errorf("%dx%d sideW = %d", c.w, c.h, a.sideW)
		}
		wantDetail := c.w >= 110
		if (a.detW > 0) != wantDetail {
			t.Errorf("%dx%d detW = %d, detail visible want %v", c.w, c.h, a.detW, wantDetail)
		}
		if a.detW > 0 && a.detW < 32 {
			t.Errorf("%dx%d detail pane narrower than minimum: %d", c.w, c.h, a.detW)
		}
		if sum := a.sideW + a.listW + a.detW; sum != c.w {
			t.Errorf("%dx%d panes sum to %d, want %d", c.w, c.h, sum, c.w)
		}
		if a.workH != c.h-1 {
			t.Errorf("%dx%d workH = %d, want %d", c.w, c.h, a.workH, c.h-1)
		}
		if a.listW < 20 {
			t.Errorf("%dx%d list pane too narrow: %d", c.w, c.h, a.listW)
		}
	}
}

func TestFocusFallsBackWhenPanesHide(t *testing.T) {
	a := newApp(context.Background(), &config.Config{Server: "https://trackr.test"}, nil)
	a.width, a.height = 200, 50
	a.layout()
	a.focus = focusDetail
	a.width = 90 // detail pane disappears
	a.layout()
	if a.focus != focusList {
		t.Errorf("focus should fall back to list when the detail pane hides, got %v", a.focus)
	}
}
