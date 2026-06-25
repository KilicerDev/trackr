// Demo fixtures consumed by the seeder (`bun run db:seed --all`). These used to
// live in src/lib/data.ts and leak into the app at runtime; they now exist only
// here, as the source for optionally populating a local/dev database.

import type { Project, ProjectId, Task, User, WikiPage } from '../../../src/lib/types';

export const USERS: User[] = [
	{
		id: 'u1',
		name: 'Maja Schmidt',
		initials: 'MS',
		color: '#e0775f',
		email: 'maja.schmidt@trackr.dev',
		role: 'admin',
		team: 'Design',
		status: 'active',
		lastSeen: '2 hours ago',
		joinedAt: '2024-08-14',
		mfa: true,
		tasks: 8
	},
	{
		id: 'u2',
		name: 'Leon Vogel',
		initials: 'LV',
		color: '#7a9cf0',
		email: 'leon.vogel@trackr.dev',
		role: 'member',
		team: 'Engineering',
		status: 'active',
		lastSeen: '15 minutes ago',
		joinedAt: '2024-09-02',
		mfa: true,
		tasks: 12
	},
	{
		id: 'u3',
		name: 'Ines Krüger',
		initials: 'IK',
		color: '#7fc8a9',
		email: 'ines.krueger@trackr.dev',
		role: 'member',
		team: 'Engineering',
		status: 'active',
		lastSeen: 'Online now',
		joinedAt: '2025-01-21',
		mfa: true,
		tasks: 5
	},
	{
		id: 'u4',
		name: 'Tomás Reyes',
		initials: 'TR',
		color: '#c08bd6',
		email: 'tomas.reyes@trackr.dev',
		role: 'member',
		team: 'Operations',
		status: 'active',
		lastSeen: 'Yesterday',
		joinedAt: '2025-02-08',
		mfa: false,
		tasks: 3
	},
	{
		id: 'u5',
		name: 'Hana Weiss',
		initials: 'HW',
		color: '#e9c46a',
		email: 'hana.weiss@trackr.dev',
		role: 'member',
		team: 'Marketing',
		status: 'active',
		lastSeen: '4 days ago',
		joinedAt: '2024-11-19',
		mfa: true,
		tasks: 6
	},
	{
		id: 'u6',
		name: 'Yusuf Aydın',
		initials: 'YA',
		color: '#8fb6c4',
		email: 'yusuf.aydin@trackr.dev',
		role: 'owner',
		team: 'Engineering',
		status: 'active',
		lastSeen: 'Online now',
		joinedAt: '2024-06-01',
		mfa: true,
		tasks: 14
	},
	{
		id: 'u7',
		name: 'Renée Carter',
		initials: 'RC',
		color: '#7a9cf0',
		email: 'renee.carter@trackr.dev',
		role: 'viewer',
		team: 'Operations',
		status: 'invited',
		lastSeen: '—',
		joinedAt: '2026-05-10',
		mfa: false,
		tasks: 0
	},
	{
		id: 'u8',
		name: 'Pieter Janssen',
		initials: 'PJ',
		color: '#ef7a6d',
		email: 'pieter.janssen@trackr.dev',
		role: 'member',
		team: 'Design',
		status: 'invited',
		lastSeen: '—',
		joinedAt: '2026-05-08',
		mfa: false,
		tasks: 0
	},
	{
		id: 'u9',
		name: 'Old Account',
		initials: 'OA',
		color: '#7c7c84',
		email: 'old.account@trackr.dev',
		role: 'member',
		team: 'Engineering',
		status: 'disabled',
		lastSeen: '3 months ago',
		joinedAt: '2023-05-30',
		mfa: false,
		tasks: 0
	}
];

