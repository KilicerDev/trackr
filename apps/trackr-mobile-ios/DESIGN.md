# trackr iOS — design system & screen spec

Source of truth: the Claude Design prototype "Trackr Mobile" (2026-09-14). This
document translates it into SwiftUI terms. Dark is the primary theme; every
token has a derived light value, so never hardcode a color — use `TK.*`.

Code: `trackr-mobile-ios/Design/` (tokens + kit), `Views/Shell/` (top bar,
tab bar, popovers, session mini bar, create sheet host, `AppShell`).

## 1. Principles

- **Flat, hairline-separated, mono for data.** No shadows except the create
  button glow, the popovers and the session mini bar. Lists are full-bleed on
  the page: group bands (`TKGroupBand`) + rows separated by `TKHairline`.
  Cards (`.tkCard()`) are for detail sections, projects, settings groups.
- **Page = `TK.bg`, band = `TK.bgRaised`, card/chip = `TK.card`.**
- **Keys, counts, dates, timers, hours = `Font.tkMono`.** Titles = system.
- **Section labels** = `TKSectionLabel("Checklist")` (11pt, uppercase,
  tracking). **Page titles** = `TKPageHeader("Tasks", meta: "12 open")`.
- **Accent = `TK.accent`** (AccentColor asset `#ff4867`, web parity). The
  prototype's `#ff3d5e` is the same role. Status / priority / type colors come
  from `Taxonomy.swift` (web parity) — do not use the prototype's approximations.
- **Touch targets ≥ 36pt**, chips 38pt, toolbar buttons 36pt, rows ≥ 44pt.
- **Motion**: `.snappy(duration: 0.2)` for state, `.easeOut(0.15–0.25)` for
  overlays. Nothing bouncy.

## 2. Tokens (`TKTheme.swift`)

| Token | Dark | Use |
|---|---|---|
| `TK.bg` | #0b0c0f | page |
| `TK.bgRaised` | #0f1013 | group bands, create sheet body |
| `TK.card` | #14151a | cards, chips, toolbar buttons, sheets |
| `TK.cardActive` | #1b1c22 | pressed rows (`TKPressStyle`) |
| `TK.popover` | #1a1b21 | menus |
| `TK.elevated` / `elevated2` | #1f2027 / #26272f | toast, secondary buttons, round controls |
| `TK.hairline` / `hairlineStrong` | white 5% / 6% | row / section separators |
| `TK.border` / `borderStrong` / `borderInput` | white 8% / 10% / 12% | cards / chips / inputs |
| `TK.borderDashed` | white 20% | "+ Add" ghost chips |
| `TK.text` | #f3f3f5 | primary |
| `TK.textBody` / `text2` / `text3` / `text4` / `text5` | 75/60/45/35/25% | body / secondary / meta / labels / ghost |
| `TK.accentSoft` / `accentBorder` | accent 12% / 40% | selected chips, badges |
| `TK.success` | #4cc38a | done, checks |
| `TK.amber` | #d4b13d | internal notes |
| `TK.warning` | #e0a03a | paused |
| `TK.danger` | #ef4f5e | overdue, destructive |

Radii: sheet 28 · card 16 · card-sm 14 · panel 18 · toolbar 12 · chip 10 ·
segment 9/7 · button 11 · input 14. Gutter 16.

## 3. Component kit (`TKControls.swift`, `TKSheets.swift`, `Components/`)

| Component | Prototype element |
|---|---|
| `.tkCard(radius:padding:)` | #14151a card with 1px border |
| `TKHairline(color:leading:)` | 1px row separator |
| `TKSectionLabel` | "CHECKLIST" label |
| `TKPageHeader(title, meta:)` | 28pt title + mono meta |
| `TKToolbarButton` / `TKFilterButton(count:)` / `TKViewChip(name:)` | list toolbar row under the header |
| `TKSegmented(options, selection, title:)` | List/Board, All/Unread, Theme, Public/Internal |
| `TKPrimaryButton` (50pt) / `TKAccentButton` (42pt) / `TKSecondaryButton` / `TKQuietButton` / `TKCircleButton` | CTAs |
| `TKGroupBand(title:color:count:collapsible:collapsed:trailing:onToggle:)` | group header band |
| `TKCheckCircle(done:)` (20pt) / `TKCheckBox(done:)` (22pt) | task done toggle / checklist |
| `TKLiveDot` / `TKDot` / `TKBar(fraction:)` / `TKTagChip` / `TKCountBadge` | indicators |
| `TKRow(label:detail:) { trailing }` + `TKRowValue` / `TKDisclosure` / `TKToggle` | settings rows |
| `TKSearchField` / `TKTextInput` | inputs |
| `TKEmptyState(text:)` | "You're all caught up." |
| `TKSheetHeader(title:badge:)` + `.tkSheet(detents:)` | sheet chrome |
| `TKPickerSheet(title:options:selected:searchable:onPick:)` + `TKPickerIcon` | every option picker (status, priority, type, assignee, project, org, group-by, sort) |
| `TKDatePickerSheet(selected:onPick:)` | due / planned date |
| `PropertyChip(style:chevron:leadingInset:)` | detail chips (38pt) |
| `StatusDot(status:size:)` / `PriorityBars` / `TypeBadge(type:showLabel:size:)` / `AvatarView` / `AvatarStack` | glyphs |
| `TimelineRow(node:name:action:date:tag:) { MessageCard }` | activity rows |
| `MessageComposer(text:placeholder:mentionCandidates:onSend:/onSendFiles:accent:)` | bottom composer |
| `ChipFlow` | wrapping chip row |

