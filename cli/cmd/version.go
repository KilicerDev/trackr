package cmd

import (
	"fmt"
	"runtime/debug"

	"github.com/spf13/cobra"
)

// version is stamped by goreleaser (-ldflags "-X …/cmd.version=v1.2.3").
// For `go install` builds the module version from build info fills in.
var version = "dev"

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the trackr CLI version",
	Run: func(cmd *cobra.Command, args []string) {
		v := version
		if v == "dev" {
			if info, ok := debug.ReadBuildInfo(); ok && info.Main.Version != "" && info.Main.Version != "(devel)" {
				v = info.Main.Version
			}
		}
		fmt.Fprintf(cmd.OutOrStdout(), "trackr %s\n", v)
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}
