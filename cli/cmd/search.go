package cmd

import (
	"strings"

	"github.com/spf13/cobra"

	"github.com/KilicerDev/trackr/cli/internal/output"
)

var searchJSON bool

var searchCmd = &cobra.Command{
	Use:   "search <query>...",
	Short: "Search tickets, tasks, projects, wiki, and notes",
	Args:  cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		query := strings.Join(args, " ")
		if len(query) < 2 {
			return usagef("the query must be at least 2 characters")
		}
		d, err := newDeps()
		if err != nil {
			return err
		}
		results, err := d.service.Search(cmd.Context(), query)
		if err != nil {
			return err
		}
		if searchJSON {
			return output.JSON(cmd.OutOrStdout(), results)
		}
		titleWidth := output.TermWidth() - 40
		rows := make([][]string, len(results.Results))
		for i, r := range results.Results {
			rows[i] = []string{
				r.Type,
				output.Truncate(r.Title, titleWidth),
				output.Truncate(r.Subtitle, 30),
			}
		}
		output.Table(cmd.OutOrStdout(), []string{"TYPE", "TITLE", "WHERE"}, rows)
		return nil
	},
}

func init() {
	searchCmd.Flags().BoolVar(&searchJSON, "json", false, "print the raw API response")
	rootCmd.AddCommand(searchCmd)
}
