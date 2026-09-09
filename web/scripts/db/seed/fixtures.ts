// Demo fixtures consumed by the seeder (`bun run db:seed --all`).
//
// Everything here is *relative to today*: planning rows land in the current
// week, history sits in the past few weeks, due dates hover around now. Re-run
// the seed any time and the workspace looks freshly in use.
//
// Mention syntax in bodies is the app's own — `@[Name](u2)` — where the fixture
// user id is swapped for the real DB id by the seeder. Entity references use
// `~[SIWEB-52](task:SIWEB-52)` and are resolved the same way.

import { at, wk, ymd } from './util';

// ── Users ──────────────────────────────────────────────────────────────────

export type OrgKey = 'SIWEB' | 'WEBIM' | 'MAJA';
export type UserKey = 'u0' | 'u1' | 'u2' | 'u3' | 'u4' | 'u5' | 'u6' | 'c1' | 'c2' | 'c3' | 'c4';

export type DemoUser = {
	id: UserKey;
	name: string;
	email: string;
	team: string;
	/** better-auth role (user/admin/superadmin). */
	appRole: 'superadmin' | 'admin' | 'user';
	/** Which org the membership goes into. */
	org: 'internal' | OrgKey;
	orgRole: 'org.superadmin' | 'org.admin' | 'org.staff' | 'org.client' | 'org.member';
};

export const MAX_USER: UserKey = 'u0';

export const USERS: DemoUser[] = [
	{
		id: 'u0',
		name: 'Max Muster',
		email: 'max.muster@trackr.dev',
		team: 'Engineering',
		appRole: 'admin',
		org: 'internal',
		orgRole: 'org.admin'
	},
	{
		id: 'u1',
		name: 'Maja Schmidt',
		email: 'maja.schmidt@trackr.dev',
		team: 'Design',
		appRole: 'admin',
		org: 'internal',
		orgRole: 'org.admin'
	},
	{
		id: 'u2',
		name: 'Leon Vogel',
		email: 'leon.vogel@trackr.dev',
		team: 'Engineering',
		appRole: 'user',
		org: 'internal',
		orgRole: 'org.staff'
	},
	{
		id: 'u3',
		name: 'Ines Krüger',
		email: 'ines.krueger@trackr.dev',
		team: 'Engineering',
		appRole: 'user',
		org: 'internal',
		orgRole: 'org.staff'
	},
	{
		id: 'u4',
		name: 'Tomás Reyes',
		email: 'tomas.reyes@trackr.dev',
		team: 'Operations',
		appRole: 'user',
		org: 'internal',
		orgRole: 'org.staff'
	},
	{
		id: 'u5',
		name: 'Hana Weiss',
		email: 'hana.weiss@trackr.dev',
		team: 'Marketing',
		appRole: 'user',
		org: 'internal',
		orgRole: 'org.staff'
	},
	{
		id: 'u6',
		name: 'Yusuf Aydın',
		email: 'yusuf.aydin@trackr.dev',
		team: 'Engineering',
		appRole: 'admin',
		org: 'internal',
		orgRole: 'org.admin'
	},
	// The superadmin tier: settings, integrations, the system section (the
	// smoke suites act as her for anything behind admin.settings.manage).
	{
		id: 'u7',
		name: 'Sina Berger',
		email: 'sina.berger@trackr.dev',
		team: 'Engineering',
		appRole: 'superadmin',
		org: 'internal',
		orgRole: 'org.superadmin'
	},
	// Client-side users (ticket portal / support chat).
	{
		id: 'c1',
		name: 'Renée Carter',
		email: 'renee.carter@siweb.de',
		team: 'Siweb GmbH',
		appRole: 'user',
		org: 'SIWEB',
		orgRole: 'org.client'
	},
	{
		id: 'c2',
		name: 'Pieter Janssen',
		email: 'pieter.janssen@siweb.de',
		team: 'Siweb GmbH',
		appRole: 'user',
		org: 'SIWEB',
		orgRole: 'org.member'
	},
	{
		id: 'c3',
		name: 'Sabine Koch',
		email: 'sabine.koch@webim.agency',
		team: 'Webim Agency',
		appRole: 'user',
		org: 'WEBIM',
		orgRole: 'org.client'
	},
	{
		id: 'c4',
		name: 'Josie Maja',
		email: 'josie@maja.studio',
		team: 'Maja Studio',
		appRole: 'user',
		org: 'MAJA',
		orgRole: 'org.client'
	}
];

// ── Organizations (clients) ────────────────────────────────────────────────

export type DemoOrg = {
	key: OrgKey;
	slug: string;
	name: string;
	description: string;
	color: string;
};

export const ORGS: DemoOrg[] = [
	{
		key: 'SIWEB',
		slug: 'siweb',
		name: 'Siweb GmbH',
		description:
			'B2B spare-parts marketplace out of Stuttgart. Shop + admin backend on our stack since 2024.',
		color: '#e07a5f'
	},
	{
		key: 'WEBIM',
		slug: 'webim',
		name: 'Webim Agency',
		description:
			'Performance-marketing agency. We build and host their landing pages and campaign tooling.',
		color: '#7fc8a9'
	},
	{
		key: 'MAJA',
		slug: 'maja',
		name: 'Maja Studio',
		description:
			'Design studio evaluating Trackr for their own client work. Currently on a demo instance.',
		color: '#c08bd6'
	}
];

// ── Projects ───────────────────────────────────────────────────────────────

export type ProjectKey = 'SIWEB' | 'TRACKR' | 'MAJA' | 'WEBIM' | 'MOBILE';

export type DemoProject = {
	key: ProjectKey;
	name: string;
	description: string;
	color: string;
	icon: string;
	status: 'prospect' | 'planned' | 'active' | 'paused' | 'completed';
	org: OrgKey | null;
	lead: UserKey;
	members: UserKey[];
	createdAt: Date;
};

export const PROJECTS: DemoProject[] = [
	{
		key: 'SIWEB',
		name: 'Siweb Marketplace',
		description:
			'B2B parts marketplace with SKU search, inventory sync, checkout and German localization.',
		color: '#e07a5f',
		icon: 'S',
		status: 'active',
		org: 'SIWEB',
		lead: 'u2',
		members: ['u0', 'u1', 'u2', 'u3', 'u4', 'u5'],
		createdAt: at(-140)
	},
	{
		key: 'TRACKR',
		name: 'Trackr Internal',
		description:
			'Our own task system — Linear-style workspace for small teams. Web app, worker, mail.',
		color: '#7a9cf0',
		icon: 'T',
		status: 'active',
		org: null,
		lead: 'u6',
		members: ['u0', 'u2', 'u3', 'u6'],
		createdAt: at(-200)
	},
	{
		key: 'MOBILE',
		name: 'Trackr Mobile',
		description:
			'Native iOS app: My Week, tasks, tickets, chat, work sessions with Live Activities.',
		color: '#f0a85c',
		icon: 'M',
		status: 'active',
		org: null,
		lead: 'u0',
		members: ['u0', 'u2', 'u6', 'u1'],
		createdAt: at(-60)
	},
	{
		key: 'WEBIM',
		name: 'Webim Campaign',
		description:
			'Q4 paid acquisition campaign — landing page, Google Ads, copy variants, reporting.',
		color: '#7fc8a9',
		icon: 'W',
		status: 'active',
		org: 'WEBIM',
		lead: 'u5',
		members: ['u0', 'u5', 'u6'],
		createdAt: at(-45)
	},
	{
		key: 'MAJA',
		name: 'Maja Demo',
		description: 'Demo workspace for the Maja Studio onboarding flow and translation gaps.',
		color: '#c08bd6',
		icon: 'J',
		status: 'prospect',
		org: 'MAJA',
		lead: 'u1',
		members: ['u0', 'u1', 'u4'],
		createdAt: at(-30)
	}
];

export const FAVORITES: Record<UserKey, ProjectKey[]> = {
	u0: ['MOBILE', 'SIWEB', 'TRACKR'],
	u1: ['MAJA', 'SIWEB'],
	u2: ['SIWEB', 'TRACKR'],
	u3: ['SIWEB'],
	u4: ['SIWEB', 'MAJA'],
	u5: ['WEBIM'],
	u6: ['TRACKR', 'MOBILE'],
	c1: [],
	c2: [],
	c3: [],
	c4: []
};

// ── Tasks ──────────────────────────────────────────────────────────────────

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'paused' | 'in_review' | 'done';
export type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent';
export type TaskType = 'task' | 'bug' | 'improvement' | 'feature' | 'chore';

export type DemoComment = { user: UserKey; at: Date; text: string; files?: string[] };
export type DemoTimeLog = { user: UserKey; at: Date; minutes: number; note?: string };
export type DemoPlan = { user: UserKey; day: Date };

export type DemoTask = {
	key: string; // "SIWEB-52"
	title: string;
	description?: string;
	status: TaskStatus;
	priority: Priority;
	type: TaskType;
	assignees: UserKey[];
	tags?: string[];
	due?: Date | null;
	start?: Date;
	end?: Date;
	estimate?: number;
	checklist?: { text: string; done: boolean }[];
	parent?: string;
	createdBy: UserKey;
	createdAt: Date;
	/** Filenames from images.ts attached to the task itself. */
	files?: string[];
	comments?: DemoComment[];
	timeLogs?: DemoTimeLog[];
	/** Per-user "my week" placement. */
	plans?: DemoPlan[];
	/** Set when the task was converted from a ticket. */
	fromTicket?: string;
};

