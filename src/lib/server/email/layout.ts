// Branded HTML email shell. Email clients are stuck in ~2005 HTML: tables for
// layout, inline styles only (no <style> cascade in Gmail), no fl/grid, and
// Outlook needs bulletproof (padded-<a>) buttons. Everything below sticks to
// that lowest common denominator so the mail renders the same everywhere.

const ACCENT = '#ef7a6d'; // brand coral — decorative (bars, links)
const ACCENT_BTN = '#d8584b'; // deeper coral so white button text stays legible
const PAGE_BG = '#f4f4f5';
const CARD_BG = '#ffffff';
const BORDER = '#e7e7ea';
const HEADING = '#1c1c1f';
const BODY = '#4b4b52';
const MUTED = '#8a8a93';
const FONT =
	"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

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
	/** Plain link shown under the button for clients that strip the button. */
	fallbackUrl?: string;
	/** Small muted lines under the divider (e.g. expiry, "ignore this"). */
	footnotes?: string[];
};

function brandHeader(): string {
	// Three coral bars (the Trackr favicon mark) + wordmark, as a single row.
	const bar = `<td width="4" style="background:${ACCENT};border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>`;
	const gap = `<td width="3" style="font-size:0;line-height:0;">&nbsp;</td>`;
	return `
	<tr>
		<td align="center" style="padding:0 0 24px;">
			<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
				<tr style="height:20px;">
					${bar}${gap}${bar}${gap}${bar}
					<td width="10" style="font-size:0;line-height:0;">&nbsp;</td>
					<td style="font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${HEADING};">Trackr</td>
				</tr>
			</table>
		</td>
	</tr>`;
}

function button({ label, url }: Button): string {
	return `
	<tr>
		<td style="padding:8px 0 4px;">
			<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
				<tr>
					<td align="center" bgcolor="${ACCENT_BTN}" style="border-radius:8px;">
						<a href="${escapeHtml(url)}" target="_blank"
							style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
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
				`<tr><td style="font-family:${FONT};font-size:15px;line-height:1.6;color:${BODY};padding:0 0 16px;">${p}</td></tr>`
		)
		.join('');

	const cta = opts.button ? button(opts.button) : '';

	const fallback = opts.fallbackUrl
		? `<tr><td style="font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTED};padding:18px 0 0;">
				Or paste this link into your browser:<br />
				<a href="${escapeHtml(opts.fallbackUrl)}" target="_blank" style="color:${ACCENT};word-break:break-all;">${escapeHtml(opts.fallbackUrl)}</a>
			</td></tr>`
		: '';

	const footnotes =
		opts.footnotes && opts.footnotes.length
			? `<tr><td style="padding:22px 0 0;">
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
						<tr><td style="border-top:1px solid ${BORDER};font-size:0;line-height:0;padding:0 0 18px;">&nbsp;</td></tr>
						${opts.footnotes
							.map(
								(f) =>
									`<tr><td style="font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTED};padding:0 0 6px;">${f}</td></tr>`
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
	<meta name="color-scheme" content="light" />
	<meta name="supported-color-schemes" content="light" />
	<title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};-webkit-text-size-adjust:100%;">
	<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE_BG};">${escapeHtml(opts.preheader)}</div>
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};">
		<tr>
			<td align="center" style="padding:40px 16px;">
				<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
					${brandHeader()}
					<tr>
						<td style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:14px;padding:36px 36px 32px;">
							<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
								<tr><td style="font-family:${FONT};font-size:21px;font-weight:700;line-height:1.3;letter-spacing:-0.01em;color:${HEADING};padding:0 0 18px;">${escapeHtml(opts.heading)}</td></tr>
								${paragraphs}
								${cta}
								${fallback}
								${footnotes}
							</table>
						</td>
					</tr>
					<tr>
						<td align="center" style="font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};padding:22px 8px 0;">
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
