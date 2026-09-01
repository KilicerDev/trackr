package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/KilicerDev/trackr/cli/internal/api"
	"github.com/KilicerDev/trackr/cli/internal/core"
	"github.com/KilicerDev/trackr/cli/internal/output"
)

var taskCmd = &cobra.Command{
	Use:   "task",
	Short: "Manage tasks",
}

var (
	taskListScope   string
	taskListProject string
	taskListStatus  string
	taskListJSON    bool
)

var taskListCmd = &cobra.Command{
	Use:   "list",
	Short: "List tasks",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		d, err := newDeps()
		if err != nil {
			return err
		}
		list, err := d.service.ListTasks(cmd.Context(), core.ListTasksOptions{
			Scope:   taskListScope,
			Project: taskListProject,
			Status:  taskListStatus,
		})
		if err != nil {
			return err
		}
		if taskListJSON {
			return output.JSON(cmd.OutOrStdout(), list)
		}
		titleWidth := output.TermWidth() - 50
		rows := make([][]string, len(list.Tasks))
		for i, t := range list.Tasks {
			rows[i] = []string{
				t.ID,
				t.Status,
				t.Priority,
				output.Truncate(t.Title, titleWidth),
				assigneeNames(t.Assignees, list.Users),
				t.Due,
			}
		}
		output.Table(cmd.OutOrStdout(), []string{"ID", "STATUS", "PRI", "TITLE", "ASSIGNEES", "DUE"}, rows)
		return nil
	},
}

func assigneeNames(ids []string, users map[string]api.UserRef) string {
	names := make([]string, 0, len(ids))
	for _, id := range ids {
		if u, ok := users[id]; ok && u.Name != "" {
			names = append(names, u.Name)
		} else {
			names = append(names, id)
		}
	}
	return strings.Join(names, ", ")
}

var (
	taskCreateMsg       string
	taskCreateTitle     string
	taskCreateDesc      string
	taskCreateProject   string
	taskCreateStatus    string
	taskCreatePriority  string
	taskCreateType      string
	taskCreateDue       string
	taskCreateEstimate  int
	taskCreateTags      []string
	taskCreateAssignees []string
)

var taskCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a task",
	Long: "Create a task. Give the content either as -m \"Title\\n\\nDescription\"\n" +
		"(first line is the title, the rest after a blank line the description)\n" +
		"or as --title/--description.",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		title, desc := taskCreateTitle, taskCreateDesc
		if taskCreateMsg != "" {
			if title != "" {
				return usagef("use either -m or --title, not both")
			}
			title, desc = splitMessage(taskCreateMsg)
		}
		if title == "" {
			return usagef("a title is required: -m \"Title\" or --title")
		}
		d, err := newDeps()
		if err != nil {
			return err
		}
		project := taskCreateProject
		if project == "" {
			project = d.cfg.DefaultProject
		}
		created, err := d.service.CreateTask(cmd.Context(), core.CreateTaskInput{
			Title:       title,
			Description: desc,
			ProjectKey:  project,
			Status:      taskCreateStatus,
			Priority:    taskCreatePriority,
			Type:        taskCreateType,
			Due:         taskCreateDue,
			EstimateMin: taskCreateEstimate,
			Tags:        taskCreateTags,
			AssigneeIDs: taskCreateAssignees,
		})
		if err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Created %s\n", created.DisplayID)
		return nil
	},
}

var taskViewJSON bool