const CL = (items: [string, boolean][]) => items.map(([text, done]) => ({ text, done }));

export const TASKS: DemoTask[] = [
	// ─── SIWEB ───────────────────────────────────────────────────────────────
	{
		key: 'SIWEB-52',
		title: 'Checkout: retry payment fails silently after gateway 502',
		description:
			'Reported by Renée via ticket SIWEB-7. When the payment gateway answers 502 the checkout shows the red banner, but "Retry payment" stays disabled and the console shows the POST never fires again.\n\nRepro:\n1. Fill cart, go to checkout\n2. Force gateway to return 502 (staging flag `PG_FAIL=1`)\n3. Click "Retry payment" → nothing happens\n\nExpected: retry re-submits the order with the same idempotency key. See ~[SIWEB-7](ticket:SIWEB-7) for the customer thread.',
		status: 'in_progress',
		priority: 'urgent',
		type: 'bug',
		assignees: ['u0', 'u2'],
		tags: ['checkout', 'bug', 'customer'],
		due: wk(3, 18),
		start: wk(0),
		end: wk(3),
		estimate: 360,
		checklist: CL([
			['Reproduce on staging with PG_FAIL=1', true],
			['Re-enable button after error state', true],
			['Reuse idempotency key on retry', false],
			['Add Playwright test for the 502 path', false],
			['Reply to Renée on the ticket', false]
		]),
		createdBy: 'u0',
		createdAt: at(-4, 9, 15),
		files: ['checkout-error.png'],
		fromTicket: 'SIWEB-7',
		comments: [
			{
				user: 'u0',
				at: at(-4, 9, 40),
				text: 'Converted from the ticket. Screenshot from Renée attached — the console line at the bottom is the interesting part, the retry never fires.',
				files: []
			},
			{
				user: 'u2',
				at: at(-3, 11, 5),
				text: "Found it: the error state sets `submitting=true` and never resets because the catch branch returns early. One-liner, but I want the idempotency key fix in the same PR so we don't double-charge on retry."
			},
			{
				user: 'u0',
				at: at(-1, 16, 20),
				text: "@[Leon Vogel](u2) agreed. I'll take the Playwright test today, you take the key reuse? Then we can close ~[SIWEB-7](ticket:SIWEB-7) by Thursday."
			},
			{
				user: 'u2',
				at: at(0, 8, 50),
				text: 'Deal. PR #412 is up for the button reset, key reuse coming after standup.'
			}
		],
		timeLogs: [
			{ user: 'u2', at: at(-3), minutes: 90, note: 'Debugging the retry state machine' },
			{ user: 'u0', at: at(-1), minutes: 45, note: 'Repro + test plan' },
			{ user: 'u0', at: at(0), minutes: 60, note: 'Playwright: 502 path' }
		],
		plans: [
			{ user: 'u0', day: wk(2) },
			{ user: 'u2', day: wk(2) }
		]
	},
	{
		key: 'SIWEB-18',
		title: 'SKU search returns duplicate rows for articles with multiple suppliers',
		description:
			'Searching "HP-220" returns 6 rows where 4 are expected. Articles with more than one supplier mapping appear once per supplier. Screenshot attached.\n\nFix should collapse by article id and show a supplier count badge instead.',
		status: 'done',
		priority: 'high',
		type: 'bug',
		assignees: ['u0'],
		tags: ['search', 'bug', 'admin'],
		due: wk(1),
		estimate: 180,
		checklist: CL([
			['Group by article id in the search query', true],
			['Supplier count badge in results table', true],
			['Backfill index', true]
		]),
		createdBy: 'u4',
		createdAt: at(-9, 14, 0),
		files: ['sku-search-duplicates.png'],
		comments: [
			{
				user: 'u4',
				at: at(-9, 14, 10),
				text: 'Pieter flagged this on the weekly call — see the highlighted rows in the screenshot.'
			},
			{
				user: 'u0',
				at: at(-2, 10, 30),
				text: 'Fixed in #405 and deployed to staging. @[Tomás Reyes](u4) can you ask Pieter to verify before I push to prod?'
			},
			{ user: 'u4', at: at(-1, 9, 5), text: 'Verified by Pieter this morning 👍 Go ahead.' },
			{ user: 'u0', at: at(-1, 11, 0), text: 'Deployed. Closing.' }
		],
		timeLogs: [
			{ user: 'u0', at: at(-2), minutes: 150, note: 'Query rewrite + badge' },
			{ user: 'u0', at: at(-1), minutes: 30, note: 'Prod deploy + smoke test' }
		],
		plans: [{ user: 'u0', day: wk(1) }]
	},
	{
		key: 'SIWEB-15',
		title: 'Show deleted articles clearly in admin lists',
		description:
			'Deleted spare parts still show up in the general search and are hard to tell apart. Agreed with Mike: remove them from the main search and show them only in a separate "Deleted" tab with a strike-through row style.',
		status: 'in_review',
		priority: 'medium',
		type: 'improvement',
		assignees: ['u3'],
		tags: ['admin', 'ux'],
		due: wk(4),
		start: at(-12),
		end: wk(4),
		estimate: 120,
		createdBy: 'u3',
		createdAt: at(-14, 17, 45),
		comments: [
			{
				user: 'u3',
				at: at(-6, 15, 0),
				text: 'Solution agreed with Mike: deleted parts leave the general search and only show under the "Deleted" tab.'
			},
			{
				user: 'u1',
				at: at(-2, 12, 30),
				text: 'Reviewed the tab design — please use the muted badge style from the status filter, not the red one. Otherwise good to go.'
			}
		],
		timeLogs: [{ user: 'u3', at: at(-5), minutes: 120, note: 'Deleted tab + row styling' }],
		plans: [{ user: 'u3', day: wk(1) }]
	},
	{
		key: 'SIWEB-21',
		title: 'Status filter (All / Published / Draft / Deleted) for articles and SKUs',
		status: 'in_review',
		priority: 'medium',
		type: 'feature',
		assignees: ['u4', 'u3'],
		tags: ['admin'],
		due: wk(4),
		estimate: 240,
		createdBy: 'u4',
		createdAt: at(-16, 10, 0),
		comments: [
			{
				user: 'u3',
				at: at(-3, 9, 30),
				text: 'PR is up. Filter state is kept in the URL so links can be shared.'
			}
		],
		timeLogs: [{ user: 'u3', at: at(-3), minutes: 200, note: 'Filter component + URL state' }],
		plans: [{ user: 'u3', day: wk(3) }]
	},
	{
		key: 'SIWEB-27',
		title: 'Translate storefront to German',
		description:
			'Missing strings on /pricing, /support, checkout confirmation e-mails. Use the shared glossary from the wiki.',
		status: 'in_progress',
		priority: 'medium',
		type: 'task',
		assignees: ['u1', 'u0'],
		tags: ['web', 'i18n'],
		due: at(-2),
		estimate: 480,
		checklist: CL([
			['/pricing', true],
			['/support', true],
			['Checkout e-mails', false],
			['Legal footer', false]
		]),
		createdBy: 'u1',
		createdAt: at(-25, 9, 0),
		comments: [
			{
				user: 'u1',
				at: at(-8, 14, 0),
				text: 'Pricing and support pages done. E-mails need the new template first.'
			},
			{
				user: 'u0',
				at: at(-3, 17, 10),
				text: 'Template landed yesterday, I can take the e-mail strings this week.'
			}
		],
		timeLogs: [
			{ user: 'u1', at: at(-10), minutes: 180, note: '/pricing + /support' },
			{ user: 'u1', at: at(-8), minutes: 60 }
		],
		plans: [
			{ user: 'u0', day: at(-6) },
			{ user: 'u1', day: wk(4) }
		]
	},
	{
		key: 'SIWEB-8',
		title: 'Strengthen credibility: communicate "Made in Germany" and expertise',
		status: 'paused',
		priority: 'high',
		type: 'task',
		assignees: ['u5'],
		tags: ['web', 'copy'],
		createdBy: 'u5',
		createdAt: at(-40)
	},
	{
		key: 'SIWEB-16',
		title: 'Add fields for old & new part numbers + Discontinued flag',
		status: 'todo',
		priority: 'medium',
		type: 'feature',
		assignees: ['u4'],
		tags: ['admin', 'data'],
		due: at(12),
		estimate: 300,
		createdBy: 'u4',
		createdAt: at(-20),
		plans: [{ user: 'u4', day: wk(3) }]
	},
	{
		key: 'SIWEB-17',
		title: 'Always show the Tetra Pak number first in article titles',
		status: 'done',
		priority: 'low',
		type: 'improvement',
		assignees: ['u2'],
		tags: [],
		createdBy: 'u2',
		createdAt: at(-30),
		timeLogs: [{ user: 'u2', at: at(-22), minutes: 40 }]
	},
	{
		key: 'SIWEB-19',
		title: 'Rename "Refurbished" to "Checked (Geprüft)" across the shop',
		status: 'done',
		priority: 'none',
		type: 'chore',
		assignees: ['u3'],
		tags: ['copy'],
		createdBy: 'u3',
		createdAt: at(-28),
		timeLogs: [{ user: 'u3', at: at(-26), minutes: 25 }]
	},
	{
		key: 'SIWEB-20',
		title: 'Condition picker: allow two buttons to be selected at once',
		status: 'todo',
		priority: 'medium',
		type: 'bug',
		assignees: ['u2'],
		tags: ['bug', 'web'],
		due: wk(4),
		estimate: 90,
		createdBy: 'u2',
		createdAt: at(-18),
		plans: [{ user: 'u2', day: wk(3) }]
	},
	{
		key: 'SIWEB-31',
		title: 'Sticky table headers when scrolling long lists',
		status: 'todo',
		priority: 'low',
		type: 'improvement',
		assignees: ['u3'],
		tags: ['web', 'ux'],
		createdBy: 'u3',
		createdAt: at(-15)
	},
	{
		key: 'SIWEB-44',
		title: 'Export filtered tasks to CSV',
		description: 'Sample of the expected output attached.',
		status: 'backlog',
		priority: 'low',
		type: 'feature',
		assignees: ['u3'],
		tags: [],
		createdBy: 'u3',
		createdAt: at(-22),
		files: ['siweb-open-tasks.csv']
	},
	{
		key: 'SIWEB-55',
		title: 'Inventory sync: nightly job skips articles with empty EAN',
		status: 'todo',
		priority: 'high',
		type: 'bug',
		assignees: ['u0'],
		tags: ['sync', 'bug'],
		due: wk(4, 12),
		estimate: 120,
		createdBy: 'u4',
		createdAt: at(-1, 8, 30),
		comments: [
			{
				user: 'u4',
				at: at(-1, 8, 35),
				text: "Found 37 articles without EAN in last night's run — they never get a stock update. Log excerpt in the ticket ~[SIWEB-9](ticket:SIWEB-9)."
			}
		],
		plans: [{ user: 'u0', day: wk(4) }],
		fromTicket: 'SIWEB-9'
	},
	{
		key: 'SIWEB-56',
		title: 'Client dashboard: monthly report export (PDF)',
		description:
			'Renée wants the dashboard numbers as a PDF for their management meeting. Draft of the dashboard attached — the export should match it.',
		status: 'backlog',
		priority: 'medium',
		type: 'feature',
		assignees: ['u0', 'u5'],
		tags: ['reporting'],
		createdBy: 'u0',
		createdAt: at(-2, 15, 0),
		files: ['dashboard-v2.png']
	},

	// ─── TRACKR ──────────────────────────────────────────────────────────────
	{
		key: 'TRACKR-70',
		title: 'Inline edit task title from list view',
		description:
			'Double-click a task title in the list view to edit inline. Esc cancels, Enter or blur saves. Must respect read-only states for archived tasks.\n\nSpec attached (PDF).',
		status: 'in_progress',
		priority: 'high',
		type: 'feature',
		assignees: ['u0', 'u2'],
		tags: ['ux'],
		due: wk(4, 17),
		start: wk(0),
		end: wk(4),
		estimate: 150,
		parent: 'TRACKR-65',
		checklist: CL([
			['Double-click enters edit mode', true],
			['Esc / Enter / blur handling', true],
			['Read-only for archived', false],
			['Keyboard-only path (F2)', false]
		]),
		createdBy: 'u6',
		createdAt: at(-9, 9, 12),
		files: ['inline-edit-spec.pdf'],
		comments: [
			{
				user: 'u6',
				at: at(-8, 10, 0),
				text: "Spec attached. Let's get this in before the next release window — should be a quick win for power users."
			},
			{
				user: 'u0',
				at: at(-7, 9, 20),
				text: 'I can take a first pass. One question: do we want the edit affordance to show on hover or only on focus?'
			},
			{
				user: 'u6',
				at: at(-7, 9, 45),
				text: 'Hover, subtle — same as the pencil in the inspector. @[Max Muster](u0)'
			},
			{
				user: 'u2',
				at: at(-1, 14, 0),
				text: 'Wired up double-click and the contenteditable scaffold. Screenshot of the phone list for reference — mobile stays read-only for now.',
				files: ['iphone-my-week.png']
			}
		],
		timeLogs: [
			{ user: 'u0', at: at(-6), minutes: 45, note: 'Keyboard interactions for cancel/commit' },
			{ user: 'u2', at: at(-1), minutes: 30, note: 'Double-click + contenteditable scaffold' },
			{ user: 'u0', at: at(0), minutes: 90, note: 'Archived read-only state' }
		],
		plans: [
			{ user: 'u0', day: wk(0) },
			{ user: 'u2', day: wk(1) }
		]
	},
	{
		key: 'TRACKR-65',
		title: 'List view polish (epic)',
		status: 'in_progress',
		priority: 'medium',
		type: 'feature',
		assignees: ['u6'],
		tags: ['ux'],
		createdBy: 'u6',
		createdAt: at(-30)
	},
	{
		key: 'TRACKR-68',
		title: 'Plan current week: drag tasks between days',
		description:
			'Wireframe attached. Dragging a card between day columns updates planned_for; dropping on "Unplanned" clears it.',
		status: 'in_review',
		priority: 'medium',
		type: 'feature',
		assignees: ['u6', 'u0'],
		tags: ['week', 'ux'],
		due: wk(4),
		estimate: 300,
		createdBy: 'u6',
		createdAt: at(-12),
		files: ['wireframe-week-view.png'],
		comments: [
			{
				user: 'u6',
				at: at(-2, 18, 0),
				text: 'PR ready for review. @[Max Muster](u0) could you test it with your (full) week?'
			},
			{
				user: 'u0',
				at: at(0, 9, 10),
				text: 'On it today — first impression: drop targets need a bigger hit area on trackpads.'
			}
		],
		timeLogs: [{ user: 'u6', at: at(-3), minutes: 240, note: 'DnD + optimistic updates' }],
		plans: [
			{ user: 'u0', day: wk(2) },
			{ user: 'u6', day: wk(2) }
		]
	},
	{
		key: 'TRACKR-66',
		title: "Saved filters don't persist the assignee",
		status: 'done',
		priority: 'urgent',
		type: 'bug',
		assignees: ['u2'],
		tags: ['bug'],
		due: at(-5),
		createdBy: 'u0',
		createdAt: at(-8),
		comments: [
			{
				user: 'u2',
				at: at(-5, 16, 0),
				text: 'Root cause: the assignee id was serialized as a number. Fixed + migration for existing saved views.'
			}
		],
		timeLogs: [{ user: 'u2', at: at(-5), minutes: 75 }]
	},
	{
		key: 'TRACKR-71',
		title: 'Keyboard shortcut palette (⌘K → command list)',
		status: 'todo',
		priority: 'medium',
		type: 'feature',
		assignees: ['u6'],
		tags: ['ux'],
		due: at(10),
		estimate: 240,
		createdBy: 'u6',
		createdAt: at(-10),
		plans: [{ user: 'u6', day: wk(3) }]
	},
	{
		key: 'TRACKR-93',
		title: 'Bulk edit selected rows (status, assignee, priority)',
		status: 'backlog',
		priority: 'medium',
		type: 'feature',
		assignees: ['u2'],
		tags: ['ux'],
		createdBy: 'u2',
		createdAt: at(-20)
	},
	{
		key: 'TRACKR-95',
		title: 'Calendar / timeline view for cross-project planning',
		status: 'todo',
		priority: 'low',
		type: 'feature',
		assignees: ['u0', 'u6'],
		tags: ['week'],
		estimate: 600,
		createdBy: 'u6',
		createdAt: at(-24),
		plans: [{ user: 'u0', day: wk(4) }]
	},
	{
		key: 'TRACKR-101',
		title: 'Webhook retries: exponential backoff caps at 6 attempts',
		description:
			'Follow-up from the webhooks release. Cap retries, mark the subscription disabled after the last failure and notify the owner (notification kind webhookDisabled).',
		status: 'in_progress',
		priority: 'high',
		type: 'improvement',
		assignees: ['u0'],
		tags: ['worker', 'webhooks'],
		due: wk(2, 18),
		estimate: 180,
		checklist: CL([
			['Backoff schedule 1m/5m/15m/1h/6h/24h', true],
			['Disable subscription after attempt 6', true],
			['Notify owner', false]
		]),
		createdBy: 'u0',
		createdAt: at(-3, 8, 0),
		timeLogs: [
			{ user: 'u0', at: at(-2), minutes: 120, note: 'Backoff + disable path in the worker' }
		],
		plans: [{ user: 'u0', day: wk(2) }]
	},
	{
		key: 'TRACKR-102',
		title: 'Weekly digest e-mail: group by project',
		status: 'todo',
		priority: 'low',
		type: 'improvement',
		assignees: ['u3'],
		tags: ['mail'],
		createdBy: 'u6',
		createdAt: at(-2)
	},
	{
		key: 'TRACKR-103',
		title: 'Upgrade Postgres to 17 on the dev compose',
		status: 'done',
		priority: 'none',
		type: 'chore',
		assignees: ['u2'],
		tags: ['infra'],
		createdBy: 'u2',
		createdAt: at(-6),
		timeLogs: [{ user: 'u2', at: at(-6), minutes: 35 }]
	},

	// ─── MOBILE ──────────────────────────────────────────────────────────────
	{
		key: 'MOBILE-14',
		title: 'Live Activity for a running work session',
		description:
			'Show the running session (project, elapsed time, current task) on the Lock Screen and in the Dynamic Island. Pause/stop from the Live Activity.\n\nDesign is in the Figma "Session" page.',
		status: 'in_progress',
		priority: 'high',
		type: 'feature',
		assignees: ['u0'],
		tags: ['ios', 'sessions'],
		due: wk(4, 17),
		start: wk(0),
		end: wk(4),
		estimate: 480,
		checklist: CL([
			['ActivityAttributes + content state', true],
			['Lock Screen layout', true],
			['Dynamic Island compact / expanded', false],
			['Pause / stop intents', false],
			['End activity on app kill', false]
		]),
		createdBy: 'u0',
		createdAt: at(-8, 9, 0),
		comments: [
			{
				user: 'u1',
				at: at(-4, 11, 0),
				text: 'Lock Screen layout looks great on the 15 Pro. On the SE the elapsed time wraps — can we drop the project name to one line?'
			},
			{
				user: 'u0',
				at: at(-4, 11, 30),
				text: 'Yes, truncating with the middle ellipsis. Will push tonight.'
			},
			{
				user: 'u6',
				at: at(-1, 8, 15),
				text: 'Can we ship this without the Dynamic Island part first? @[Max Muster](u0)'
			},
			{
				user: 'u0',
				at: at(-1, 8, 40),
				text: 'Yes — island is behind a flag, Lock Screen alone is already useful.'
			}
		],
		timeLogs: [
			{ user: 'u0', at: at(-7), minutes: 180, note: 'Attributes + Lock Screen' },
			{ user: 'u0', at: at(-4), minutes: 120, note: 'SE layout fixes' },
			{ user: 'u0', at: at(-1), minutes: 90, note: 'Intents scaffold' }
		],
		plans: [{ user: 'u0', day: wk(1) }]
	},
	{
		key: 'MOBILE-9',
		title: 'Offline snapshot store for tasks and tickets',
		description:
			'Persist the last successful sync to disk so the app opens instantly and works on the train. Reconcile on next sync; conflicts resolve server-wins.',
		status: 'in_review',
		priority: 'high',
		type: 'feature',
		assignees: ['u0', 'u2'],
		tags: ['ios', 'sync'],
		due: wk(3),
		estimate: 600,
		checklist: CL([
			['Snapshot codec (JSON, versioned)', true],
			['Write after every successful refresh', true],
			['Load on launch before first network call', true],
			['Migration for older snapshots', false]
		]),
		createdBy: 'u0',
		createdAt: at(-15),
		comments: [
			{
				user: 'u2',
				at: at(-2, 13, 0),
				text: 'Reviewed. One concern: snapshots for users with 2k+ tasks are ~4 MB — maybe gzip?'
			},
			{
				user: 'u0',
				at: at(-2, 13, 45),
				text: 'Good call. Measured: gzip takes it to 380 KB, decode adds 12 ms. Adding it.'
			}
		],
		timeLogs: [
			{ user: 'u0', at: at(-12), minutes: 240 },
			{ user: 'u0', at: at(-9), minutes: 180, note: 'Load-before-network' },
			{ user: 'u0', at: at(-2), minutes: 60, note: 'gzip' }
		],
		plans: [{ user: 'u0', day: wk(2) }]
	},
	{
		key: 'MOBILE-16',
		title: 'Push: deep-link into ticket conversation from notification',
		status: 'todo',
		priority: 'medium',
		type: 'feature',
		assignees: ['u0'],
		tags: ['ios', 'push'],
		due: wk(4),
		estimate: 180,
		createdBy: 'u6',
		createdAt: at(-5),
		comments: [
			{
				user: 'u6',
				at: at(-5, 10, 0),
				text: 'Tapping a "new ticket message" push should land directly on the conversation, not the ticket list.'
			}
		],
		plans: [{ user: 'u0', day: wk(3) }]
	},
	{
		key: 'MOBILE-12',
		title: 'Attachment picker: camera, photo library, files',
		description:
			'One sheet with three sources. Images get compressed to max 2048 px before upload.',
		status: 'todo',
		priority: 'medium',
		type: 'feature',
		assignees: ['u0', 'u1'],
		tags: ['ios', 'attachments'],
		due: at(9),
		estimate: 300,
		createdBy: 'u0',
		createdAt: at(-6),
		plans: [{ user: 'u0', day: wk(4) }]
	},
	{
		key: 'MOBILE-11',
		title: 'App Store screenshots + listing copy',
		description:
			'Need 6.7" and 6.1" sets. Screens: Home, My Week, Task detail, Ticket conversation, Chat, Notes. Dark mode only.',
		status: 'todo',
		priority: 'high',
		type: 'task',
		assignees: ['u1', 'u0'],
		tags: ['release', 'design'],
		due: wk(4, 12),
		estimate: 240,
		checklist: CL([
			['Seed demo workspace', true],
			['Home', false],
			['My Week', false],
			['Task detail', false],
			['Ticket conversation', false],
			['Chat', false],
			['Notes', false]
		]),
		createdBy: 'u1',
		createdAt: at(-3, 10, 0),
		comments: [
			{
				user: 'u1',
				at: at(-3, 10, 5),
				text: '@[Max Muster](u0) can you get me a demo account with realistic data? I want to shoot on the real app, not mockups.'
			},
			{
				user: 'u0',
				at: at(0, 8, 30),
				text: 'Done — log in as Max Muster, everything is populated.'
			}
		],
		plans: [
			{ user: 'u1', day: wk(3) },
			{ user: 'u0', day: wk(3) }
		]
	},
	{
		key: 'MOBILE-7',
		title: 'Server setup screen: validate URL before saving',
		status: 'done',
		priority: 'low',
		type: 'improvement',
		assignees: ['u0'],
		tags: ['ios'],
		createdBy: 'u0',
		createdAt: at(-20),
		timeLogs: [{ user: 'u0', at: at(-18), minutes: 50 }]
	},
	{
		key: 'MOBILE-8',
		title: 'Crash on rotate in ticket filters sheet',
		status: 'done',
		priority: 'urgent',
		type: 'bug',
		assignees: ['u0'],
		tags: ['ios', 'bug'],
		createdBy: 'u6',
		createdAt: at(-11),
		comments: [
			{
				user: 'u0',
				at: at(-10, 15, 0),
				text: 'Sheet detent state was reset on rotation while the picker was presenting. Fixed by hoisting the state.'
			}
		],
		timeLogs: [{ user: 'u0', at: at(-10), minutes: 95 }]
	},
	{
		key: 'MOBILE-17',
		title: "Widget: today's planned tasks",
		status: 'backlog',
		priority: 'low',
		type: 'feature',
		assignees: ['u0'],
		tags: ['ios', 'week'],
		createdBy: 'u0',
		createdAt: at(-2)
	},

	// ─── WEBIM ───────────────────────────────────────────────────────────────
	{
		key: 'WEBIM-7',
		title: 'Landing page hero copy — A/B variants',
		description:
			'Two hero drafts attached. A is bold/dark, B is the "plain numbers" angle. Sabine prefers B but wants A\'s CTA.',
		status: 'in_review',
		priority: 'medium',
		type: 'task',
		assignees: ['u5', 'u0'],
		tags: ['copy', 'landing'],
		due: wk(3, 12),
		estimate: 180,
		createdBy: 'u5',
		createdAt: at(-7),
		files: ['hero-variant-a.png', 'hero-variant-b.png'],
		comments: [
			{
				user: 'u5',
				at: at(-3, 10, 0),
				text: 'Both variants attached. @[Max Muster](u0) can you wire the A/B switch on the staging page so Sabine can toggle?'
			},
			{
				user: 'u0',
				at: at(-2, 9, 0),
				text: 'Switch is live: ?variant=a / ?variant=b. Analytics event fires on CTA click.'
			}
		],
		timeLogs: [
			{ user: 'u5', at: at(-4), minutes: 150, note: 'Copy + layout drafts' },
			{ user: 'u0', at: at(-2), minutes: 40, note: 'A/B switch' }
		],
		plans: [{ user: 'u0', day: wk(3) }]
	},
	{
		key: 'WEBIM-3',
		title: 'Q4 media plan and Google Ads proposal',
		status: 'done',
		priority: 'medium',
		type: 'task',
		assignees: ['u5'],
		tags: ['ads'],
		createdBy: 'u5',
		createdAt: at(-30),
		files: ['ads-media-plan-q4.pdf'],
		timeLogs: [{ user: 'u5', at: at(-25), minutes: 300 }]
	},
	{
		key: 'WEBIM-9',
		title: 'Conversion tracking: consent-mode v2',
		status: 'todo',
		priority: 'high',
		type: 'task',
		assignees: ['u6'],
		tags: ['ads', 'tracking'],
		due: at(6),
		estimate: 120,
		createdBy: 'u5',
		createdAt: at(-4),
		plans: [{ user: 'u6', day: wk(4) }]
	},

	// ─── MAJA ────────────────────────────────────────────────────────────────
	{
		key: 'MAJA-16',
		title: 'Provide the demo instance for Josie',
		status: 'done',
		priority: 'urgent',
		type: 'task',
		assignees: ['u1'],
		tags: [],
		createdBy: 'u1',
		createdAt: at(-14),
		timeLogs: [{ user: 'u1', at: at(-13), minutes: 60 }]
	},
	{
		key: 'MAJA-13',
		title: 'German translation of the demo is incomplete',
		status: 'paused',
		priority: 'low',
		type: 'bug',
		assignees: ['u1'],
		tags: ['i18n'],
		createdBy: 'u1',
		createdAt: at(-12)
	},
	{
		key: 'MAJA-22',
		title: 'Onboarding checklist for new demo accounts',
		status: 'todo',
		priority: 'medium',
		type: 'improvement',
		assignees: ['u4', 'u0'],
		tags: ['ux'],
		due: at(8),
		estimate: 120,
		createdBy: 'u4',
		createdAt: at(-6)
	}
];

