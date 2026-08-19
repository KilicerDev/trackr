// Branded HTML email shell, on a pure-white theme.
//
// Why pure white: new Outlook's dark mode runs its own color-inversion and
// cannot be stopped (color-scheme metas, !important, hardcoded light — none
// hold). It pushes every background toward a muddy gray, WORST on warm
// off-whites and dark themes (they sit in its "invert toward middle" zone). A
// true #ffffff card with near-black text is the one design its algorithm
// handles gracefully: often left nearly untouched, and where it does shift,
// white→light-gray with black→white text stays readable rather than muddy.
// Brand identity comes through the coral mark + button, which no client
// inverts (the approach Linear, Stripe and GitHub all take despite dark apps).
// The palette is deliberately static: the email never adapts to dark mode.
//
// Standard email HTML: tables for layout, inline styles only, bulletproof
// (padded-<a>) buttons for Outlook.

import { markdownToEmailHtml } from '$lib/utils/markdown';

const ACCENT_DEEP = '#d8584b'; // flat button fill + quote accent border
const ACCENT_LINK = '#cf5447'; // deeper coral so links read on a white surface
const LOGO = '#FF4867'; // brand mark red — matches the app sidebar logo exactly
// Pure white surfaces — the safest possible target for Outlook dark mode.
// Canvas and card are both #ffffff; the card reads via border + soft shadow,
// not a fill (so there's no off-white tone for Outlook to gray). The chip and
// quote are the only light-gray surfaces — input-style nests the eye expects
// to recede.
const PAGE_BG = '#ffffff'; // canvas
const CARD_BG = '#ffffff'; // card (border + shadow define it)
const CARD_BORDER = '#e4e2df'; // visible warm hairline on white
const CHIP_BG = '#f4f3f1'; // input-style nest inside the card
const QUOTE_BG = '#f7f6f4'; // quoted message excerpt
const META_LINE = '#eeece9'; // hairline between meta rows
const HEADING = '#191a1e'; // near-black
const BODY = '#4e5054'; // --text-2
const SUBTLE = '#787a7f'; // --text-3
const FAINT = '#909297'; // --text-4
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const CARD_SHADOW = '0 8px 24px -14px rgba(40,30,30,0.14), 0 2px 4px rgba(40,30,30,0.04)';

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

type Button = { label: string; url: string };

export type EmailLayoutOptions = {
	/** Inbox preview line (hidden in the body). */
	preheader: string;
	/** html lang attribute — matches the recipient's locale. */
	lang?: string;
	/** Kind label above the heading (small caps), with an optional monospace
	 *  entity ref chip on the right (e.g. "SGRP-T-31"). Values are escaped. */
	eyebrow?: { label: string; ref?: string };
	heading: string;
	/** Label/value detail rows under the heading (Von / Status / …).
	 *  Values are escaped here. */
	metaRows?: { label: string; value: string }[];
	/** Body paragraphs. Each becomes its own <p>; rendered as raw HTML, so
	 *  callers must escape any user-supplied text before passing it in. */
	paragraphs?: string[];
	/** Quoted message excerpt (accent-bordered block). Escaped here; newlines
	 *  become <br />. */
	quote?: string | null;
	button?: Button;
	/** Plain link shown in a chip under the button for clients that strip it.
	 *  Auth emails only — notification emails pass none (a raw UUID URL reads
	 *  as phishing to normal recipients). */
	fallbackUrl?: string;
	/** Small muted lines under the divider (e.g. expiry, "ignore this"). */
	footnotes?: string[];
	/** Footer line under the card. Defaults to the English activity notice. */
	footerText?: string;
	/** Optional footer link (e.g. "Manage notifications" → /me/settings). */
	footerLink?: Button;
};

// The app brand mark: three vertical coral bars (the exact sidebar logo), next
// to the "Trackr" wordmark. Built from table cells + divs, not SVG — Gmail and
// Outlook strip <svg>. Each bar is a coral div; Outlook keeps it as a solid
// fill, so the mark survives even where backgrounds get touched.
function brandMark(): string {
	const bar = (last: boolean) =>
		`<td width="4" valign="middle" style="${last ? '' : 'padding-right:3px;'}font-size:0;line-height:0;"><div style="width:4px;height:18px;background-color:${LOGO};border-radius:1px;font-size:0;line-height:18px;">&nbsp;</div></td>`;
	return `
	<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
		<tr>
			<td valign="middle" style="font-size:0;line-height:0;">
				<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
					<tr>${bar(false)}${bar(false)}${bar(true)}</tr>
				</table>
			</td>
			<td width="10" style="font-size:0;line-height:0;">&nbsp;</td>
			<td valign="middle" style="font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:-0.02em;color:${HEADING};">Trackr</td>
		</tr>
	</table>`;
}

