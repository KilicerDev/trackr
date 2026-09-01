package cmd

import (
	"fmt"
	"sort"
	"strings"

	"github.com/spf13/cobra"

	"github.com/KilicerDev/trackr/cli/internal/output"
)

var whoamiJSON bool

var whoamiCmd = &cobra.Command{
	Use:   "whoami",
	Short: "Show the signed-in identity, orgs, and enabled features",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		d, err := newDeps()
		if err != nil {
			return err
		}
		me, err := d.service.Me(cmd.Context())
		if err != nil {
			return err
		}
		if whoamiJSON {
			return output.JSON(cmd.OutOrStdout(), me)
		}

		orgs := make([]string, len(me.Orgs))
		for i, o := range me.Orgs {
			orgs[i] = fmt.Sprintf("%s (%s)", o.Name, o.Slug)
		}
		// Surfaces double as the user's discovery tool for why a command 403s.
		var surfaces []string
		for name, on := range me.Capabilities.Surfaces {
			if on {
				surfaces = append(surfaces, name)
			}
		}
		sort.Strings(surfaces)

		output.Detail(cmd.OutOrStdout(), [][2]string{
			{"User", fmt.Sprintf("%s <%s>", me.User.Name, me.User.Email)},
			{"Server", d.client.Server()},
			{"Type", me.Capabilities.UserType},
			{"Orgs", strings.Join(orgs, ", ")},
			{"Features", strings.Join(surfaces, ", ")},
			{"Unread", fmt.Sprintf("%d", me.UnreadCount)},
		})
		return nil
	},
}

func init() {
	whoamiCmd.Flags().BoolVar(&whoamiJSON, "json", false, "print the raw API response")
	rootCmd.AddCommand(whoamiCmd)
}