// ── Tickets ────────────────────────────────────────────────────────────────

export type TicketStatus =
	| 'open'
	| 'in_progress'
	| 'waiting_on_customer'
	| 'waiting_on_agent'
	| 'paused'
	| 'resolved'
	| 'closed';

export type DemoTicketMessage = {
	user: UserKey;
	at: Date;
	text: string;
	internal?: boolean;
	files?: string[];
};
export type DemoTicketEvent = {
	at: Date;
	actor: UserKey;
	internal?: boolean;
	meta:
		| { event: 'status_changed'; from: string; to: string }
		| { event: 'priority_changed'; from: string; to: string }
		| { event: 'assigned'; added: UserKey[]; removed: UserKey[] };
};

export type DemoTicket = {
	key: string; // "SIWEB-7"
	subject: string;
	description: string;
	status: TicketStatus;
	priority: 'low' | 'medium' | 'high' | 'urgent';
	category: 'general' | 'billing' | 'technical_issue' | 'feature_request';
	channel: 'web_form' | 'email' | 'chat' | 'api';
	customer: UserKey;
	assignees: UserKey[];
	tags?: string[];
	checklist?: { text: string; done: boolean }[];
	createdAt: Date;
	files?: string[];
	messages: DemoTicketMessage[];
	events?: DemoTicketEvent[];
	satisfaction?: number;
	/** Users who pinned this ticket. */
	pinnedBy?: UserKey[];
};

