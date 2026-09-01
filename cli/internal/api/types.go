package api

import "encoding/json"

// Raw carries the untouched server response body so --json can print exactly
// what the API returned — typed structs only cover the fields the CLI
// renders, and must never silently drop data on the JSON path. Embed it in
// every top-level response type.
type Raw struct{ raw json.RawMessage }

func (r *Raw) RawJSON() json.RawMessage { return r.raw }
func (r *Raw) setRaw(b json.RawMessage) { r.raw = b }

type rawSetter interface{ setRaw(json.RawMessage) }

// UserRef is the name/color pair the list endpoints return per user id.
type UserRef struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// Instance is the unauthenticated GET /api/v1/instance probe response.
// Name must be "trackr" for the server to be treated as a trackr instance.
type Instance struct {
	Raw
	Name    string `json:"name"`
	Version string `json:"version"`
	API     int    `json:"api"`
}

// Created is the 201 response of the create endpoints.
type Created struct {
	Raw
	ID        string `json:"id"`
	DisplayID string `json:"displayId"`
}

type OK struct {
	Raw
	OK bool `json:"ok"`
}

// --- me ---

type Me struct {
	Raw
	User         MeUser       `json:"user"`
	Capabilities Capabilities `json:"capabilities"`
	Orgs         []Org        `json:"orgs"`
	UnreadCount  int          `json:"unreadCount"`
}

type MeUser struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// Capabilities gates which surfaces/commands the signed-in user may touch.
type Capabilities struct {
	UserType string          `json:"userType"` // staff | external
	IsAdmin  bool            `json:"isAdmin"`
	Surfaces map[string]bool `json:"surfaces"` // tickets, chat, tasks, projects, wiki, notes, admin
}

type Org struct {
	ID    string `json:"id"`
	Slug  string `json:"slug"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// --- tasks ---

type TaskList struct {
	Raw
	Tasks []Task             `json:"tasks"`
	Users map[string]UserRef `json:"users"`
}

// Task mirrors the server's task shape. ID is the human display ref
// ("PRJ-12"); UUID is the database id — the /api/v1/tasks/[id] routes take
// the UUID, never the display ref.
type Task struct {
	ID          string          `json:"id"`
	UUID        string          `json:"uuid"`
	Title       string          `json:"title"`
	Status      string          `json:"status"`
	Priority    string          `json:"priority"`
	Type        string          `json:"type,omitempty"`
	Project     string          `json:"project"`
	Assignees   []string        `json:"assignees,omitempty"`
	Tags        []string        `json:"tags,omitempty"`
	Due         string          `json:"due,omitempty"`
	Estimate    int             `json:"estimate,omitempty"`
	Updated     string          `json:"updated,omitempty"`
	CreatedAt   string          `json:"createdAt,omitempty"`
	Description string          `json:"description,omitempty"`
	Checklist   []ChecklistItem `json:"checklist,omitempty"`
	Comments    []TaskComment   `json:"comments,omitempty"`
}

type ChecklistItem struct {
	ID   string `json:"id"`
	Text string `json:"text"`
	Done bool   `json:"done"`
}

type TaskComment struct {
	ID        string `json:"id"`
	User      string `json:"user"`
	Text      string `json:"text"`
	CreatedAt string `json:"createdAt"`
}

// TaskDetail is GET /api/v1/tasks/[uuid].
type TaskDetail struct {
	Raw
	Task       Task               `json:"task"`
	Authors    map[string]UserRef `json:"authors"`
	CanEdit    bool               `json:"canEdit"`
	CanComment bool               `json:"canComment"`
}

// CreateTaskRequest is POST /api/v1/tasks. Zero-valued optional fields are
// omitted so the server applies its own defaults.
type CreateTaskRequest struct {
	Title       string   `json:"title"`
	ProjectKey  string   `json:"projectKey"`
	Description string   `json:"description,omitempty"`
	Status      string   `json:"status,omitempty"`
	Priority    string   `json:"priority,omitempty"`
	Type        string   `json:"type,omitempty"`
	Due         string   `json:"due,omitempty"`
	Estimate    int      `json:"estimate,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	AssigneeIDs []string `json:"assigneeIds,omitempty"`
	PlannedFor  string   `json:"plannedFor,omitempty"`
}

