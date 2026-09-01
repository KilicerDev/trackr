package core

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/KilicerDev/trackr/cli/internal/api"
)

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// looksLikeUUID reports whether ref is already an API identifier and needs
// no resolution.
func looksLikeUUID(ref string) bool { return uuidRe.MatchString(ref) }

// ResolveTaskUUID accepts a task UUID or a display ref like "PRJ-12" and
// returns the UUID the /api/v1/tasks/[id] routes require. Display refs are
// resolved by listing — scope=all first for the widest view, falling back to
// mine when the caller lacks all-scope access — and matching Task.ID
// case-insensitively. (The list endpoint returns everything accessible, so
// this is one round trip, not a scan.)
func (s *Service) ResolveTaskUUID(ctx context.Context, ref string) (string, error) {
	if looksLikeUUID(ref) {
		return ref, nil
	}
	list, err := s.api.ListTasks(ctx, "all")
	if err != nil {
		var apiErr *api.APIError
		if errors.As(err, &apiErr) && apiErr.Status == http.StatusForbidden {
			list, err = s.api.ListTasks(ctx, "mine")
		}
		if err != nil {
			return "", err
		}
	}
	for _, t := range list.Tasks {
		if strings.EqualFold(t.ID, ref) {
			return t.UUID, nil
		}
	}
	return "", &api.APIError{Status: http.StatusNotFound, Message: fmt.Sprintf("no task %q", ref)}
}

// ResolveTicketID accepts a ticket UUID or a display ref like "ACME-7" and
// returns the ticket id. Same resolve-by-list pattern as tasks.
func (s *Service) ResolveTicketID(ctx context.Context, ref string) (string, error) {
	if looksLikeUUID(ref) {
		return ref, nil
	}
	list, err := s.api.ListTickets(ctx, "all", "")
	if err != nil {
		var apiErr *api.APIError
		if errors.As(err, &apiErr) && apiErr.Status == http.StatusForbidden {
			list, err = s.api.ListTickets(ctx, "mine", "")
		}
		if err != nil {
			return "", err
		}
	}
	for _, t := range list.Tickets {
		if strings.EqualFold(t.DisplayID, ref) {
			return t.ID, nil
		}
	}
	return "", &api.APIError{Status: http.StatusNotFound, Message: fmt.Sprintf("no ticket %q", ref)}
}

// ResolveOrgID accepts an org slug or id and returns the org id, using the
// caller's own org list from /api/v1/me.
func (s *Service) ResolveOrgID(ctx context.Context, slugOrID string) (string, error) {
	me, err := s.api.Me(ctx)
	if err != nil {
		return "", err
	}
	for _, org := range me.Orgs {
		if strings.EqualFold(org.Slug, slugOrID) || org.ID == slugOrID {
			return org.ID, nil
		}
	}
	return "", fmt.Errorf("no organization %q — you belong to: %s", slugOrID, orgSlugs(me.Orgs))
}

func orgSlugs(orgs []api.Org) string {
	if len(orgs) == 0 {
		return "(none)"
	}
	slugs := make([]string, len(orgs))
	for i, o := range orgs {
		slugs[i] = o.Slug
	}
	return strings.Join(slugs, ", ")
}