export const TICKETS: DemoTicket[] = [
	{
		key: 'SIWEB-7',
		subject: 'Checkout: "Retry payment" does nothing after an error',
		description:
			'Hello,\n\nsince Monday a few of our customers report that after a payment error the retry button is greyed out and nothing happens. One of them sent me the attached screenshot. We lost at least two orders because of this.\n\nCould you look into this urgently?\n\nBest,\nRenée',
		status: 'in_progress',
		priority: 'urgent',
		category: 'technical_issue',
		channel: 'email',
		customer: 'c1',
		assignees: ['u0', 'u2'],
		tags: ['checkout', 'prod'],
		checklist: CL([
			['Reproduce', true],
			['Fix deployed to staging', true],
			['Customer confirmed', false]
		]),
		createdAt: at(-4, 8, 42),
		files: ['checkout-error.png'],
		pinnedBy: ['u0'],
		messages: [
			{
				user: 'u0',
				at: at(-4, 9, 5),
				text: "Hi Renée, thanks for the screenshot — that console line already tells us a lot. We can reproduce it and are on it today. I'll keep you posted here."
			},
			{
				user: 'u0',
				at: at(-4, 9, 8),
				text: 'Converted to ~[SIWEB-52](task:SIWEB-52). Leon is looking at the state machine, I take the test.',
				internal: true
			},
			{
				user: 'c1',
				at: at(-4, 10, 30),
				text: 'Thank you! Two more customers wrote in this morning. Is there a workaround we can tell them?'
			},
			{
				user: 'u2',
				at: at(-4, 11, 0),
				text: "For now: reloading the checkout page and paying again works (the cart is kept). We'll have the real fix on staging tomorrow."
			},
			{
				user: 'u2',
				at: at(-2, 16, 40),
				text: 'Fix is on staging. Retry now re-submits with the same order reference so nobody gets charged twice. Could you or Pieter do a quick test there before we ship to production?'
			},
			{
				user: 'c1',
				at: at(-1, 9, 15),
				text: 'Pieter tested it this morning — works. Please deploy 🙏'
			},
			{
				user: 'u0',
				at: at(0, 8, 20),
				text: "Production deploy is planned for Thursday morning with the SKU fix. I'll close this ticket once it's live."
			}
		],
		events: [
			{
				at: at(-4, 9, 0),
				actor: 'u0',
				meta: { event: 'assigned', added: ['u0', 'u2'], removed: [] }
			},
			{
				at: at(-4, 9, 2),
				actor: 'u0',
				meta: { event: 'priority_changed', from: 'high', to: 'urgent' }
			},
			{
				at: at(-4, 9, 3),
				actor: 'u0',
				meta: { event: 'status_changed', from: 'open', to: 'in_progress' }
			}
		]
	},
	{
		key: 'SIWEB-9',
		subject: 'Stock levels not updating for some articles',
		description:
			"A handful of articles (e.g. SKU-11087, SKU-11090) still show yesterday's stock even though the ERP export ran. Log excerpt:\n\n2026-09-01 02:14:03 sync: skipped 37 rows (missing EAN)\n\nIs that expected?",
		status: 'waiting_on_agent',
		priority: 'high',
		category: 'technical_issue',
		channel: 'web_form',
		customer: 'c2',
		assignees: ['u0'],
		tags: ['sync'],
		createdAt: at(-1, 8, 10),
		messages: [
			{
				user: 'u4',
				at: at(-1, 8, 30),
				text: 'Not expected — the job should fall back to the article id. Created ~[SIWEB-55](task:SIWEB-55) for Max.',
				internal: true
			},
			{
				user: 'u4',
				at: at(-1, 8, 33),
				text: "Hi Pieter, thanks — that's a bug on our side. Articles without an EAN are skipped by the nightly sync. Max will fix the fallback this week; in the meantime I'll trigger a manual update for the affected 37 articles."
			},
			{
				user: 'c2',
				at: at(-1, 13, 0),
				text: 'Thanks. Can you send the list of the 37 articles so we can add the EANs on our side too?'
			}
		],
		events: [
			{ at: at(-1, 8, 31), actor: 'u4', meta: { event: 'assigned', added: ['u0'], removed: [] } },
			{
				at: at(-1, 13, 1),
				actor: 'c2',
				meta: { event: 'status_changed', from: 'open', to: 'waiting_on_agent' }
			}
		]
	},
	{
		key: 'SIWEB-6',
		subject: 'Invoice 2026-08-0417: prorated seats charged twice?',
		description:
			'The August invoice lists the 2 extra seats prorated AND in the full 6-seat line. Attached with the disputed amount marked. Please check.',
		status: 'resolved',
		priority: 'medium',
		category: 'billing',
		channel: 'email',
		customer: 'c1',
		assignees: ['u4'],
		tags: ['billing'],
		createdAt: at(-6, 11, 20),
		files: ['invoice-2026-08-0417.png'],
		satisfaction: 5,
		messages: [
			{
				user: 'u4',
				at: at(-6, 14, 0),
				text: "Hi Renée, you're right — the two seats added on the 18th were prorated correctly but the base line should have been 4 seats, not 6. I've issued a credit note over €24,00 + VAT; the corrected invoice is on its way."
			},
			{ user: 'c1', at: at(-5, 9, 0), text: 'Received, thank you for the quick fix!' },
			{
				user: 'u4',
				at: at(-5, 9, 10),
				text: 'Resolving. Billing script fix is TRACKR-98.',
				internal: true
			}
		],
		events: [
			{ at: at(-6, 13, 50), actor: 'u4', meta: { event: 'assigned', added: ['u4'], removed: [] } },
			{
				at: at(-5, 9, 12),
				actor: 'u4',
				meta: { event: 'status_changed', from: 'in_progress', to: 'resolved' }
			}
		]
	},
	{
		key: 'SIWEB-10',
		subject: 'Feature request: export price list as Excel',
		description:
			'Our sales team asks for a monthly Excel export of the whole price list incl. the new "Discontinued" flag once it exists.',
		status: 'open',
		priority: 'low',
		category: 'feature_request',
		channel: 'web_form',
		customer: 'c2',
		assignees: [],
		tags: ['export'],
		createdAt: at(0, 7, 55),
		messages: []
	},
	{
		key: 'SIWEB-4',
		subject: 'Admin login loops back to the login page on Safari',
		description:
			'On Safari 18 the admin login redirects back to /login after entering the password. Chrome works.',
		status: 'closed',
		priority: 'high',
		category: 'technical_issue',
		channel: 'chat',
		customer: 'c1',
		assignees: ['u2'],
		tags: ['auth', 'safari'],
		createdAt: at(-20, 10, 0),
		satisfaction: 4,
		messages: [
			{
				user: 'u2',
				at: at(-20, 10, 30),
				text: "Reproduced — Safari drops the session cookie because SameSite wasn't set. Fix goes out tonight."
			},
			{ user: 'c1', at: at(-19, 8, 0), text: 'Works now. Thanks!' }
		],
		events: [
			{
				at: at(-19, 8, 5),
				actor: 'u2',
				meta: { event: 'status_changed', from: 'in_progress', to: 'resolved' }
			},
			{
				at: at(-12, 9, 0),
				actor: 'u2',
				meta: { event: 'status_changed', from: 'resolved', to: 'closed' }
			}
		]
	},
	{
		key: 'WEBIM-3',
		subject: 'Landing page: hero image blurry on retina',
		description:
			'The hero image on the staging landing page looks soft on my MacBook. Can we get a 2x asset?',
		status: 'waiting_on_customer',
		priority: 'medium',
		category: 'technical_issue',
		channel: 'chat',
		customer: 'c3',
		assignees: ['u0', 'u5'],
		tags: ['landing'],
		createdAt: at(-3, 15, 30),
		pinnedBy: ['u0'],
		messages: [
			{
				user: 'u0',
				at: at(-3, 16, 0),
				text: "Hi Sabine — the current asset is 1440 px wide; I've swapped in a 2880 px version on staging. Could you check on your MacBook and confirm?"
			},
			{
				user: 'u5',
				at: at(-3, 16, 5),
				text: 'Also asked her which variant she prefers, see WEBIM-7.',
				internal: true
			}
		],
		events: [
			{
				at: at(-3, 15, 45),
				actor: 'u5',
				meta: { event: 'assigned', added: ['u0', 'u5'], removed: [] }
			},
			{
				at: at(-3, 16, 1),
				actor: 'u0',
				meta: { event: 'status_changed', from: 'open', to: 'waiting_on_customer' }
			}
		]
	},
	{
		key: 'WEBIM-4',
		subject: 'Access for our new campaign manager',
		description:
			'Please add tim.brand@webim.agency as a member so he can see tickets and the chat.',
		status: 'open',
		priority: 'medium',
		category: 'general',
		channel: 'email',
		customer: 'c3',
		assignees: ['u4'],
		tags: ['access'],
		createdAt: at(0, 9, 12),
		messages: [],
		events: [
			{ at: at(0, 9, 20), actor: 'u4', meta: { event: 'assigned', added: ['u4'], removed: [] } }
		]
	},
	{
		key: 'MAJA-2',
		subject: 'Can we brand the demo with our logo?',
		description:
			"Before showing Trackr to our own clients we'd like our logo in the sidebar and the login page. Is that possible on the demo?",
		status: 'in_progress',
		priority: 'low',
		category: 'feature_request',
		channel: 'web_form',
		customer: 'c4',
		assignees: ['u1'],
		tags: ['demo', 'branding'],
		createdAt: at(-7, 12, 0),
		messages: [
			{
				user: 'u1',
				at: at(-7, 13, 30),
				text: "Hi Josie — yes! Send me an SVG or a PNG (min. 512 px) and I'll set it up on your instance."
			},
			{
				user: 'c4',
				at: at(-6, 10, 0),
				text: 'Here you go. Dark background please.',
				files: ['trackr-logo.png']
			},
			{
				user: 'u1',
				at: at(-5, 9, 0),
				text: "Looks great on dark. It's live on your demo — let me know if the spacing feels off."
			}
		],
		events: [
			{
				at: at(-7, 13, 0),
				actor: 'u1',
				meta: { event: 'status_changed', from: 'open', to: 'in_progress' }
			}
		]
	},
	{
		key: 'MAJA-3',
		subject: 'Where do I find the weekly plan on mobile?',
		description: "I installed the TestFlight build but can't find the weekly plan view.",
		status: 'resolved',
		priority: 'low',
		category: 'general',
		channel: 'chat',
		customer: 'c4',
		assignees: ['u0'],
		createdAt: at(-2, 17, 0),
		satisfaction: 5,
		messages: [
			{
				user: 'u0',
				at: at(-2, 17, 20),
				text: 'It\'s the calendar tab at the bottom ("My Week"). Only tasks you\'ve planned show up per day; unplanned ones sit at the bottom.'
			},
			{ user: 'c4', at: at(-2, 17, 25), text: 'Found it — perfect, thanks!' }
		],
		events: [
			{
				at: at(-2, 17, 30),
				actor: 'u0',
				meta: { event: 'status_changed', from: 'open', to: 'resolved' }
			}
		]
	}
];