// Flat solid button — no gradient, no glow. Calmer, and gradients are one of
// the visual tells inbox users associate with spam.
function button({ label, url }: Button): string {
	return `
	<tr>
		<td style="padding:8px 0 2px;">
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
				<tr>
					<td align="center" bgcolor="${ACCENT_DEEP}" style="border-radius:8px;">
						<a href="${escapeHtml(url)}" target="_blank"
							style="display:block;padding:12px 24px;font-family:${FONT};font-size:14px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;text-align:center;border-radius:8px;">${escapeHtml(label)}</a>
					</td>
				</tr>
			</table>
		</td>
	</tr>`;
}

function linkChip(url: string): string {
	return `
	<tr>
		<td style="padding:20px 0 0;">
			<div style="font-family:${FONT};font-size:12px;line-height:1.5;color:${SUBTLE};padding:0 0 8px;">Or paste this link into your browser</div>
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
				<tr>
					<td class="em-chip" style="background-color:${CHIP_BG};border:1px solid ${CARD_BORDER};border-radius:8px;padding:11px 13px;">
						<a href="${escapeHtml(url)}" target="_blank" style="font-family:${MONO};font-size:12px;line-height:1.55;color:${ACCENT_LINK};text-decoration:none;word-break:break-all;">${escapeHtml(url)}</a>
					</td>
				</tr>
			</table>
		</td>
	</tr>`;
}

function eyebrowRow(eyebrow: { label: string; ref?: string }): string {
	const refCell = eyebrow.ref
		? `<td align="right" valign="middle" style="padding:0 0 12px;"><span class="em-chip" style="display:inline-block;font-family:${MONO};font-size:11.5px;line-height:1.4;color:${BODY};background-color:${CHIP_BG};border:1px solid ${CARD_BORDER};border-radius:6px;padding:2px 7px;">${escapeHtml(eyebrow.ref)}</span></td>`
		: '';
	return `
	<tr><td style="padding:0;">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
			<tr>
				<td valign="middle" style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:${SUBTLE};padding:0 0 12px;">${escapeHtml(eyebrow.label)}</td>
				${refCell}
			</tr>
		</table>
	</td></tr>`;
}

function metaTable(rows: { label: string; value: string }[]): string {
	const cells = rows
		.map(
			(r, i) =>
				`<tr>
					<td width="108" valign="top" class="em-subtle" style="font-family:${FONT};font-size:12px;line-height:1.5;color:${SUBTLE};padding:7px 12px 7px 0;border-top:1px solid ${META_LINE};${i === rows.length - 1 ? `border-bottom:1px solid ${META_LINE};` : ''}">${escapeHtml(r.label)}</td>
					<td valign="top" class="em-meta-v" style="font-family:${FONT};font-size:13px;line-height:1.5;color:${HEADING};padding:7px 0;border-top:1px solid ${META_LINE};${i === rows.length - 1 ? `border-bottom:1px solid ${META_LINE};` : ''}">${escapeHtml(r.value)}</td>
				</tr>`
		)
		.join('');
	return `
	<tr><td style="padding:0 0 16px;">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${cells}</table>
	</td></tr>`;
}

function quoteBlock(text: string): string {
	// Message excerpts are user-authored markdown — render it (escaped,
	// inline-styled) so **bold**, lists, and links arrive formatted. The
	// renderer never passes raw HTML through, so no sanitizer is needed.
	const safe = markdownToEmailHtml(text);
	return `
	<tr>
		<td class="em-quote em-body" style="background-color:${QUOTE_BG};border-left:3px solid ${ACCENT_DEEP};border-radius:0 8px 8px 0;padding:11px 14px;font-family:${FONT};font-size:14px;line-height:1.6;color:${BODY};">${safe}</td>
	</tr>
	<tr><td style="font-size:0;line-height:0;padding:0 0 20px;">&nbsp;</td></tr>`;
}

