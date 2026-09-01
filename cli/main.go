// Command trackr is the trackr CLI: scriptable quick commands today, with a
// full-screen TUI to follow. All real work happens in cmd and internal/*;
// main only translates the outcome into a process exit code.
package main

import (
	"os"

	"github.com/KilicerDev/trackr/cli/cmd"
)

func main() {
	os.Exit(cmd.Execute())
}