// ── Chat (org-scoped threads) ──────────────────────────────────────────────

export type DemoTag = { org: 'internal' | OrgKey; label: string; color: string };

export const TAGS: DemoTag[] = [
	{ org: 'internal', label: 'Release', color: '#7fc8a9' },
	{ org: 'internal', label: 'Infra', color: '#7a9cf0' },
	{ org: 'internal', label: 'Design', color: '#c08bd6' },
	{ org: 'internal', label: 'Random', color: '#e9c46a' },
	{ org: 'SIWEB', label: 'Shop', color: '#e07a5f' },
	{ org: 'SIWEB', label: 'Admin', color: '#7a9cf0' },
	{ org: 'SIWEB', label: 'Billing', color: '#e9c46a' },
	{ org: 'WEBIM', label: 'Landing', color: '#7fc8a9' },
	{ org: 'WEBIM', label: 'Ads', color: '#f0a85c' },
	{ org: 'MAJA', label: 'Demo', color: '#c08bd6' }
];

export type DemoChatMessage = { user: UserKey; at: Date; text: string; files?: string[] };
export type DemoThread = {
	id: string;
	org: 'internal' | OrgKey;
	title: string;
	createdBy: UserKey;
	tags: string[];
	status?: 'open' | 'resolved';
	messages: DemoChatMessage[];
};

