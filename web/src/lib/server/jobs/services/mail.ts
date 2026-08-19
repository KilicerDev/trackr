/**
 * Mail service — the `mail.send` job: one email to one recipient.
 *
 * This file owns the mail job end-to-end on the web side: its payload type, the
 * job definition, the priority levels, the `sendEmail` producer, and the content
 * templates (rendered to branded HTML via ./mail-layout). The Go mail worker
 * (services/worker) transmits what this enqueues. Fan-out (e.g. notifying many
 * users) is one `mail.send` job per recipient.
 */

import { defineJob } from '../core';
import { m } from '$lib/paraglide/messages';
import type { Locale } from '$lib/paraglide/runtime';
import { escapeHtml, renderEmail } from './mail-layout';
import { markdownToEmailHtml } from '$lib/utils/markdown';

const PRODUCT_NAME = 'Trackr';

/** The `mail.send` payload — a fully-rendered email. Mirrors the Go `mail.Message`. */
export type MailPayload = {
	to: string;
	subject: string;
	text: string;
	html?: string;
	from?: string;
	replyTo?: string;
};

/**
 * Priority for outgoing mail (the job's `priority`; higher is sent sooner).
 * Auth/transactional mail should arrive ASAP; bulk notifications can yield.
 */
export const EMAIL_PRIORITY = {
	high: 100,
	normal: 0,
	low: -100
} as const;

/** The mail job definition. Use `mailJob.enqueue(...)` / `.enqueueTx(...)` directly,
 * or the `sendEmail` helper below. */
export const mailJob = defineJob<MailPayload>('mail.send');

export type SendEmailOptions = { priority?: number };

/**
 * Enqueue an email as a `mail.send` job. Resolves once durably queued; the mail
 * worker delivers it asynchronously (with retry/backoff). Pass
 * `EMAIL_PRIORITY.high` for mail that must arrive promptly.
 */
export async function sendEmail(
	message: MailPayload,
	options: SendEmailOptions = {}
): Promise<void> {
	await mailJob.enqueue(message, { priority: options.priority ?? EMAIL_PRIORITY.normal });
}

/** Enqueue without awaiting (enqueueing is already durable); failures are logged. */
export function sendEmailFireAndForget(message: MailPayload, options: SendEmailOptions = {}): void {
	void sendEmail(message, options).catch((err) => {
		console.error('[mail] enqueue failed', {
			to: message.to,
			subject: message.subject,
			error: err
		});
	});
}

// --- Templates: functions that render a MailPayload (branded HTML + text) -----