export function renderEmail(opts: EmailLayoutOptions): string {
	const paragraphs = (opts.paragraphs ?? [])
		.map(
			(p) =>
				`<tr><td class="em-body" style="font-family:${FONT};font-size:14px;line-height:1.65;color:${BODY};padding:0 0 14px;">${p}</td></tr>`
		)
		.join('');

	const eyebrow = opts.eyebrow ? eyebrowRow(opts.eyebrow) : '';
	const meta = opts.metaRows && opts.metaRows.length ? metaTable(opts.metaRows) : '';
	const quote = opts.quote ? quoteBlock(opts.quote) : '';
	const cta = opts.button ? button(opts.button) : '';
	const chip = opts.fallbackUrl ? linkChip(opts.fallbackUrl) : '';

	const footnotes =
		opts.footnotes && opts.footnotes.length
			? `<tr><td style="padding:24px 0 0;">
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
						<tr><td style="border-top:1px solid ${CARD_BORDER};font-size:0;line-height:0;padding:0 0 18px;">&nbsp;</td></tr>
						${opts.footnotes
							.map(
								(f) =>
									`<tr><td style="font-family:${FONT};font-size:12.5px;line-height:1.6;color:${SUBTLE};padding:0 0 6px;">${f}</td></tr>`
							)
							.join('')}
					</table>
				</td></tr>`
			: '';

	const footerText = escapeHtml(
		opts.footerText ?? 'Trackr · You received this email because of activity on your account.'
	);
	const footerLink = opts.footerLink
		? `<br /><a href="${escapeHtml(opts.footerLink.url)}" target="_blank" style="color:${ACCENT_LINK};text-decoration:none;">${escapeHtml(opts.footerLink.label)}</a>`
		: '';

	// Heading spacing: 16px below when a meta table follows (structured
	// notification), 8px above running paragraphs (auth emails).
	const headingPad = meta || quote ? '0 0 16px' : '0 0 8px';

	return `<!doctype html>
<html lang="${escapeHtml(opts.lang ?? 'en')}">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width,initial-scale=1" />
	<meta name="color-scheme" content="light" />
	<meta name="supported-color-schemes" content="light" />
	<title>${escapeHtml(opts.heading)}</title>
	<style>
		:root { color-scheme: light only; supported-color-schemes: light; }
		/* The palette is static: re-force surfaces AND text in clients that
		   honour prefers-color-scheme (Apple Mail dark mode), plus Outlook.com's
		   [data-ogsc] dark-mode attribute hooks. */
		@media (prefers-color-scheme: dark) {
			body, .em-canvas { background-color: ${PAGE_BG} !important; }
			.em-card { background-color: ${CARD_BG} !important; }
			.em-chip { background-color: ${CHIP_BG} !important; }
			.em-quote { background-color: ${QUOTE_BG} !important; }
			.em-heading, .em-meta-v { color: ${HEADING} !important; }
			.em-body { color: ${BODY} !important; }
			.em-subtle { color: ${SUBTLE} !important; }
		}
		[data-ogsc] body, [data-ogsc] .em-canvas { background-color: ${PAGE_BG} !important; }
		[data-ogsc] .em-card { background-color: ${CARD_BG} !important; }
		[data-ogsc] .em-chip { background-color: ${CHIP_BG} !important; }
		[data-ogsc] .em-quote { background-color: ${QUOTE_BG} !important; }
		[data-ogsc] .em-heading, [data-ogsc] .em-meta-v { color: ${HEADING} !important; }
		[data-ogsc] .em-body { color: ${BODY} !important; }
		[data-ogsc] .em-subtle { color: ${SUBTLE} !important; }
	</style>
</head>
<body class="em-canvas" style="margin:0;padding:0;background-color:${PAGE_BG};-webkit-text-size-adjust:100%;">
	<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE_BG};">${escapeHtml(opts.preheader)}</div>
	<table role="presentation" class="em-canvas" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE_BG}" style="background-color:${PAGE_BG};">
		<tr>
			<td align="center" class="em-canvas" bgcolor="${PAGE_BG}" style="padding:0 16px;background-color:${PAGE_BG};">
				<table role="presentation" width="452" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:452px;">
					<tr><td align="center" class="em-canvas" bgcolor="${PAGE_BG}" style="padding:44px 0 24px;background-color:${PAGE_BG};">${brandMark()}</td></tr>
					<tr>
						<td class="em-card" bgcolor="${CARD_BG}" style="background-color:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:16px;padding:26px 28px 24px;box-shadow:${CARD_SHADOW};">
							<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
								${eyebrow}
								<tr><td class="em-heading" style="font-family:${FONT};font-size:19px;font-weight:600;line-height:1.3;letter-spacing:-0.014em;color:${HEADING};padding:${headingPad};">${escapeHtml(opts.heading)}</td></tr>
								${meta}
								${paragraphs}
								${quote}
								${cta}
								${chip}
								${footnotes}
							</table>
						</td>
					</tr>
					<tr>
						<td align="center" class="em-canvas em-subtle" bgcolor="${PAGE_BG}" style="font-family:${FONT};font-size:11.5px;line-height:1.7;color:${FAINT};padding:18px 12px 44px;background-color:${PAGE_BG};">
							${footerText}${footerLink}
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;
}