export const THREADS: DemoThread[] = [
	{
		id: 'int-release-1-9',
		org: 'internal',
		title: 'Release 1.9 — Thursday morning',
		createdBy: 'u6',
		tags: ['Release'],
		messages: [
			{
				user: 'u6',
				at: at(-1, 17, 0),
				text: 'Plan for Thursday: SIWEB checkout fix + SKU dedupe + webhook backoff. Freeze tomorrow evening. Anything else that must go in?'
			},
			{
				user: 'u0',
				at: at(-1, 17, 12),
				text: 'Webhook backoff is in, notify-owner part slips to 1.9.1. Fine by me.'
			},
			{
				user: 'u2',
				at: at(-1, 17, 30),
				text: 'Checkout PR #412 needs one more review — @[Max Muster](u0) can you look tonight?'
			},
			{ user: 'u0', at: at(-1, 18, 5), text: 'Reviewed & approved 👍' },
			{
				user: 'u3',
				at: at(0, 9, 2),
				text: 'Deleted-tab (SIWEB-15) is ready too if we want it. Small and isolated.'
			},
			{ user: 'u6', at: at(0, 9, 10), text: 'Take it. Freeze at 18:00 today then.' }
		]
	},
	{
		id: 'int-whiteboard',
		org: 'internal',
		title: 'Whiteboard from the mobile sync',
		createdBy: 'u0',
		tags: ['Design'],
		messages: [
			{
				user: 'u0',
				at: at(-2, 12, 30),
				text: "Photo of the whiteboard from today's mobile sync — the open question is whether pushes go out for every chat message or only on mention.",
				files: ['whiteboard-sync.jpg']
			},
			{
				user: 'u1',
				at: at(-2, 12, 45),
				text: 'Mention-only by default, with a per-thread "follow" toggle. Otherwise the phone never stops buzzing.'
			},
			{ user: 'u6', at: at(-2, 13, 0), text: '+1. That matches what we do for tags already.' }
		]
	},
	{
		id: 'int-postgres',
		org: 'internal',
		title: 'Postgres 17 on dev compose',
		createdBy: 'u2',
		tags: ['Infra'],
		status: 'resolved',
		messages: [
			{
				user: 'u2',
				at: at(-6, 10, 0),
				text: 'Bumped the dev compose to Postgres 17. You need to recreate the volume: `docker compose down -v && bun run services:start`.'
			},
			{ user: 'u3', at: at(-6, 10, 20), text: 'Worked here, thanks.' }
		]
	},
	{
		id: 'int-lunch',
		org: 'internal',
		title: 'Team lunch Friday?',
		createdBy: 'u5',
		tags: ['Random'],
		messages: [
			{ user: 'u5', at: at(0, 10, 40), text: 'Friday 12:30, the Vietnamese place? 🍜' },
			{ user: 'u4', at: at(0, 10, 42), text: 'In.' },
			{ user: 'u0', at: at(0, 10, 50), text: 'In, if the release is out by then 😅' }
		]
	},
	{
		id: 'siweb-weekly',
		org: 'SIWEB',
		title: 'Weekly sync notes & questions',
		createdBy: 'c1',
		tags: ['Shop'],
		messages: [
			{
				user: 'c1',
				at: at(-8, 9, 0),
				text: 'Hi team — quick question before Thursday\'s call: is the "Discontinued" flag still planned for September?'
			},
			{
				user: 'u4',
				at: at(-8, 9, 30),
				text: "Yes, it's scheduled for the week after next. Tomás will bring a mockup to the call."
			},
			{
				user: 'c2',
				at: at(-1, 14, 10),
				text: 'The SKU duplicate fix looks good on staging, thanks @[Max Muster](u0)!'
			},
			{
				user: 'u0',
				at: at(-1, 14, 20),
				text: 'Great — production on Thursday together with the checkout fix.'
			}
		]
	},
	{
		id: 'siweb-billing',
		org: 'SIWEB',
		title: 'Invoice question August',
		createdBy: 'c1',
		tags: ['Billing'],
		status: 'resolved',
		messages: [
			{
				user: 'c1',
				at: at(-6, 11, 0),
				text: 'I think the August invoice has the extra seats twice — opened a ticket with the details.'
			},
			{
				user: 'u4',
				at: at(-6, 14, 5),
				text: 'Confirmed and corrected, see the ticket. Sorry about that!'
			}
		]
	},
	{
		id: 'webim-landing',
		org: 'WEBIM',
		title: 'Landing page feedback round 2',
		createdBy: 'c3',
		tags: ['Landing'],
		messages: [
			{
				user: 'c3',
				at: at(-3, 15, 0),
				text: 'Looked at both hero variants. B wins on message, but I\'d keep the "Book a call" button from A.'
			},
			{
				user: 'u5',
				at: at(-3, 15, 20),
				text: "Noted — we'll merge them into a variant C by Thursday."
			},
			{
				user: 'c3',
				at: at(0, 11, 0),
				text: 'Also: the hero image looks blurry on my MacBook, opened a ticket.'
			}
		]
	},
	{
		id: 'maja-demo',
		org: 'MAJA',
		title: 'Demo instance questions',
		createdBy: 'c4',
		tags: ['Demo'],
		messages: [
			{
				user: 'c4',
				at: at(-5, 10, 0),
				text: 'The logo looks great, thanks Maja! Next question: can our clients get a read-only login?'
			},
			{ user: 'u1', at: at(-5, 10, 30), text: "Yes — project viewers. I'll show you on Friday." }
		]
	}
];

