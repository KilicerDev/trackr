package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/KilicerDev/trackr/cli/internal/output"
)

var (
	inboxUnread bool
	inboxLimit  int
	inboxJSON   bool
)

var inboxCmd = &cobra.Command{
	Use:   "inbox",
	Short: "Show notifications",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		d, err := newDeps()
		if err != nil {
			return err
		}
		page, err := d.service.Inbox(cmd.Context(), inboxUnread, inboxLimit, "")
		if err != nil {
			return err
		}
		if inboxJSON {
			return output.JSON(cmd.OutOrStdout(), page)
		}
		titleWidth := output.TermWidth() - 50
		rows := make([][]string, len(page.Items))
		for i, item := range page.Items {
			read := ""
			if item.ReadAt == "" {
				read = "●"
			}
			actor := item.ActorID
			if u, ok := page.Actors[item.ActorID]; ok && u.Name != "" {
				actor = u.Name
			}
			rows[i] = []string{
				read,
				item.ID,
				item.Kind,
				output.Truncate(item.Title, titleWidth),
				actor,
			}
		}
		output.Table(cmd.OutOrStdout(), []string{"", "ID", "KIND", "TITLE", "BY"}, rows)
		if page.NextCursor != "" {
			fmt.Fprintf(cmd.ErrOrStderr(), "(more — raise --limit to see further back)\n")
		}
		return nil
	},
}

var inboxReadAll bool

var inboxReadCmd = &cobra.Command{
	Use:   "read [<id>...]",
	Short: "Mark notifications read",
	RunE: func(cmd *cobra.Command, args []string) error {
		if !inboxReadAll && len(args) == 0 {
			return usagef("pass notification ids or --all")
		}
		d, err := newDeps()
		if err != nil {
			return err
		}
		if inboxReadAll {
			if err := d.service.MarkInboxRead(cmd.Context(), "", true); err != nil {
				return err
			}
			fmt.Fprintln(cmd.OutOrStdout(), "Marked all read")
			return nil
		}
		for _, id := range args {
			if err := d.service.MarkInboxRead(cmd.Context(), id, false); err != nil {
				return err
			}
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Marked %d read\n", len(args))
		return nil
	},
}

func init() {
	inboxCmd.Flags().BoolVar(&inboxUnread, "unread", false, "only unread notifications")
	inboxCmd.Flags().IntVar(&inboxLimit, "limit", 0, "how many to fetch (1-100, server default 30)")
	inboxCmd.Flags().BoolVar(&inboxJSON, "json", false, "print the raw API response")
	inboxReadCmd.Flags().BoolVar(&inboxReadAll, "all", false, "mark everything read")
	inboxCmd.AddCommand(inboxReadCmd)
	rootCmd.AddCommand(inboxCmd)
}
