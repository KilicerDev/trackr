package core

import (
	"context"
	"errors"
	"strings"

	"github.com/KilicerDev/trackr/cli/internal/api"
)

type ListTasksOptions struct {
	Scope   string // mine | all (empty = server default, mine)
	Project string // filter by project key (client-side — the endpoint has no filters)
	Status  string // filter by status (client-side)
}

func (s *Service) ListTasks(ctx context.Context, opts ListTasksOptions) (*api.TaskList, error) {
	list, err := s.api.ListTasks(ctx, opts.Scope)
	if err != nil {
		return nil, err
	}
	if opts.Project == "" && opts.Status == "" {
		return list, nil
	}
	// Client-side narrowing: the list endpoint returns everything accessible
	// with no filter params, so filtering here costs nothing extra. Note the
	// filtered view no longer matches the raw body — callers combining
	// filters with --json should know raw JSON stays unfiltered.
	filtered := list.Tasks[:0:0]
	for _, t := range list.Tasks {
		if opts.Project != "" && !strings.EqualFold(projectKeyOf(t), opts.Project) {
			continue
		}
		if opts.Status != "" && !strings.EqualFold(t.Status, opts.Status) {
			continue
		}
		filtered = append(filtered, t)
	}
	list.Tasks = filtered
	return list, nil
}

// projectKeyOf derives the project key from the display ref ("PRJ-12" →
// "PRJ"); the list payload's project field holds the project name, not key.
func projectKeyOf(t api.Task) string {
	if i := strings.LastIndex(t.ID, "-"); i > 0 {
		return t.ID[:i]
	}
	return t.Project
}

type CreateTaskInput struct {
	Title       string
	Description string
	ProjectKey  string
	Status      string
	Priority    string
	Type        string
	Due         string // YYYY-MM-DD
	EstimateMin int
	Tags        []string
	AssigneeIDs []string
}

func (s *Service) CreateTask(ctx context.Context, in CreateTaskInput) (*api.Created, error) {
	if strings.TrimSpace(in.Title) == "" {
		return nil, errors.New("task title must not be empty")
	}
	if strings.TrimSpace(in.ProjectKey) == "" {
		return nil, errors.New("a project key is required (--project, or set default_project in the config)")
	}
	return s.api.CreateTask(ctx, api.CreateTaskRequest{
		Title:       strings.TrimSpace(in.Title),
		ProjectKey:  strings.ToUpper(strings.TrimSpace(in.ProjectKey)),
		Description: in.Description,
		Status:      in.Status,
		Priority:    in.Priority,
		Type:        in.Type,
		Due:         in.Due,
		Estimate:    in.EstimateMin,
		Tags:        in.Tags,
		AssigneeIDs: in.AssigneeIDs,
	})
}

// GetTask fetches a task by UUID or display ref ("PRJ-12").
func (s *Service) GetTask(ctx context.Context, ref string) (*api.TaskDetail, error) {
	uuid, err := s.ResolveTaskUUID(ctx, ref)
	if err != nil {
		return nil, err
	}
	return s.api.GetTask(ctx, uuid)
}

// CompleteTask marks a task done.
func (s *Service) CompleteTask(ctx context.Context, ref string) error {
	uuid, err := s.ResolveTaskUUID(ctx, ref)
	if err != nil {
		return err
	}
	done := "done"
	return s.api.PatchTask(ctx, uuid, api.TaskPatch{Status: &done})
}

// UpdateTaskStatus moves a task to an arbitrary status.
func (s *Service) UpdateTaskStatus(ctx context.Context, ref, status string) error {
	uuid, err := s.ResolveTaskUUID(ctx, ref)
	if err != nil {
		return err
	}
	return s.api.PatchTask(ctx, uuid, api.TaskPatch{Status: &status})
}

func (s *Service) CommentTask(ctx context.Context, ref, body string) error {
	if strings.TrimSpace(body) == "" {
		return errors.New("comment body must not be empty")
	}
	uuid, err := s.ResolveTaskUUID(ctx, ref)
	if err != nil {
		return err
	}
	return s.api.AddTaskComment(ctx, uuid, body)
}

func (s *Service) LogTime(ctx context.Context, ref string, minutes int, date, note string) error {
	if minutes <= 0 {
		return errors.New("minutes must be positive")
	}
	uuid, err := s.ResolveTaskUUID(ctx, ref)
	if err != nil {
		return err
	}
	return s.api.LogTaskTime(ctx, uuid, minutes, date, note)
}
