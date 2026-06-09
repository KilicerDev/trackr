import type { EmailMessage } from './index';
import { m } from '$lib/paraglide/messages';
import type { Locale } from '$lib/paraglide/runtime';
import { escapeHtml, renderEmail } from './layout';

const PRODUCT_NAME = 'Trackr';

export function invitationEmail(opts: {
	to: string;
	name: string;
	inviterName?: string | null;
	acceptUrl: string;
	expiresAt: Date;
}): EmailMessage {
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
}): EmailMessage {
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

export function passwordResetEmail(opts: { to: string; resetUrl: string }): EmailMessage {
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
