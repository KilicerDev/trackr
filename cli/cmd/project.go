package cmd

import (
	"github.com/spf13/cobra"

	"github.com/KilicerDev/trackr/cli/internal/output"
)

var projectCmd = &cobra.Command{
	Use:   "project",
	Short: "Manage projects",
}

var projectListJSON bool

var projectListCmd = &cobra.Command{
	Use:   "list",
	Short: "List projects",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		d, err := newDeps()
		if err != nil {
			return err
		}
		list, err := d.service.ListProjects(cmd.Context())
		if err != nil {
			return err
		}
		if projectListJSON {
			return output.JSON(cmd.OutOrStdout(), list)
		}
		nameWidth := output.TermWidth() - 40
		rows := make([][]string, len(list.Projects))
		for i, p := range list.Projects {
			rows[i] = []string{
				p.Key,
				output.Truncate(p.Name, nameWidth),
				p.Status,
			}
		}
		output.Table(cmd.OutOrStdout(), []string{"KEY", "NAME", "STATUS"}, rows)
		return nil
	},
}

func init() {
	projectListCmd.Flags().BoolVar(&projectListJSON, "json", false, "print the raw API response")
	projectCmd.AddCommand(projectListCmd)
	rootCmd.AddCommand(projectCmd)
}
