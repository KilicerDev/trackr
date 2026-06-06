import type { EmailMessage } from './index';
import { m } from '$lib/paraglide/messages';
import type { Locale } from '$lib/paraglide/runtime';

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

	return {
		to: opts.to,
		subject: `You've been invited to ${PRODUCT_NAME}`,
		text
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
	const lines = [opts.title];
	if (opts.body) {
		lines.push('', opts.body);
	}
	lines.push('', `${m.notify_email_open(undefined, { locale: opts.locale })}: ${opts.url}`);
	lines.push('', `— ${PRODUCT_NAME}`);
	return {
		to: opts.to,
		subject: `[${PRODUCT_NAME}] ${opts.title}`,
		text: lines.join('\n')
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

	return {
		to: opts.to,
		subject: `Reset your ${PRODUCT_NAME} password`,
		text
	};
}