// TaskPatch is PATCH /api/v1/tasks/[uuid]; nil fields are left untouched.
type TaskPatch struct {
	Status      *string   `json:"status,omitempty"`
	Priority    *string   `json:"priority,omitempty"`
	Type        *string   `json:"type,omitempty"`
	Title       *string   `json:"title,omitempty"`
	Description *string   `json:"description,omitempty"`
	Due         *string   `json:"due,omitempty"`
	Estimate    *int      `json:"estimate,omitempty"`
	Tags        *[]string `json:"tags,omitempty"`
	AssigneeIDs *[]string `json:"assigneeIds,omitempty"`
}

// --- tickets ---

type TicketList struct {
	Raw
	Tickets []Ticket           `json:"tickets"`
	Users   map[string]UserRef `json:"users"`
}

// Ticket mirrors the server's TicketRow. ID is the ticket UUID; DisplayID is
// the human ref ("ORGKEY-7").
type Ticket struct {
	ID            string   `json:"id"`
	OrgID         string   `json:"orgId"`
	OrgSlug       string   `json:"orgSlug"`
	OrgName       string   `json:"orgName"`
	Number        int      `json:"number"`
	DisplayID     string   `json:"displayId"`
	Subject       string   `json:"subject"`
	Description   string   `json:"description,omitempty"`
	Status        string   `json:"status"`
	Priority      string   `json:"priority"`
	Category      string   `json:"category"`
	Channel       string   `json:"channel"`
	Assignees     []string `json:"assignees,omitempty"`
	Tags          []string `json:"tags,omitempty"`
	MessageCount  int      `json:"messageCount"`
	LastMessageAt string   `json:"lastMessageAt,omitempty"`
	CreatedAt     string   `json:"createdAt"`
	UpdatedAt     string   `json:"updatedAt"`
}

// TicketDetail is GET /api/v1/tickets/[id].
type TicketDetail struct {
	Raw
	Ticket     Ticket             `json:"ticket"`
	Messages   []TicketMessage    `json:"messages"`
	Authors    map[string]UserRef `json:"authors"`
	CanEdit    bool               `json:"canEdit"`
	CanComment bool               `json:"canComment"`
}

type TicketMessage struct {
	ID             string `json:"id"`
	AuthorID       string `json:"authorId"`
	Body           string `json:"body"`
	Kind           string `json:"kind"` // comment | system
	IsInternalNote bool   `json:"isInternalNote"`
	CreatedAt      string `json:"createdAt"`
}

type CreateTicketRequest struct {
	OrgID       string `json:"orgId"`
	Subject     string `json:"subject"`
	Description string `json:"description,omitempty"`
}

type TicketPatch struct {
	Status      *string   `json:"status,omitempty"`
	Priority    *string   `json:"priority,omitempty"`
	Category    *string   `json:"category,omitempty"`
	AssigneeIDs *[]string `json:"assigneeIds,omitempty"`
	Tags        *[]string `json:"tags,omitempty"`
}

// --- projects / inbox / search ---

type ProjectList struct {
	Raw
	Projects []Project `json:"projects"`
}

type Project struct {
	ID          string       `json:"id"`
	Key         string       `json:"key"`
	Name        string       `json:"name"`
	Description string       `json:"description,omitempty"`
	Status      string       `json:"status"`
	Members     []ProjMember `json:"members,omitempty"`
	UpdatedAt   string       `json:"updatedAt"`
}

type ProjMember struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type InboxPage struct {
	Raw
	Items      []InboxItem        `json:"items"`
	Actors     map[string]UserRef `json:"actors"`
	NextCursor string             `json:"nextCursor"`
}

type InboxItem struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	Title      string `json:"title"`
	Body       string `json:"body,omitempty"`
	URL        string `json:"url,omitempty"`
	ActorID    string `json:"actorId,omitempty"`
	EntityType string `json:"entityType,omitempty"`
	EntityID   string `json:"entityId,omitempty"`
	ReadAt     string `json:"readAt,omitempty"`
	CreatedAt  string `json:"createdAt"`
}

type SearchResults struct {
	Raw
	Results []SearchResult `json:"results"`
}

type SearchResult struct {
	Type     string `json:"type"` // ticket | task | project | wiki | note
	ID       string `json:"id"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle,omitempty"`
	URL      string `json:"url,omitempty"`
}
