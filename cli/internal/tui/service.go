package tui

import (
	"context"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/core"
)

// svcAdapter implements ui.Service on top of *core.Service, adding the
// three raw client operations the core layer only exposes via API().
// This is the single place the TUI reaches past the core layer.
type svcAdapter struct{ *core.Service }

func (s svcAdapter) PatchTask(ctx context.Context, uuid string, patch api.TaskPatch) error {
	return s.API().PatchTask(ctx, uuid, patch)
}

func (s svcAdapter) DeleteTask(ctx context.Context, uuid string) error {
	return s.API().DeleteTask(ctx, uuid)
}

func (s svcAdapter) PatchTicket(ctx context.Context, id string, patch api.TicketPatch) error {
	return s.API().PatchTicket(ctx, id, patch)
}
