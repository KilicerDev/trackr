package auth

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

// OpenURL opens url in the default browser. Callers must handle an error by
// printing the URL for manual opening — a failed launcher is a normal case
// (SSH sessions, minimal containers), not a fatal one.
func OpenURL(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("open browser: %w", err)
	}
	// Release the child; the browser outlives us and we must not block on it.
	go func() { _ = cmd.Wait() }()
	return nil
}

// InSSHSession reports whether the CLI appears to run over SSH, where a local
// browser (and thus the loopback callback) cannot work.
func InSSHSession() bool {
	return os.Getenv("SSH_TTY") != "" || os.Getenv("SSH_CONNECTION") != ""
}
