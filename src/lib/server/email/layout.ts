// Branded HTML email shell, built to mirror Trackr's auth screens 1:1. Email
// clients are stuck in ~2005 HTML: tables for layout, inline styles only (no
// <style> cascade in Gmail), no flex/grid, and Outlook needs bulletproof
// (padded-<a>) buttons. Everything below sticks to that lowest common
// denominator; richer touches (gradients, glow, shadows) are progressive
// enhancements that degrade to flat color where unsupported.
//
// Palette/spacing/shadows are lifted straight from the app: dark canvas, a
// bg-elev card with an inset top highlight + soft drop shadow, the coral brand
// mark, a full-width coral CTA, and a monospace link chip styled like an input.

const ACCENT = '#ef7a6d'; // --accent
const ACCENT_STRONG = '#f08e7f'; // --accent-strong (gradient start)
const ACCENT_DEEP = '#d8584b'; // brand-mark gradient end
const PAGE_BG = '#0a0b0d'; // a touch below --bg, so the card reads as elevated
const CARD_BG = '#141518'; // --bg-elev
const CARD_BORDER = '#282a2e'; // --border
const CHIP_BG = '#18191d'; // --surface
const HEADING = '#f4f5f9'; // --text
const BODY = '#a9abb0'; // --text-2
const SUBTLE = '#6d6e73'; // --text-3
const FAINT = '#4b4d52'; // --text-4
const FONT =
	"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const CARD_SHADOW =
	'0 1px 0 rgba(255,255,255,0.03) inset, 0 24px 60px -28px rgba(0,0,0,0.55)';
const BTN_SHADOW =
	'0 1px 0 rgba(255,255,255,0.18) inset, 0 8px 22px -6px rgba(239,122,109,0.45)';

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
	heading: string;
	/** Body paragraphs. Each becomes its own <p>; rendered as raw HTML, so
	 *  callers must escape any user-supplied text before passing it in. */
	paragraphs: string[];
	button?: Button;
	/** Plain link shown in a chip under the button for clients that strip it. */
	fallbackUrl?: string;
	/** Small muted lines under the divider (e.g. expiry, "ignore this"). */
	footnotes?: string[];
};

// The app brand mark: a coral gradient rounded square holding three stacked
// white lines of decreasing width, next to the "Trackr" wordmark.
function brandMark(): string {
	const line = (w: number, pad: boolean) =>
		`<tr><td style="${pad ? 'padding:0 0 3px;' : ''}line-height:0;font-size:0;"><div style="width:${w}px;height:2px;background:#ffffff;border-radius:2px;line-height:2px;font-size:0;">&nbsp;</div></td></tr>`;
	return `
	<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
		<tr>
			<td width="32" height="32" align="center" valign="middle" bgcolor="${ACCENT}"
				style="width:32px;height:32px;border-radius:9px;background-image:linear-gradient(140deg,${ACCENT_STRONG},${ACCENT_DEEP} 85%);box-shadow:0 1px 0 rgba(255,255,255,0.18) inset,0 4px 14px rgba(239,122,109,0.28);">
				<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
					${line(13, true)}${line(9, true)}${line(6, false)}
				</table>
			</td>
			<td width="11" style="font-size:0;line-height:0;">&nbsp;</td>
			<td valign="middle" style="font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${HEADING};">Trackr</td>
		</tr>
	</table>`;
}

function button({ label, url }: Button): string {
	return `
	<tr>
		<td style="padding:8px 0 2px;">
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
				<tr>
					<td align="center" bgcolor="${ACCENT}"
						style="border-radius:9px;background-image:linear-gradient(140deg,${ACCENT_STRONG},${ACCENT_DEEP} 92%);box-shadow:${BTN_SHADOW};">
						<a href="${escapeHtml(url)}" target="_blank"
							style="display:block;padding:13px 24px;font-family:${FONT};font-size:14px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;text-align:center;border-radius:9px;">${escapeHtml(label)}</a>
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
					<td style="background:${CHIP_BG};border:1px solid ${CARD_BORDER};border-radius:8px;padding:11px 13px;">
						<a href="${escapeHtml(url)}" target="_blank" style="font-family:${MONO};font-size:12px;line-height:1.55;color:${ACCENT};text-decoration:none;word-break:break-all;">${escapeHtml(url)}</a>
					</td>
				</tr>
			</table>
		</td>
	</tr>`;
}

export function renderEmail(opts: EmailLayoutOptions): string {
	const paragraphs = opts.paragraphs
		.map(
			(p) =>
				`<tr><td style="font-family:${FONT};font-size:14px;line-height:1.65;color:${BODY};padding:0 0 14px;">${p}</td></tr>`
		)
		.join('');

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

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width,initial-scale=1" />
	<meta name="color-scheme" content="dark" />
	<meta name="supported-color-schemes" content="dark" />
	<title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};-webkit-text-size-adjust:100%;">
	<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE_BG};">${escapeHtml(opts.preheader)}</div>
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};">
		<tr>
			<td align="center" style="padding:0 16px;background-image:radial-gradient(circle at 50% 0,rgba(239,122,109,0.10),transparent 62%);">
				<table role="presentation" width="448" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:448px;">
					<tr><td align="center" style="padding:48px 0 26px;">${brandMark()}</td></tr>
					<tr>
						<td style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:16px;padding:32px 32px 28px;box-shadow:${CARD_SHADOW};">
							<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
								<tr><td style="font-family:${FONT};font-size:20px;font-weight:600;line-height:1.3;letter-spacing:-0.014em;color:${HEADING};padding:0 0 8px;">${escapeHtml(opts.heading)}</td></tr>
								${paragraphs}
								${cta}
								${chip}
								${footnotes}
							</table>
						</td>
					</tr>
					<tr>
						<td align="center" style="font-family:${FONT};font-size:11.5px;line-height:1.6;color:${FAINT};padding:22px 8px 44px;">
							Trackr · You received this email because of activity on your account.
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;
}
