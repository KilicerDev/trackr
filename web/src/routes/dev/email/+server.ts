// Dev-only email template preview. 404s in production builds.
//   GET /dev/email                    — index of variants
//   GET /dev/email?t=<variant>&l=<locale>
// Renders the real templates with sample data so layout changes can be
// eyeballed in a browser without sending mail.
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import {
	invitationEmail,
	notificationEmail,
	passwordResetEmail,
	plainNotificationEmail
} from '$lib/server/jobs';
import type { Locale } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages';
import type { RequestHandler } from './$types';

const SAMPLE_URL = 'https://kilohertz.trackr.dev/tickets/0fffd4eb-c2da-4571-82c2-3cc6c7777b6e';
const SETTINGS_URL = 'https://kilohertz.trackr.dev/me/settings';

function sample(t: string, locale: Locale): { subject: string; html?: string } {
	const de = locale === 'de';
	const meta = (rows: [string, string][]) => rows.map(([label, value]) => ({ label, value }));
	const commonMeta: [string, string][] = [
		[m.email_meta_from(undefined, { locale }), 'Ertugrul Kilic'],
		[m.email_meta_status(undefined, { locale }), de ? 'Offen' : 'Open'],
		[m.email_meta_priority(undefined, { locale }), de ? 'Hoch' : 'High'],
		[m.email_meta_date(undefined, { locale }), de ? '17. Aug. 2026, 10:50' : 'Aug 17, 2026, 10:50']
	];

	switch (t) {
		case 'ticketMessage':
			return notificationEmail({
				to: 'preview@trackr.dev',
				content: {
					subjectLabel: m.email_ev_message(undefined, { locale }),
					eyebrow: `${m.email_kind_ticket(undefined, { locale })} · ${m.email_ev_message(undefined, { locale })}`,
					ref: 'SCHENIDERGROUP-T-31',
					heading: 'Spezial Offer Update',
					meta: meta(commonMeta),
					quote: de
						? 'Hallo zusammen. Toller Vorschlag — Freigabe meinerseits.'
						: 'Hi all. Great proposal — approved from my side.',
					ctaLabel: m.email_cta_ticket(undefined, { locale })
				},
				url: SAMPLE_URL,
				settingsUrl: SETTINGS_URL,
				locale
			});
		case 'mention':
			return notificationEmail({
				to: 'preview@trackr.dev',
				content: {
					subjectLabel: m.email_ev_mentioned(undefined, { locale }),
					eyebrow: m.email_ev_mentioned(undefined, { locale }),
					ref: 'SCHENIDERGROUP-T-31',
					heading: 'Spezial Offer Update',
					meta: meta(commonMeta),
					quote: de
						? '@Ertugrul kannst du das bitte freigeben? Kunde wartet auf Rückmeldung.'
						: '@Ertugrul can you approve this? Customer is waiting.',
					ctaLabel: m.email_cta_ticket(undefined, { locale })
				},
				url: SAMPLE_URL,
				settingsUrl: SETTINGS_URL,
				locale
			});
		case 'created':
			return notificationEmail({
				to: 'preview@trackr.dev',
				content: {
					subjectLabel: m.email_ev_new_ticket(undefined, { locale }),
					eyebrow: m.email_ev_new_ticket(undefined, { locale }),
					ref: 'SCHENIDERGROUP-T-32',
					heading: de ? 'Drucker offline in Büro 2' : 'Printer offline in office 2',
					meta: meta(commonMeta),
					quote: de
						? 'Drucker in Büro 2 seit heute Morgen nicht mehr erreichbar. Neustart hat nicht geholfen.'
						: "Printer in office 2 no longer reachable since this morning. Restart didn't help.",
					ctaLabel: m.email_cta_ticket(undefined, { locale })
				},
				url: SAMPLE_URL,
				settingsUrl: SETTINGS_URL,
				locale
			});
		case 'assigned':
			return notificationEmail({
				to: 'preview@trackr.dev',
				content: {
					subjectLabel: m.email_ev_assigned(undefined, { locale }),
					eyebrow: `${m.email_kind_task(undefined, { locale })} · ${m.email_ev_assigned(undefined, { locale })}`,
					ref: 'KH-42',
					heading: de ? 'Landingpage Feedback einarbeiten' : 'Incorporate landing page feedback',
					meta: meta([
						[m.email_meta_from(undefined, { locale }), 'Ertugrul Kilic'],
						[
							m.email_meta_date(undefined, { locale }),
							de ? '17. Aug. 2026, 11:30' : 'Aug 17, 2026, 11:30'
						]
					]),
					ctaLabel: m.email_cta_task(undefined, { locale })
				},
				url: SAMPLE_URL,
				settingsUrl: SETTINGS_URL,
				locale
			});
		case 'plain':
			return plainNotificationEmail({
				to: 'preview@trackr.dev',
				title: de
					? '3 Aufgaben Ihnen zugewiesen — importiert in KiloHertz'
					: '3 tasks assigned to you — imported into KiloHertz',
				body: null,
				url: SAMPLE_URL,
				locale
			});
		case 'invite':
			return invitationEmail({
				to: 'preview@trackr.dev',
				name: 'Ertugrul',
				inviterName: 'Melis Aydın',
				acceptUrl: SAMPLE_URL,
				expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000)
			});
		case 'reset':
			return passwordResetEmail({ to: 'preview@trackr.dev', resetUrl: SAMPLE_URL });
		default:
			throw error(404, 'Unknown variant');
	}
}

const VARIANTS = ['ticketMessage', 'mention', 'created', 'assigned', 'plain', 'invite', 'reset'];

export const GET: RequestHandler = async ({ url }) => {
	if (!dev) throw error(404, 'Not found');
	const t = url.searchParams.get('t');
	const locale = (url.searchParams.get('l') === 'en' ? 'en' : 'de') as Locale;
	if (!t) {
		const links = VARIANTS.map(
			(v) => `<li><a href="?t=${v}&l=de">${v} (de)</a> · <a href="?t=${v}&l=en">${v} (en)</a></li>`
		).join('');
		return new Response(
			`<!doctype html><meta charset="utf-8"><title>Email previews</title><ul>${links}</ul>`,
			{ headers: { 'content-type': 'text/html; charset=utf-8' } }
		);
	}
	const { subject, html } = sample(t, locale);
	// Show the subject line above the rendered email.
	const frame = (html ?? '').replace('<body', `<!-- subject: ${subject} --><body`);
	return new Response(frame, {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
};
