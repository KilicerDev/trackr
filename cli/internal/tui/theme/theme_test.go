package theme

import "testing"

func TestEnumMapsComplete(t *testing.T) {
	checks := []struct {
		name   string
		m      map[string]Meta
		values []string
	}{
		{"task status", TaskStatus, TaskStatusOptions},
		{"task status order", TaskStatus, TaskStatusOrder},
		{"ticket status", TicketStatus, TicketStatusOptions},
		{"priority", Priority, PriorityOptions},
		{"ticket priority", Priority, TicketPriorityOptions},
		{"task type", TaskType, TaskTypeOptions},
		{"ticket category", TicketCategory, TicketCategoryOptions},
	}
	for _, c := range checks {
		for _, v := range c.values {
			meta, ok := c.m[v]
			if !ok {
				t.Errorf("%s: %q missing from map", c.name, v)
				continue
			}
			if meta.Glyph == "" || meta.Label == "" || meta.Color == nil {
				t.Errorf("%s: %q has incomplete meta %+v", c.name, v, meta)
			}
		}
	}
}

func TestLookupFallback(t *testing.T) {
	meta := TaskStatusMeta("someday")
	if meta.Label != "someday" || meta.Glyph == "" {
		t.Errorf("unknown status should fall back to raw value, got %+v", meta)
	}
}

func TestLabelsMatchWebUI(t *testing.T) {
	// Spot-check the strings the web UI uses (lowercase customer/agent).
	if got := TicketStatus["waiting_on_customer"].Label; got != "Waiting on customer" {
		t.Errorf("waiting_on_customer label = %q", got)
	}
	if got := TicketStatus["waiting_on_agent"].Label; got != "Waiting on agent" {
		t.Errorf("waiting_on_agent label = %q", got)
	}
	if got := TicketCategory["technical_issue"].Label; got != "Technical issue" {
		t.Errorf("technical_issue label = %q", got)
	}
}