export const PROJECTS: Record<ProjectId, Project> = {
	SIWEB: {
		name: 'Siweb Marketplace',
		color: '#e07a5f',
		description: 'B2B parts marketplace with SKU search, inventory sync, and German localization.',
		status: 'active',
		lead: 'u2',
		members: ['u1', 'u2', 'u3', 'u4', 'u5'],
		updated: '2 hours ago',
		icon: 'S'
	},
	TRACKR: {
		name: 'Trackr Internal',
		color: '#7a9cf0',
		description: 'Our own task system — Linear-style workspace for small teams.',
		status: 'active',
		lead: 'u6',
		members: ['u2', 'u3', 'u6'],
		updated: '5 hours ago',
		icon: 'T'
	},
	MAJA: {
		name: 'Maja Demo',
		color: '#c08bd6',
		description: 'Demo workspace for the Maja onboarding flow and translation gaps.',
		status: 'prospect',
		lead: 'u1',
		members: ['u1', 'u4'],
		updated: 'Yesterday',
		icon: 'M'
	},
	WEBIM: {
		name: 'Webim Campaign',
		color: '#7fc8a9',
		description: 'Q2 paid acquisition campaign — landing page, Google ads, copy variants.',
		status: 'paused',
		lead: 'u5',
		members: ['u5', 'u6'],
		updated: '3 days ago',
		icon: 'W'
	}
};

