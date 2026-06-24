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

export function notificationEmail(opts: {
	to: string;
	title: string;
	body?: string | null;
	url: string;
	actorName?: string | null;
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
		paragraphs.push(escapeHtml(opts.body).replace(/\n/g, '<br />'));
	}

	const html = renderEmail({
		preheader: opts.body?.trim() || opts.title,
		heading: opts.title,
		paragraphs: paragraphs.length ? paragraphs : ['You have a new update in Trackr.'],
		button: { label: openLabel, url: opts.url },
		fallbackUrl: opts.url
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