// ── Notes ──────────────────────────────────────────────────────────────────

export type DemoNote = {
	id: string;
	kind: 'quick' | 'meeting';
	title: string;
	icon: string;
	owner: UserKey;
	pinned?: boolean;
	meetingDate?: Date;
	project?: ProjectKey;
	template?: 'tmpl-standup' | 'tmpl-one-on-one' | 'tmpl-retro';
	html: string;
	updatedAt: Date;
	files?: string[];
};

const task = (items: [string, boolean][]) =>
	`<ul data-type="taskList">${items.map(([t, d]) => `<li data-type="taskItem" data-checked="${d}"><p>${t}</p></li>`).join('')}</ul>`;

export const NOTES: DemoNote[] = [
	{
		id: 'max-release',
		kind: 'quick',
		title: 'Release 1.9 checklist',
		icon: 'rocket',
		owner: 'u0',
		pinned: true,
		updatedAt: at(0, 9, 30),
		html:
			'<h2>Before freeze (today 18:00)</h2>' +
			task([
				['Review #412 checkout retry', true],
				['Merge webhook backoff', true],
				['Deleted tab (SIWEB-15) — Ines', false],
				['Changelog draft', false]
			]) +
			'<h2>Thursday</h2>' +
			task([
				['Deploy 07:30', false],
				['Smoke test checkout on prod', false],
				['Close SIWEB-7 + ping Renée', false]
			]) +
			'<blockquote><p>Rollback plan: revert the deploy tag, DB migration is additive.</p></blockquote>'
	},
	{
		id: 'max-ideas',
		kind: 'quick',
		title: 'Mobile ideas',
		icon: 'lightbulb',
		owner: 'u0',
		updatedAt: at(-2, 21, 15),
		html:
			'<ul><li><p>Swipe right on a task card → plan for today</p></li><li><p>Long-press project → start session (done)</p></li><li><p>Widget with today\'s plan (MOBILE-17)</p></li><li><p>Haptic when a session passes 4h — "take a break"</p></li></ul>' +
			'<p>Question for Maja: does the Lock Screen activity need the project colour?</p>'
	},
	{
		id: 'max-onboarding',
		kind: 'quick',
		title: 'Onboarding notes — Siweb admin',
		icon: 'book',
		owner: 'u0',
		updatedAt: at(-9, 16, 0),
		html:
			'<h2>Access</h2><p>Staging admin: <code>admin@staging.siweb.de</code>, password in 1Password (Siweb vault).</p>' +
			'<h2>Gotchas</h2><ul><li><p>Nightly sync runs 02:00 CET, logs in <code>sync.log</code></p></li><li><p>Articles without EAN are skipped (SIWEB-55)</p></li><li><p>Payment gateway sandbox flag: <code>PG_FAIL=1</code></p></li></ul>'
	},
	{
		id: 'meet-standup',
		kind: 'meeting',
		title: 'Standup',
		icon: 'list',
		owner: 'u6',
		meetingDate: at(0, 9, 0),
		project: 'TRACKR',
		template: 'tmpl-standup',
		updatedAt: at(0, 9, 25),
		html:
			'<h2>Yesterday</h2><ul><li><p>Max — webhook backoff, review #412</p></li><li><p>Leon — checkout retry fix, PR up</p></li><li><p>Ines — deleted tab, ready for review</p></li></ul>' +
			'<h2>Today</h2><ul><li><p>Max — Playwright test for 502 path, week-view DnD review</p></li><li><p>Leon — idempotency key reuse</p></li><li><p>Yusuf — freeze at 18:00, changelog</p></li></ul>' +
			'<h2>Blockers</h2><ul><li><p>None — staging DB was slow this morning, resolved.</p></li></ul>'
	},
	{
		id: 'meet-siweb-weekly',
		kind: 'meeting',
		title: 'Siweb weekly',
		icon: 'users',
		owner: 'u4',
		meetingDate: at(-1, 14, 0),
		project: 'SIWEB',
		updatedAt: at(-1, 15, 5),
		html:
			'<p><strong>Attendees:</strong> Renée, Pieter, Tomás, Max</p>' +
			'<h2>Topics</h2><ul><li><p>Checkout retry bug — fix on staging, prod Thursday</p></li><li><p>SKU duplicates — verified by Pieter ✅</p></li><li><p>Stock sync skipping articles without EAN → new ticket SIWEB-9</p></li><li><p>Discontinued flag: mockup next week</p></li></ul>' +
			'<h2>Action items</h2>' +
			task([
				['Max: send list of 37 affected articles to Pieter', false],
				['Tomás: Discontinued mockup', false],
				['Renée: confirm Excel export requirements', false]
			])
	},
	{
		id: 'meet-mobile-sync',
		kind: 'meeting',
		title: 'Mobile sync',
		icon: 'users',
		owner: 'u0',
		meetingDate: at(-2, 11, 0),
		project: 'MOBILE',
		updatedAt: at(-2, 12, 40),
		html:
			'<p><strong>Attendees:</strong> Max, Maja, Yusuf, Leon</p>' +
			'<h2>Decisions</h2><ul><li><p>Live Activity ships without Dynamic Island first (flagged)</p></li><li><p>Push for chat: mention-only by default</p></li><li><p>Offline snapshots get gzip</p></li></ul>' +
			'<h2>Action items</h2>' +
			task([
				['Max: demo workspace for screenshots', true],
				['Maja: App Store screenshot frames', false],
				['Leon: review snapshot migration', false]
			]),
		files: ['whiteboard-sync.jpg']
	},
	{
		id: 'meet-retro',
		kind: 'meeting',
		title: 'Retro — August',
		icon: 'refresh',
		owner: 'u6',
		meetingDate: at(-7, 16, 0),
		project: 'TRACKR',
		template: 'tmpl-retro',
		updatedAt: at(-7, 17, 10),
		html:
			'<h2>What went well</h2><ul><li><p>Webhooks shipped on time</p></li><li><p>Ticket → task conversion is used daily by Tomás</p></li></ul>' +
			"<h2>What didn't</h2><ul><li><p>Too many urgent tickets landed on Max in the same week</p></li><li><p>Staging DB slow, nobody owned it</p></li></ul>" +
			'<h2>Action items</h2>' +
			task([
				['Rotate ticket triage weekly (Tomás owns the schedule)', true],
				['Yusuf: staging DB sizing', false]
			])
	},
	{
		id: 'meet-1on1',
		kind: 'meeting',
		title: '1:1 Max / Yusuf',
		icon: 'users',
		owner: 'u6',
		meetingDate: at(2, 15, 0),
		template: 'tmpl-one-on-one',
		updatedAt: at(-1, 9, 0),
		html:
			'<h2>Talking points</h2><ul><li><p>Mobile roadmap Q4</p></li><li><p>On-call rotation</p></li></ul><h2>Feedback</h2><ul><li><p></p></li></ul><h2>Action items</h2>' +
			task([['', false]])
	}
];

// ── Wiki ───────────────────────────────────────────────────────────────────

export type WikiBlock =
	| { kind: 'h1' | 'h2' | 'p' | 'callout'; text: string }
	| { kind: 'list'; items: string[] }
	| { kind: 'tasks'; items: [string, boolean][] }
	| { kind: 'code'; text: string };

export type DemoWikiPage = {
	id: string;
	parent: string | null;
	title: string;
	icon: string;
	author: UserKey;
	body: WikiBlock[];
	updatedAt: Date;
};