export const TASKS: Task[] = [
	{
		id: 'SIWEB-15',
		title: 'Gelöschte Artikel besser darstellen',
		status: 'in_progress',
		priority: 'medium',
		assignee: 'u3',
		project: 'SIWEB',
		labels: ['ux'],
		due: null,
		updated: '2026-04-29 15:12',
		type: 'improvement',
		parent: null,
		startDate: '2026-04-21',
		endDate: '2026-05-15',
		estimate: 120,
		assignees: ['u3'],
		tags: [],
		createdBy: 'u3',
		createdAt: '2026-04-21 17:45',
		description:
			'Die Darstellung gelöschter Artikel im System soll verbessert werden, damit sie besser erkennbar sind.',
		attachments: [],
		comments: [
			{
				user: 'u3',
				date: '2026-04-29',
				text: 'Lösung mit Mike abgesprochen: Gelöschte Spare Parts aus der allgemeinen Suche entfernen und nur in seperater Suche im "Deleted" Tab anzeigen'
			}
		]
	},
	{
		id: 'MAJA-13',
		title: 'German translation not complete',
		status: 'paused',
		priority: 'low',
		assignee: 'u1',
		project: 'MAJA',
		labels: ['i18n'],
		due: null,
		updated: '2026-05-09',
		description: 'Missing strings on /pricing, /support and confirmation emails.'
	},
	{
		id: 'SIWEB-27',
		title: 'Webseite auf Deutsch übersetzen',
		status: 'paused',
		priority: 'medium',
		assignee: 'u1',
		project: 'SIWEB',
		labels: ['web', 'i18n'],
		due: null,
		updated: '2026-05-08'
	},
	{
		id: 'SIWEB-20',
		title: 'Condition: 2 Buttons gleichzeitig anklickbar machen',
		status: 'paused',
		priority: 'medium',
		assignee: 'u2',
		project: 'SIWEB',
		labels: ['bug'],
		due: null,
		updated: '2026-05-06'
	},
	{
		id: 'SIWEB-18',
		title: 'SKU-Suche reparieren (inkonsistente Trefferanzeige)',
		status: 'paused',
		priority: 'low',
		assignee: 'u2',
		project: 'SIWEB',
		labels: ['bug'],
		due: null,
		updated: '2026-05-05'
	},
	{
		id: 'SIWEB-16',
		title: 'Feld für alte & neue Nummern + Discontinued-Feld hinzufügen',
		status: 'paused',
		priority: 'medium',
		assignee: 'u4',
		project: 'SIWEB',
		labels: [],
		due: null,
		updated: '2026-05-04'
	},
	{
		id: 'SIWEB-8',
		title: 'Credibility stärken: „Made in Germany" und Expertise kommunizieren',
		status: 'paused',
		priority: 'high',
		assignee: 'u5',
		project: 'SIWEB',
		labels: ['web', 'copy'],
		due: null,
		updated: '2026-05-02'
	},
	{
		id: 'TRACKR-68',
		title: 'Plan Current Week Feature',
		status: 'in_review',
		priority: 'low',
		assignee: 'u6',
		project: 'TRACKR',
		labels: [],
		due: null,
		updated: '2026-05-12'
	},
	{
		id: 'TRACKR-66',
		title: "Saved Filters doesn't save the Assignee?",
		status: 'in_review',
		priority: 'urgent',
		assignee: 'u2',
		project: 'TRACKR',
		labels: ['bug'],
		due: '2026-05-06',
		updated: '2026-05-11'
	},
	{
		id: 'WEBIM-3',
		title: 'Plan erstellen / Angebot Google Bewerbung',
		status: 'in_review',
		priority: 'medium',
		assignee: 'u5',
		project: 'WEBIM',
		labels: ['web'],
		due: '2026-05-14',
		updated: '2026-05-10'
	},
	{
		id: 'MAJA-16',
		title: 'Josie Maja Demo Version bereitstellen',
		status: 'in_review',
		priority: 'urgent',
		assignee: 'u1',
		project: 'MAJA',
		labels: [],
		due: null,
		updated: '2026-05-11'
	},
	{
		id: 'SIWEB-21',
		title: 'Status-Filter (All / Published / Draft / Deleted) für Artikel und SKUs',
		status: 'in_review',
		priority: 'none',
		assignee: 'u4',
		project: 'SIWEB',
		labels: ['admin'],
		due: null,
		updated: '2026-05-09'
	},
	{
		id: 'SIWEB-19',
		title: '"Refurbished (Generalüberholt)" zu "Checked (Geprüft)" umbenennen',
		status: 'in_review',
		priority: 'none',
		assignee: 'u3',
		project: 'SIWEB',
		labels: ['copy'],
		due: null,
		updated: '2026-05-08'
	},
	{
		id: 'SIWEB-17',
		title: 'Tetra Pak Nummer immer vorne anzeigen',
		status: 'in_review',
		priority: 'none',
		assignee: 'u2',
		project: 'SIWEB',
		labels: [],
		due: null,
		updated: '2026-05-07'
	},
	{
		id: 'TRACKR-71',
		title: 'Add keyboard shortcut palette (⌘K → command list)',
		status: 'todo',
		priority: 'medium',
		assignee: 'u6',
		project: 'TRACKR',
		labels: ['ux'],
		due: '2026-05-19',
		updated: '2026-05-11'
	},
	{
		id: 'TRACKR-70',
		title: 'Inline edit task title from list view',
		status: 'todo',
		priority: 'high',
		assignee: 'u2',
		project: 'TRACKR',
		labels: ['ux'],
		due: '2026-05-16',
		updated: '2026-05-10 11:24',
		type: 'feature',
		parent: 'TRACKR-65',
		startDate: '2026-05-10',
		endDate: '2026-05-16',
		estimate: 150,
		assignees: ['u2', 'u6', 'u3'],
		tags: ['ux'],
		createdBy: 'u6',
		createdAt: '2026-05-08 09:12',
		description:
			'Double-click a task title in the list view to edit inline. Esc cancels, Enter or blur saves. Must respect read-only states for archived tasks.',
		attachments: [
			{ name: 'inline-edit-spec.pdf', size: '218 KB' },
			{ name: 'figma-flow.png', size: '1.4 MB' }
		],
		comments: [
			{
				user: 'u6',
				date: '2026-05-09',
				text: 'Spec attached. Lets get this in before the next release window — should be a quick win for power users.'
			},
			{
				user: 'u3',
				date: '2026-05-10',
				text: 'I can take a first pass tomorrow. One question: do we want the edit affordance to show on hover or only on focus?'
			}
		],
		timeLogs: [
			{
				user: 'u3',
				date: '2026-05-11',
				minutes: 45,
				note: 'Sketched out keyboard interactions for cancel/commit.'
			},
			{
				user: 'u2',
				date: '2026-05-12',
				minutes: 30,
				note: 'Wired up double-click and contenteditable scaffold.'
			}
		]
	},
	{
		id: 'SIWEB-31',
		title: 'Sticky table headers when scrolling long lists',
		status: 'todo',
		priority: 'low',
		assignee: 'u3',
		project: 'SIWEB',
		labels: ['web'],
		due: null,
		updated: '2026-05-09'
	},
	{
		id: 'WEBIM-7',
		title: 'Landing page hero copy — A/B variants',
		status: 'todo',
		priority: 'medium',
		assignee: 'u5',
		project: 'WEBIM',
		labels: ['copy'],
		due: '2026-05-20',
		updated: '2026-05-08'
	},
	{
		id: 'MAJA-22',
		title: 'Onboarding checklist for new demo accounts',
		status: 'todo',
		priority: 'medium',
		assignee: 'u4',
		project: 'MAJA',
		labels: ['ux'],
		due: '2026-05-22',
		updated: '2026-05-07'
	},
	{
		id: 'TRACKR-95',
		title: 'Calendar / timeline view for cross-project planning',
		status: 'backlog',
		priority: 'low',
		assignee: 'u6',
		project: 'TRACKR',
		labels: [],
		due: null,
		updated: '2026-04-29'
	},
	{
		id: 'TRACKR-93',
		title: 'Bulk edit selected rows (status, assignee, priority)',
		status: 'backlog',
		priority: 'medium',
		assignee: 'u2',
		project: 'TRACKR',
		labels: ['ux'],
		due: null,
		updated: '2026-04-27'
	},
	{
		id: 'SIWEB-44',
		title: 'Export filtered tasks to CSV',
		status: 'backlog',
		priority: 'low',
		assignee: 'u3',
		project: 'SIWEB',
		labels: [],
		due: null,
		updated: '2026-04-25'
	}
];