var taskViewCmd = &cobra.Command{
	Use:   "view <ref>",
	Short: "Show one task (ref = PRJ-12 or task UUID)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		d, err := newDeps()
		if err != nil {
			return err
		}
		detail, err := d.service.GetTask(cmd.Context(), args[0])
		if err != nil {
			return err
		}
		if taskViewJSON {
			return output.JSON(cmd.OutOrStdout(), detail)
		}
		t := detail.Task
		out := cmd.OutOrStdout()
		output.Detail(out, [][2]string{
			{"Task", t.ID},
			{"Title", t.Title},
			{"Status", t.Status},
			{"Priority", t.Priority},
			{"Type", t.Type},
			{"Project", t.Project},
			{"Assignees", assigneeNames(t.Assignees, detail.Authors)},
			{"Tags", strings.Join(t.Tags, ", ")},
			{"Due", t.Due},
			{"Estimate", formatMinutes(t.Estimate)},
		})
		if t.Description != "" {
			fmt.Fprintf(out, "\n%s\n", t.Description)
		}
		if len(t.Checklist) > 0 {
			fmt.Fprintln(out)
			for _, item := range t.Checklist {
				mark := " "
				if item.Done {
					mark = "x"
				}
				fmt.Fprintf(out, "  [%s] %s\n", mark, item.Text)
			}
		}
		if len(t.Comments) > 0 {
			fmt.Fprintln(out)
			for _, c := range t.Comments {
				name := c.User
				if u, ok := detail.Authors[c.User]; ok && u.Name != "" {
					name = u.Name
				}
				fmt.Fprintf(out, "— %s (%s)\n  %s\n", name, c.CreatedAt, strings.ReplaceAll(c.Text, "\n", "\n  "))
			}
		}
		return nil
	},
}

func formatMinutes(min int) string {
	if min <= 0 {
		return ""
	}
	if min%60 == 0 {
		return fmt.Sprintf("%dh", min/60)
	}
	if min > 60 {
		return fmt.Sprintf("%dh%02dm", min/60, min%60)
	}
	return fmt.Sprintf("%dm", min)
}

var taskDoneCmd = &cobra.Command{
	Use:   "done <ref>",
	Short: "Mark a task done",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		d, err := newDeps()
		if err != nil {
			return err
		}
		if err := d.service.CompleteTask(cmd.Context(), args[0]); err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Done %s\n", args[0])
		return nil
	},
}

var taskCommentMsg string

var taskCommentCmd = &cobra.Command{
	Use:   "comment <ref>",
	Short: "Comment on a task",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		if taskCommentMsg == "" {
			return usagef("a comment body is required: -m \"...\"")
		}
		d, err := newDeps()
		if err != nil {
			return err
		}
		if err := d.service.CommentTask(cmd.Context(), args[0], taskCommentMsg); err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "Commented on %s\n", args[0])
		return nil
	},
}

func init() {
	taskListCmd.Flags().StringVar(&taskListScope, "scope", "", "mine (default) or all")
	taskListCmd.Flags().StringVar(&taskListProject, "project", "", "filter by project key")
	taskListCmd.Flags().StringVar(&taskListStatus, "status", "", "filter by status (backlog|todo|in_progress|paused|in_review|done)")
	taskListCmd.Flags().BoolVar(&taskListJSON, "json", false, "print the raw API response (unfiltered)")

	taskCreateCmd.Flags().StringVarP(&taskCreateMsg, "message", "m", "", "title and description in one flag: \"Title\\n\\nDescription\"")
	taskCreateCmd.Flags().StringVar(&taskCreateTitle, "title", "", "task title")
	taskCreateCmd.Flags().StringVar(&taskCreateDesc, "description", "", "task description (markdown)")
	taskCreateCmd.Flags().StringVar(&taskCreateProject, "project", "", "project key (default: default_project from config)")
	taskCreateCmd.Flags().StringVar(&taskCreateStatus, "status", "", "initial status (default: todo)")
	taskCreateCmd.Flags().StringVar(&taskCreatePriority, "priority", "", "none|low|medium|high|urgent")
	taskCreateCmd.Flags().StringVar(&taskCreateType, "type", "", "task|bug|improvement|feature|chore")
	taskCreateCmd.Flags().StringVar(&taskCreateDue, "due", "", "due date YYYY-MM-DD")
	taskCreateCmd.Flags().IntVar(&taskCreateEstimate, "estimate", 0, "estimate in minutes")
	taskCreateCmd.Flags().StringArrayVar(&taskCreateTags, "tag", nil, "tag (repeatable)")
	taskCreateCmd.Flags().StringArrayVar(&taskCreateAssignees, "assignee", nil, "assignee user id (repeatable)")

	taskViewCmd.Flags().BoolVar(&taskViewJSON, "json", false, "print the raw API response")

	taskCommentCmd.Flags().StringVarP(&taskCommentMsg, "message", "m", "", "comment body")

	taskCmd.AddCommand(taskListCmd, taskCreateCmd, taskViewCmd, taskDoneCmd, taskCommentCmd)
	rootCmd.AddCommand(taskCmd)
}
