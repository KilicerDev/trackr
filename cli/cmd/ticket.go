package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/KilicerDev/trackr/cli/internal/core"
	"github.com/KilicerDev/trackr/cli/internal/output"
)

var ticketCmd = &cobra.Command{
	Use:   "ticket",
	Short: "Manage support tickets",
}

var (
	ticketListSegment string
	ticketListStatus  string
	ticketListJSON    bool
)

var ticketListCmd = &cobra.Command{
	Use:   "list",
	Short: "List tickets (sorted by last activity)",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		d, err := newDeps()
		if err != nil {
			return err
		}
		list, err := d.service.ListTickets(cmd.Context(), core.ListTicketsOptions{
			Segment: ticketListSegment,
			Status:  ticketListStatus,
		})
		if err != nil {
			return err
		}
		if ticketListJSON {
			return output.JSON(cmd.OutOrStdout(), list)
		}
		subjectWidth := output.TermWidth() - 60
		rows := make([][]string, len(list.Tickets))
		for i, t := range list.Tickets {
			rows[i] = []string{
				t.DisplayID,
				t.Status,
				t.Priority,
				output.Truncate(t.Subject, subjectWidth),
				t.OrgSlug,
				fmt.Sprintf("%d", t.MessageCount),
			}
		}
		output.Table(cmd.OutOrStdout(), []string{"ID", "STATUS", "PRI", "SUBJECT", "ORG", "MSGS"}, rows)
		return nil
	},
}

var (
	ticketCreateOrg     string
	ticketCreateSubject string
	ticketCreateMsg     string
)

var ticketCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a ticket",
	Long: "Create a ticket in an organization. Either --subject plus an optional\n" +
		"-m description, or -m \"Subject\\n\\nDescription\" alone.",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		subject, desc := ticketCreateSubject, ""
		if ticketCreateMsg != "" {
			if subject != "" {
				desc = strings.ReplaceAll(ticketCreateMsg, `\n`, "\n")
			} else {
				subject, desc = splitMessage(ticketCreateMsg)
			}
		}
		if subject == "" {
			return usagef("a subject is required: --subject or -m \"Subject\"")
		}
		if ticketCreateOrg == "" {
			return usagef("an organization is required: --org <slug>")
		}
		d, err := newDeps()
		if err != nil {
			return err
		}
		created, err := d.service.CreateTicket(cmd.Context(), core.CreateTicketInput{
			Org:         ticketCreateOrg,
			Subject:     subject,
			Description: desc,
		})
		if err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Created %s\n", created.DisplayID)
		return nil
	},
}

var ticketViewJSON bool

var ticketViewCmd = &cobra.Command{
	Use:   "view <ref>",
	Short: "Show one ticket with its messages (ref = ACME-7 or ticket id)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		d, err := newDeps()
		if err != nil {
			return err
		}
		detail, err := d.service.GetTicket(cmd.Context(), args[0])
		if err != nil {
			return err
		}
		if ticketViewJSON {
			return output.JSON(cmd.OutOrStdout(), detail)
		}
		t := detail.Ticket
		out := cmd.OutOrStdout()
		output.Detail(out, [][2]string{
			{"Ticket", t.DisplayID},
			{"Subject", t.Subject},
			{"Status", t.Status},
			{"Priority", t.Priority},
			{"Category", t.Category},
			{"Org", fmt.Sprintf("%s (%s)", t.OrgName, t.OrgSlug)},
			{"Assignees", assigneeNames(t.Assignees, detail.Authors)},
			{"Tags", strings.Join(t.Tags, ", ")},
			{"Created", t.CreatedAt},
		})
		if t.Description != "" {
			fmt.Fprintf(out, "\n%s\n", t.Description)
		}
		for _, m := range detail.Messages {
			name := m.AuthorID
			if u, ok := detail.Authors[m.AuthorID]; ok && u.Name != "" {
				name = u.Name
			}
			label := ""
			if m.IsInternalNote {
				label = " [internal]"
			}
			if m.Kind == "system" {
				label = " [system]"
			}
			fmt.Fprintf(out, "\n— %s%s (%s)\n  %s\n", name, label, m.CreatedAt, strings.ReplaceAll(m.Body, "\n", "\n  "))
		}
		return nil
	},
}

var (
	ticketUpdateStatus   string
	ticketUpdatePriority string
	ticketUpdateCategory string
)

var ticketUpdateCmd = &cobra.Command{
	Use:   "update <ref>",
	Short: "Update ticket fields",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		d, err := newDeps()
		if err != nil {
			return err
		}
		err = d.service.UpdateTicket(cmd.Context(), args[0], core.UpdateTicketInput{
			Status:   ticketUpdateStatus,
			Priority: ticketUpdatePriority,
			Category: ticketUpdateCategory,
		})
		if err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Updated %s\n", args[0])
		return nil
	},
}

var (
	ticketMessageMsg      string
	ticketMessageInternal bool
)

var ticketMessageCmd = &cobra.Command{
	Use:   "message <ref>",
	Short: "Post a message on a ticket",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		if ticketMessageMsg == "" {
			return usagef("a message body is required: -m \"...\"")
		}
		d, err := newDeps()
		if err != nil {
			return err
		}
		if err := d.service.MessageTicket(cmd.Context(), args[0], ticketMessageMsg, ticketMessageInternal); err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Posted to %s\n", args[0])
		return nil
	},
}

func init() {
	ticketListCmd.Flags().StringVar(&ticketListSegment, "segment", "", "mine (default), watched, or all")
	ticketListCmd.Flags().StringVar(&ticketListStatus, "status", "", "filter by status (open|in_progress|waiting_on_customer|waiting_on_agent|paused|resolved|closed)")
	ticketListCmd.Flags().BoolVar(&ticketListJSON, "json", false, "print the raw API response")

	ticketCreateCmd.Flags().StringVar(&ticketCreateOrg, "org", "", "organization slug")
	ticketCreateCmd.Flags().StringVar(&ticketCreateSubject, "subject", "", "ticket subject")
	ticketCreateCmd.Flags().StringVarP(&ticketCreateMsg, "message", "m", "", "description, or \"Subject\\n\\nDescription\" when --subject is omitted")

	ticketViewCmd.Flags().BoolVar(&ticketViewJSON, "json", false, "print the raw API response")

	ticketUpdateCmd.Flags().StringVar(&ticketUpdateStatus, "status", "", "new status")
	ticketUpdateCmd.Flags().StringVar(&ticketUpdatePriority, "priority", "", "low|medium|high|urgent")
	ticketUpdateCmd.Flags().StringVar(&ticketUpdateCategory, "category", "", "billing|technical_issue|feature_request|general")

	ticketMessageCmd.Flags().StringVarP(&ticketMessageMsg, "message", "m", "", "message body")
	ticketMessageCmd.Flags().BoolVar(&ticketMessageInternal, "internal", false, "post as staff-only internal note")

	ticketCmd.AddCommand(ticketListCmd, ticketCreateCmd, ticketViewCmd, ticketUpdateCmd, ticketMessageCmd)
	rootCmd.AddCommand(ticketCmd)
}