Pickers: **always** `TKPickerSheet` presented with `.sheet(item:)` — never
`Menu`/`Picker`. Dates: `TKDatePickerSheet`.

## 4. Shell & navigation contract

- Each surface (`AppTab`) owns a `NavigationStack(path: $model.<x>Path)` and
  applies **`.tkRootScreen(model)`** on the root content (hides the system nav
  bar, paints `TK.bg`, insets the shared top bar + bottom tab bar). Pushed
  screens apply **`.tkDetailScreen()`** (inline nav bar on `TK.bg`; the system
  back button is the prototype's "‹ Tasks").
- Paths live in `AppModel`: `taskPath`, `ticketPath`, `weekPath`, `searchPath`,
  `inboxPath`, `projectsPath`, `chatPath`, `notesPath`, `meetingsPath`,
  `wikiPath`, `settingsPath`. `model.open(task)` / `model.open(ticket)` jump to
  the entity's own tab.
- The bottom chrome (tab bar + session mini bar) belongs to roots only. Detail
  screens with a running session show `TKSessionMiniBar(model:)` in a
  `.safeAreaInset(edge: .bottom)` placed **above** their composer inset.
- `model.toast("KHZ-21 created")` — confirmation pill. `model.presentCreate()`
  — the "+" (seeds `createKind` from the tab; screens may set
  `model.createProjectName` / `createOrgKey` before calling it).
- Detail nav bar: principal = key + org/project dot + name (13pt), trailing =
  icon buttons (pin/more). Use `.toolbar { ToolbarItem(placement: .principal) }`.

## 5. Screens (measurements from the prototype, 402pt wide)

### Top bar (done: `TKTopBar`)
Workspace button (brand bars + name 15/600 + `chevron.up.chevron.down`),
bell 40×40 with unread dot, avatar 40. Popovers: workspace switcher (left),
account menu (right).

### Tab bar (done: `TKTabBar`)
My week · Tickets · [+ 52pt accent, radius 18, raised 14] · Tasks · Search.

### My week
Header "My week" + mono range "Sep 14 – Sep 20". Toolbar row: `Today`
toolbar button, prev/next pair (one 36pt-tall pill, two 36pt halves split by a
hairline), mono `KW38` 14/600, `NOW` pill (10/700, tracking, accentSofter bg,
accent text) when current week, then right-aligned `plannedH / 40h` mono 12 +
64×3 `TKBar`. Day sections: `TKGroupBand(title: "Monday", trailing: "2h")` with
mono date after the name, `TODAY` pill for today (title in accent), mono task
count. Task rows (see Task row). Empty days show nothing but the band and an
"+ Add task" row (44pt, text4, `+` 16pt) — every day has the add row.
Unscheduled section keeps the segmented Past / My tasks / Others.

### Task row (week, tasks list, search)
```
[36×36 tap: TKCheckCircle 20]  Title 15pt (2 lines, pretty)          [36×36 play ▶ (week only)]
                               ● proj-dot 6 · KEY mono 11 · PriorityBars · project 11 text3 … due 11 (accent when urgent) · 30m mono 11
```
Padding 12 top/bottom, 8 leading, 12–16 trailing; hairline above each row.
Done rows: opacity 0.5, strikethrough, text2 title. Tasks list row: leading
`TypeBadge(size: 18)` instead of project dot, `☑ 1/4` mono when checklist,
due short on the right (`dueColor`: accent when urgent, text3 else). Tap opens
the detail; the check toggles done (Done ↔ Todo) without navigating.

### Tickets
Header "Tickets" + mono "N open". Toolbar: `TKViewChip` (saved view name or
"Custom view") · spacer · List/Board `TKSegmented` (icons only, 34×28 items) ·
`TKFilterButton`. List: bands per group (status/priority/org/assignee), rows
60pt min: line 1 = PriorityBars · KEY mono 11 · org 11 text3; line 2 = subject
15 (1 line); trailing avatar 26 + `chevron.right`. Board: horizontal scroll of
250pt columns, cards `.tkCard(radius: 14, padding: 12)` with KEY / bars, title
14, org · avatar 22.

### Tasks
Same header/toolbar (no List/Board). Groups collapsible (`TKGroupBand`
collapsible) — group by project/status/priority/assignee per `TaskFilters`.

### Projects (account menu)
Header "Projects" + "N active"; toolbar = view chip + filter. Cards
`.tkCard(padding: 14)` spacing 10: 40pt letter tile (radius 11, project
color, 18/700 white) · name 16/600 + key mono 11 · status dot+label 12 on the
right; description 13 text2 (1 line); 3pt color bar; team `AvatarStack` 24 ·
"Lead Name · updated".

### Inbox (bell)
Header "Inbox" + `Mark all read` quiet accent button; `TKSegmented` All /
Unread N. Rows: 6pt unread dot · avatar 34 · "**who** action" 13 text2 with
time 12 text4 right · KEY mono 11 + target 15 (1 line) · optional 2-line quote
13 text2 in quotes. Read rows: who/target dimmed. Empty: `TKEmptyState`.

### Search (tab)
Header "Search"; `TKSearchField` 48 (auto-focus); idle = RECENT chips + hint;
results = bands per type (TICKETS / TASKS / PROJECTS …) with rows: 22pt icon
tile (status dot tile / TypeBadge / letter tile) · title 15 · KEY mono + meta
11 · chevron.

### Account (menu → Account settings) — `SettingsView`
Header "Account". Profile card (avatar 48, name 17/600, email 13 text2).
Sections APPEARANCE (Theme segmented Dark/Light/System → `@AppStorage
"trackr.theme"`, Language row → pushes LanguageSettingsView), DEFAULTS (Landing
page, Week starts on) — only keep rows that are real; NOTIFICATIONS (rows with
`TKToggle`, from NotificationSettingsView's data), then a card with "Send
feedback ›" and accent "Sign out" (calls `model.onSignOut?()`), footer
"Trackr for iOS · version" (from the bundle).

### Ticket detail
Nav: back · principal (KEY mono 12 · org dot 6 · org 13 text2) · trailing
bookmark + ellipsis. Body: title 22/700 (pretty); chip row (`ChipFlow`):
status chip (dot + label + chevron → `TKPickerSheet`), priority chip, category
chip (read-only for non-staff), assignees chip (`AvatarStack` + "N assignees"
/ name); description 15 textBody. Action strip (horizontal): `+ Tags` dashed
chip showing tag chips, `+ Create task` (staff → existing convert flow),
`Attach N`. LINKED TASKS card (`StatusDot` 16 · KEY mono 12 · title 14). ACTIVITY
label + `TimelineRow`s: system events (icon node), replies (`MessageCard`),
internal notes (`MessageCard(accent: TK.amber)` + tag "internal note" amber).
Bottom composer (safe-area inset, hairline above, `TK.bg`): `MessageComposer`
(accent amber when internal) + below it `TKSegmented` Public / Internal note
(internal tinted amber) with hint "Visible to the client" / "Only your team
sees this" (11 text3). Non-staff never see the mode switch. This REPLACES the
separate TicketConversationView push — the conversation lives on the detail.

### Task detail
Nav: back · trailing ellipsis (menu: attachments, tags, log time, delete…).
Body: KEY mono 12 · project dot · project 12 text3; title 22/700 (strike when
done); chips row 1: type (TypeBadge 22 + label), status (StatusDot 18 + label),
priority (bars + label); row 2: assignee (avatar 24 + name), due (calendar
icon + "10 Sep · 3 days left", dashed when empty), `Est 4h` chip (Est text2,
value mono). Blocked banner (amber left bar) when `sourceTicket`/deps apply —
only if data exists. Description (`RichContentView`/plain, 15 textBody).
CHECKLIST: label + mono done/total + 80×4 `TKBar`; card `.tkCard(radius: 14,
padding: nil)` rows 48pt `TKCheckBox` + text 15 (strike/text3 when done),
last row "+ Add an item…" input. TIME: card with "Log time" 15/500, mono
`logged / est`, 4pt bar (success, danger when over), `+30m` `+1h`
`TKSecondaryButton(fill: TK.bg, height: 36)`; below: "Start session" card
button (play glyph accent) or the running-session row (live dot + state +
mono clock 20) when this task's session runs. ACTIVITY: timeline rows +
"Created <mono date> · Channel <x>" footer 12 text3. Bottom composer: comment.

### Create sheet (`CreateSheet`, `.tkSheet(background: TK.bgRaised)`)
Handle; header row: scope chip (dashed 38pt: dot + "KiloHertz GmbH" +
chevron → `TKPickerSheet` searchable) · "NEW TICKET ▾" kind label (11/600
tracking, tap → kind picker Ticket / Task / Session) · spacer · × 32. Body:
title field 22/600 (placeholder "Ticket title" / "Task title" / "What are you
working on? (optional)"), description textarea 15 textBody, chip row 40pt:
type, status (task), priority, assignee (avatar 26), `Due date` dashed,
`Estimate` dashed, `Tags` dashed. Session kind: hint text + "▶ Start session"
accent button. Footer (hairline above): Cancel `TKSecondaryButton` +
`TKAccentButton("Create ticket"/"Create task")` disabled until a title exists.
Keeps: FileStaging section, ticket→task conversion prefills, project picker
with Favorites/Recent/All (as a `TKPickerSheet`-styled screen or sheet).

### View options sheet (replaces TaskFiltersSheet / TicketFiltersSheet /
ProjectFiltersSheet / SavedViewsSheet)
`TKSheetHeader("View options", badge: activeCount)`. SAVED VIEWS: horizontal
chips (bookmark + name; selected = accent style) + "+ Save current" dashed
chip (→ name prompt) — keep update/delete via context menu. LAYOUT card (on
`TK.bg` inside the card sheet): View List/Board (tickets), Group by ›, Sort by
› (each → `TKPickerSheet`; sort direction toggle inside the sort row).
FILTERS card: rows `● Status  …  Any ▾` with an `×` clear column when active;
multi-select filters open a `TKPickerSheet(dismissOnPick: false)` with checks.
Footer: `TKPrimaryButton("Show N tickets")` closes.

### Session sheet (`SessionPlayerView`, presented as `.sheet`)
`.tkSheet()`; handle; row: KEY mono · project (13 text2) · × ; title 20/600;
clock 72pt light (`SessionClock`), state line (live dot + "Recording"/"Paused",
"· becomes a task on finish" for free sessions); two 64pt round controls
(pause/resume on `TK.elevated2`; finish on accentSofter with accent border)
with 12pt captions ("Finish · 2h05m"); note input row (`TK.bg`, 14 radius,
"Add" button) + quick-note capsules (Blocked, Waiting on client, Done for
today, Needs review) + note list (mono time · text). Finishing (free
session): "NEW TASK IN PROJECT" label, `TKTextInput` title, hint, accent CTA
"Create task & log 2h05m", Back / Discard session row. Task-bound finish keeps
the existing Done? confirm.

### Workspace switcher / account menu (done: `TKPopovers`)

## 6. Working rules for screen rebuilds

1. **Only restyle.** Keep every model / SyncEngine / filter API call, every
   optimistic update, deep-link path, attachment flow and permission gate
   (`model.isStaff`) exactly as it is. If a behaviour must move (e.g. the
   ticket conversation onto the detail), move the code, don't drop it.
2. No `Color(.systemX)`, `.secondary`, `Form`, `List`, `.ultraThinMaterial`
   (except the tab bar), `Menu`-as-picker. Use the kit.
3. Roots: `.tkRootScreen(model)`; details: `.tkDetailScreen()`; sheets:
   `.tkSheet()`.
4. Sample data must render every state (previews + `--sample-data`). Add
   sample rows if a state has none.
5. `#Preview` with `.preferredColorScheme(.dark)`; also glance at light.
6. Build: `xcodebuild -project trackr-mobile-ios.xcodeproj -scheme
   trackr-mobile-ios -destination 'id=<sim udid>' -derivedDataPath <own dir>
   build`. Screenshot: `xcrun simctl install <udid> <app>` then `xcrun simctl
   launch --terminate-running-process <udid> com.kilicer.trackr-mobile-ios
   --sample-data --tab <week|tickets|tasks|search|inbox|projects|chat|notes|meetings|wiki|settings>`
   and `xcrun simctl io <udid> screenshot out.png` (set `xcrun simctl ui
   <udid> appearance dark` first). Deep links for details: `xcrun simctl
   openurl` is not wired; use previews for detail screens.
