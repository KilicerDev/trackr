package cmd

import (
	"errors"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/auth"
)

// usageError marks flag/argument mistakes so they exit 2 like cobra's own
// parse errors.
type usageError struct{ err error }

func (u usageError) Error() string { return u.err.Error() }

func exitCodeFor(err error) int {
	var usage usageError
	switch {
	case errors.As(err, &usage):
		return 2
	case errors.Is(err, api.ErrUnauthorized), errors.Is(err, auth.ErrNoToken):
		return 3
	case errors.Is(err, api.ErrNotFound):
		return 4
	default:
		return 1
	}
}
