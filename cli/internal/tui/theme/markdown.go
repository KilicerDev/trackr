package theme

import (
	"strings"
	"sync"

	"charm.land/glamour/v2"
	"charm.land/glamour/v2/ansi"
	"charm.land/glamour/v2/styles"
)

var (
	mdMu    sync.Mutex
	mdCache = map[int]*glamour.TermRenderer{}
)

// Markdown renders markdown at the given wrap width using the trackr
// palette. Renderers are width-bound and cached per width; the output
// has surrounding whitespace trimmed.
func Markdown(text string, width int) string {
	if width < 8 {
		width = 8
	}
	r := renderer(width)
	if r == nil {
		return text
	}
	out, err := r.Render(text)
	if err != nil {
		return text
	}
	return strings.Trim(out, "\n")
}

func renderer(width int) *glamour.TermRenderer {
	mdMu.Lock()
	defer mdMu.Unlock()
	if r, ok := mdCache[width]; ok {
		return r
	}
	r, err := glamour.NewTermRenderer(
		glamour.WithStyles(markdownStyle()),
		glamour.WithWordWrap(width),
	)
	if err != nil {
		return nil
	}
	mdCache[width] = r
	return r
}

func markdownStyle() ansi.StyleConfig {
	cfg := styles.DarkStyleConfig

	ptr := func(s string) *string { return &s }
	uintPtr := func(u uint) *uint { return &u }

	// Flatten the document: no margins (panes provide their own).
	cfg.Document.Margin = uintPtr(0)
	cfg.Document.Color = ptr("#B0AEB8")

	// Headings in the text hierarchy, H1 on the brand accent.
	cfg.H1.Color = ptr("#F5F4F8")
	cfg.H1.BackgroundColor = ptr("#ff4867")
	cfg.H2.Color = ptr("#F5F4F8")
	cfg.H3.Color = ptr("#B0AEB8")
	cfg.H4.Color = ptr("#B0AEB8")
	cfg.H5.Color = ptr("#77757F")
	cfg.H6.Color = ptr("#77757F")

	cfg.Link.Color = ptr("#7a9cf0")
	cfg.LinkText.Color = ptr("#7a9cf0")
	cfg.BlockQuote.Color = ptr("#77757F")
	cfg.HorizontalRule.Color = ptr("#38363F")
	cfg.Code.Color = ptr("#ef7a6d")
	cfg.Code.BackgroundColor = ptr("#232229")
	cfg.CodeBlock.StyleBlock.BackgroundColor = ptr("#1C1B22")

	return cfg
}