export function invitationEmail(opts: {
	to: string;
	name: string;
	inviterName?: string | null;
	acceptUrl: string;
	expiresAt: Date;
}): MailPayload {
	const inviter = opts.inviterName?.trim() || 'An administrator';
	const expires = opts.expiresAt.toLocaleString('en-GB', {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	const text = [
		`Hi ${opts.name},`,
		'',
		`${inviter} has invited you to the ${PRODUCT_NAME} workspace.`,
		'',
		'Set your password to activate your account:',
		opts.acceptUrl,
		'',
		`This link expires on ${expires}.`,
		'',
		`If you weren't expecting this, you can ignore this email.`
	].join('\n');

	const html = renderEmail({
		preheader: `${inviter} invited you to ${PRODUCT_NAME}.`,
		heading: `You've been invited to ${PRODUCT_NAME}`,
		paragraphs: [
			`Hi ${escapeHtml(opts.name)},`,
			`${escapeHtml(inviter)} has invited you to the ${PRODUCT_NAME} workspace. Set your password to activate your account.`
		],
		button: { label: 'Activate your account', url: opts.acceptUrl },
		fallbackUrl: opts.acceptUrl,
		footnotes: [
			`This link expires on ${escapeHtml(expires)}.`,
			`If you weren't expecting this, you can safely ignore this email.`
		]
	});

	return {
		to: opts.to,
		subject: `You've been invited to ${PRODUCT_NAME}`,
		text,
		html
	};
}

// Structured content for a notification email, built per-locale by the
// notify/events modules. `heading` and `quote` carry user content (escaped at
// render time); `subjectLabel`/`eyebrow`/`meta`/`ctaLabel` are localized app
// strings; `ref` is the entity display id ("SGRP-T-31") — subjects contain
// only ref + label, never user-typed text (user content in a subject line is
// a spam signal).
export type NotificationEmailContent = {
	/** Short event label for the subject, e.g. "Neue Nachricht". */
	subjectLabel: string;
	/** Eyebrow above the heading, e.g. "Ticket · Neue Nachricht". */
	eyebrow: string;
	/** Entity display id shown as a chip; also leads the subject. */
	ref?: string | null;
	/** Entity title (ticket subject / task title / thread title). */
	heading: string;
	/** Label/value detail rows (Von / Status / Priorität / Datum). */
	meta: { label: string; value: string }[];
	/** Message excerpt for message/comment/mention kinds. */
	quote?: string | null;
	/** Button label, e.g. "Ticket öffnen". */
	ctaLabel: string;
};

export function notificationEmail(opts: {
	to: string;
	content: NotificationEmailContent;
	url: string;
	/** Absolute link to the recipient's notification settings, if resolvable. */
	settingsUrl?: string | null;
	locale?: Locale;
}): MailPayload {
	const c = opts.content;
	const subject = c.ref
		? `[${PRODUCT_NAME}] ${c.ref} · ${c.subjectLabel}`
		: `[${PRODUCT_NAME}] ${c.subjectLabel}`;

	const lines = [c.eyebrow + (c.ref ? ` · ${c.ref}` : ''), c.heading];
	for (const row of c.meta) lines.push(`${row.label}: ${row.value}`);
	if (c.quote) lines.push('', c.quote);
	lines.push('', `${c.ctaLabel}: ${opts.url}`);
	lines.push('', `— ${PRODUCT_NAME}`);

	const html = renderEmail({
		preheader: c.quote?.trim() || c.heading,
		lang: opts.locale,
		eyebrow: { label: c.eyebrow, ref: c.ref ?? undefined },
		heading: c.heading,
		metaRows: c.meta,
		quote: c.quote,
		button: { label: c.ctaLabel, url: opts.url },
		// Deliberately no fallbackUrl: a raw UUID link is the #1 phishing signal
		// for normal recipients. The footer settings link covers "is this real?".
		footerText: `${PRODUCT_NAME} · ${m.email_footer_activity(undefined, { locale: opts.locale })}`,
		footerLink: opts.settingsUrl
			? { label: m.email_footer_manage(undefined, { locale: opts.locale }), url: opts.settingsUrl }
			: undefined
	});

	return { to: opts.to, subject, text: lines.join('\n'), html };
}

// Legacy flat notification email — kept for callers without structured
// content (e.g. the task-import summary). Same layout, no meta/eyebrow.
export function plainNotificationEmail(opts: {
	to: string;
	title: string;
	body?: string | null;
	url: string;
	locale?: Locale;
}): MailPayload {
	const openLabel = m.notify_email_open(undefined, { locale: opts.locale });

	const lines = [opts.title];
	if (opts.body) {
		lines.push('', opts.body);
	}
	lines.push('', `${openLabel}: ${opts.url}`);
	lines.push('', `— ${PRODUCT_NAME}`);

	const paragraphs: string[] = [];
	if (opts.body) {
		// Bodies are user-authored markdown — render (escaped) instead of flat text.
		paragraphs.push(markdownToEmailHtml(opts.body));
	}

	const html = renderEmail({
		preheader: opts.body?.trim() || opts.title,
		lang: opts.locale,
		heading: opts.title,
		paragraphs: paragraphs.length ? paragraphs : undefined,
		button: { label: openLabel, url: opts.url },
		footerText: `${PRODUCT_NAME} · ${m.email_footer_activity(undefined, { locale: opts.locale })}`
	});

	return {
		to: opts.to,
		subject: `[${PRODUCT_NAME}] ${opts.title}`,
		text: lines.join('\n'),
		html
	};
}

export function passwordResetEmail(opts: { to: string; resetUrl: string }): MailPayload {
	const text = [
		'Hi,',
		'',
		`Someone requested a password reset for your ${PRODUCT_NAME} account.`,
		'',
		'Set a new password:',
		opts.resetUrl,
		'',
		`If you didn't request this, you can safely ignore this email — your password will stay the same.`
	].join('\n');

	const html = renderEmail({
		preheader: `Reset your ${PRODUCT_NAME} password.`,
		heading: 'Reset your password',
		paragraphs: [
			`Someone requested a password reset for your ${PRODUCT_NAME} account. Click below to choose a new one.`
		],
		button: { label: 'Set a new password', url: opts.resetUrl },
		fallbackUrl: opts.resetUrl,
		footnotes: [
			`If you didn't request this, you can safely ignore this email — your password will stay the same.`
		]
	});

	return {
		to: opts.to,
		subject: `Reset your ${PRODUCT_NAME} password`,
		text,
		html
	};
}
