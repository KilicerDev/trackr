package core

import (
	"context"
	"errors"
	"strings"

	"github.com/KilicerDev/trackr/cli/internal/api"
)

type ListTicketsOptions struct {
	Segment string // mine | watched | all (empty = server default, mine)
	Status  string // server-side status filter
}

func (s *Service) ListTickets(ctx context.Context, opts ListTicketsOptions) (*api.TicketList, error) {
	return s.api.ListTickets(ctx, opts.Segment, opts.Status)
}

type CreateTicketInput struct {
	Org         string // slug or org id
	Subject     string
	Description string
}

func (s *Service) CreateTicket(ctx context.Context, in CreateTicketInput) (*api.Created, error) {
	if strings.TrimSpace(in.Subject) == "" {
		return nil, errors.New("ticket subject must not be empty")
	}
	if strings.TrimSpace(in.Org) == "" {
		return nil, errors.New("an organization is required (--org)")
	}
	orgID, err := s.ResolveOrgID(ctx, in.Org)
	if err != nil {
		return nil, err
	}
	return s.api.CreateTicket(ctx, api.CreateTicketRequest{
		OrgID:       orgID,
		Subject:     strings.TrimSpace(in.Subject),
		Description: in.Description,
	})
}

// GetTicket fetches a ticket by UUID or display ref ("ACME-7").
func (s *Service) GetTicket(ctx context.Context, ref string) (*api.TicketDetail, error) {
	id, err := s.ResolveTicketID(ctx, ref)
	if err != nil {
		return nil, err
	}
	return s.api.GetTicket(ctx, id)
}

type UpdateTicketInput struct {
	Status   string
	Priority string
	Category string
}

func (s *Service) UpdateTicket(ctx context.Context, ref string, in UpdateTicketInput) error {
	var patch api.TicketPatch
	if in.Status != "" {
		patch.Status = &in.Status
	}
	if in.Priority != "" {
		patch.Priority = &in.Priority
	}
	if in.Category != "" {
		patch.Category = &in.Category
	}
	if patch == (api.TicketPatch{}) {
		return errors.New("nothing to update — pass --status, --priority, or --category")
	}
	id, err := s.ResolveTicketID(ctx, ref)
	if err != nil {
		return err
	}
	return s.api.PatchTicket(ctx, id, patch)
}

// MessageTicket posts to the ticket timeline; internal marks a staff-only
// internal note.
func (s *Service) MessageTicket(ctx context.Context, ref, body string, internal bool) error {
	if strings.TrimSpace(body) == "" {
		return errors.New("message body must not be empty")
	}
	id, err := s.ResolveTicketID(ctx, ref)
	if err != nil {
		return err
	}
	return s.api.AddTicketMessage(ctx, id, body, internal)
}