export const WIKI_PAGES: DemoWikiPage[] = [
	{
		id: 'w-home',
		parent: null,
		title: 'Welcome to Trackr',
		icon: 'book',
		author: 'u6',
		updatedAt: at(-1),
		body: [
			{ kind: 'h1', text: 'Welcome to the Trackr workspace' },
			{
				kind: 'p',
				text: 'This is our shared brain. Anything that helps the team move faster — playbooks, decisions, onboarding — belongs here.'
			},
			{
				kind: 'callout',
				text: 'Edit any page inline. Slash-commands ( / ) drop in headings, callouts, tables, code blocks.'
			},
			{ kind: 'h2', text: 'Start here' },
			{
				kind: 'list',
				items: [
					'New hire? See Engineering → Onboarding.',
					'On support this week? Read the Support playbook.',
					'Shipping? Follow the Release checklist.'
				]
			},
			{ kind: 'h2', text: 'Conventions' },
			{ kind: 'p', text: 'Keep page titles short. Link generously. Archive instead of delete.' }
		]
	},
	{
		id: 'w-eng',
		parent: null,
		title: 'Engineering',
		icon: 'folder',
		author: 'u2',
		body: [],
		updatedAt: at(-3)
	},
	{
		id: 'w-onboard',
		parent: 'w-eng',
		title: 'Onboarding',
		icon: 'book',
		author: 'u2',
		updatedAt: at(-12),
		body: [
			{ kind: 'h1', text: 'Engineering Onboarding' },
			{
				kind: 'p',
				text: 'Two weeks. End state: you can ship a small feature end-to-end with confidence.'
			},
			{ kind: 'h2', text: 'Week 1 — get oriented' },
			{
				kind: 'list',
				items: [
					'Day 1 · Laptop setup, repos, secrets, code of conduct sign-off.',
					'Day 2 · Architecture walkthrough with your buddy.',
					'Day 3-4 · First PR — pick a "good first issue".',
					'Day 5 · Demo what you shipped at the Friday review.'
				]
			},
			{ kind: 'h2', text: 'Week 2 — own a slice' },
			{
				kind: 'list',
				items: [
					'Take on a real task from the current sprint.',
					'Pair with someone outside your team for half a day.',
					'Write up one thing you learned for the wiki.'
				]
			},
			{
				kind: 'callout',
				text: 'Stuck? You are encouraged to ask. Avoid burning more than 30 min before reaching out.'
			}
		]
	},
	{
		id: 'w-ship',
		parent: 'w-eng',
		title: 'How we ship',
		icon: 'book',
		author: 'u6',
		updatedAt: at(-5),
		body: [
			{ kind: 'h1', text: 'How we ship' },
			{ kind: 'p', text: 'Small batches, fast feedback, kind code review.' },
			{ kind: 'h2', text: 'The flow' },
			{
				kind: 'list',
				items: [
					'Pick (or create) a task in Trackr. Status → In Progress.',
					'Branch from main. Open the PR early as a draft.',
					'Ask for review when CI is green.',
					'Squash-merge once approved. Status → Done.'
				]
			},
			{ kind: 'h2', text: 'Standards' },
			{
				kind: 'list',
				items: [
					'PRs under 400 lines whenever possible.',
					'Tests for non-trivial logic. Snapshot tests are a smell.',
					'No magic constants — name everything.'
				]
			}
		]
	},
	{
		id: 'w-release',
		parent: 'w-eng',
		title: 'Release checklist',
		icon: 'book',
		author: 'u0',
		updatedAt: at(-1),
		body: [
			{ kind: 'h1', text: 'Release checklist' },
			{ kind: 'p', text: 'We release Thursday mornings. Freeze is Wednesday 18:00.' },
			{ kind: 'h2', text: 'Day before' },
			{
				kind: 'tasks',
				items: [
					['All PRs for the release merged to main', false],
					['Changelog drafted in the release thread', false],
					['Staging smoke test: login, create task, ticket reply, chat', false]
				]
			},
			{ kind: 'h2', text: 'Release morning' },
			{
				kind: 'tasks',
				items: [
					['Tag: git tag v1.x.y && git push --tags', false],
					['Watch the worker logs for 10 minutes', false],
					['Post in #release + client chats if customer-facing', false]
				]
			},
			{ kind: 'h2', text: 'Rollback' },
			{ kind: 'code', text: 'docker compose pull web@v1.8.4\ndocker compose up -d web' },
			{ kind: 'callout', text: 'Migrations are always additive. Never roll back the database.' }
		]
	},
	{
		id: 'w-mobile',
		parent: 'w-eng',
		title: 'Mobile app architecture',
		icon: 'book',
		author: 'u0',
		updatedAt: at(-4),
		body: [
			{ kind: 'h1', text: 'Trackr Mobile (iOS)' },
			{
				kind: 'p',
				text: 'SwiftUI app talking to /api/v1 with a bearer token. Snapshot store on disk, sync engine reconciles on foreground and pull-to-refresh.'
			},
			{ kind: 'h2', text: 'Layers' },
			{
				kind: 'list',
				items: [
					'Networking — APIClient, DTOs, Mappers',
					'Models — AppModel is the single observable source of truth',
					'Views — one file per screen, sheets for create/edit',
					'Services — SessionStore (work sessions), Live Activity bridge'
				]
			},
			{ kind: 'h2', text: 'Invariants' },
			{
				kind: 'list',
				items: [
					'Deep links always resolve through AppModel.open(route:)',
					'Never block the UI on network — render the snapshot first',
					'Attachments are uploaded after the parent entity exists'
				]
			}
		]
	},
	{
		id: 'w-support',
		parent: null,
		title: 'Support',
		icon: 'folder',
		author: 'u4',
		body: [],
		updatedAt: at(-2)
	},
	{
		id: 'w-support-playbook',
		parent: 'w-support',
		title: 'Support playbook',
		icon: 'book',
		author: 'u4',
		updatedAt: at(-2),
		body: [
			{ kind: 'h1', text: 'Support playbook' },
			{
				kind: 'p',
				text: 'One person owns triage each week (see the rotation below). Everyone answers tickets assigned to them within one business day.'
			},
			{ kind: 'h2', text: 'Triage' },
			{
				kind: 'list',
				items: [
					'Set priority + category within 2h of arrival.',
					'Urgent = customer cannot work or loses money. Ping the channel.',
					'Convert to a task once engineering work is needed — keep the ticket open until the customer confirms.'
				]
			},
			{ kind: 'h2', text: 'Rotation' },
			{ kind: 'list', items: ['This week: Tomás', 'Next week: Max', 'Then: Ines'] },
			{ kind: 'h2', text: 'Tone' },
			{
				kind: 'callout',
				text: 'Short, warm, concrete. Say what happens next and when. Never leave a ticket without a next step.'
			}
		]
	},
	{
		id: 'w-design',
		parent: null,
		title: 'Design',
		icon: 'folder',
		author: 'u1',
		body: [],
		updatedAt: at(-7)
	},
	{
		id: 'w-tokens',
		parent: 'w-design',
		title: 'Design tokens',
		icon: 'book',
		author: 'u1',
		updatedAt: at(-7),
		body: [
			{ kind: 'h1', text: 'Design tokens' },
			{
				kind: 'p',
				text: 'Source of truth for color, type, spacing. If a value needs a new name, propose it here first.'
			},
			{ kind: 'h2', text: 'Color' },
			{
				kind: 'p',
				text: 'Warm-toned neutrals on top of a coral accent. We avoid pure black; the base is oklch(0.16 0.005 270).'
			},
			{
				kind: 'code',
				text: '--accent: #e07a5f;\n--bg: #17171c;\n--panel: #202027;\n--text: #e8e8ec;'
			}
		]
	},
	{
		id: 'w-people',
		parent: null,
		title: 'People & Ops',
		icon: 'folder',
		author: 'u4',
		body: [],
		updatedAt: at(-14)
	},
	{
		id: 'w-pto',
		parent: 'w-people',
		title: 'Time off & holidays',
		icon: 'book',
		author: 'u4',
		updatedAt: at(-14),
		body: [
			{ kind: 'h1', text: 'Time off & holidays' },
			{
				kind: 'p',
				text: 'Unlimited time off with a minimum: please take at least 4 weeks per year. Block your calendar early so others can plan around you.'
			},
			{ kind: 'callout', text: 'Statutory holidays follow your country of residence.' }
		]
	}
];

// ── Project-level comments (activity feed) ─────────────────────────────────

export const PROJECT_COMMENTS: { project: ProjectKey; user: UserKey; at: Date; text: string }[] = [
	{
		project: 'SIWEB',
		user: 'u2',
		at: at(-1, 17, 40),
		text: 'Reminder: prod deploy Thursday 07:30. Checkout + SKU + deleted tab.'
	},
	{
		project: 'MOBILE',
		user: 'u0',
		at: at(-3, 18, 0),
		text: 'TestFlight build 42 is out — Live Activity is in, tell me how it looks on your devices.'
	},
	{
		project: 'WEBIM',
		user: 'u5',
		at: at(-3, 15, 30),
		text: "Sabine wants variant C = B's copy with A's CTA. Aiming for Thursday."
	}
];

// Convenience for the seeder.
export const WEEK_LABEL = `${ymd(wk(0))} → ${ymd(wk(4))}`;