export const WIKI_PAGES: WikiPage[] = [
	{
		id: 'w-home',
		parent: null,
		title: 'Welcome to Trackr',
		icon: 'book',
		updated: '2 hours ago',
		author: 'u6',
		body: [
			{ kind: 'h1', text: 'Welcome to the Trackr workspace' },
			{
				kind: 'p',
				text: 'This is our shared brain. Anything that helps the team move faster — playbooks, decisions, onboarding — belongs here.'
			},
			{
				kind: 'callout',
				tone: 'info',
				text: 'Edit any page inline. Slash-commands ( / ) drop in headings, callouts, tables, code blocks.'
			},
			{ kind: 'h2', text: 'Start here' },
			{
				kind: 'list',
				items: [
					'New hire? See Engineering → Onboarding.',
					'Need a quick way to file a bug? Read How we ship.',
					'Looking for policies? Open the People & Ops folder.'
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
		updated: 'Yesterday',
		author: 'u2',
		body: []
	},
	{
		id: 'w-onboard',
		parent: 'w-eng',
		title: 'Onboarding',
		icon: 'book',
		updated: '3 days ago',
		author: 'u2',
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
				tone: 'warn',
				text: 'Stuck? You are encouraged to ask. Avoid burning more than 30 min before reaching out.'
			}
		]
	},
	{
		id: 'w-ship',
		parent: 'w-eng',
		title: 'How we ship',
		icon: 'book',
		updated: '5 days ago',
		author: 'u6',
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
		id: 'w-design',
		parent: null,
		title: 'Design',
		icon: 'folder',
		updated: '1 week ago',
		author: 'u1',
		body: []
	},
	{
		id: 'w-tokens',
		parent: 'w-design',
		title: 'Design tokens',
		icon: 'book',
		updated: '1 week ago',
		author: 'u1',
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
			}
		]
	},
	{
		id: 'w-people',
		parent: null,
		title: 'People & Ops',
		icon: 'folder',
		updated: '2 weeks ago',
		author: 'u4',
		body: []
	},
	{
		id: 'w-pto',
		parent: 'w-people',
		title: 'Time off & holidays',
		icon: 'book',
		updated: '2 weeks ago',
		author: 'u4',
		body: [
			{ kind: 'h1', text: 'Time off & holidays' },
			{
				kind: 'p',
				text: 'Unlimited time off with a minimum: please take at least 4 weeks per year. Block your calendar early so others can plan around you.'
			},
			{
				kind: 'callout',
				tone: 'info',
				text: 'Statutory holidays follow your country of residence.'
			}
		]
	}
];
