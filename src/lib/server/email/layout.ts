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
//
// Standard email HTML: tables for layout, inline styles only, bulletproof
// (padded-<a>) buttons for Outlook.

const ACCENT_STRONG = '#f08e7f'; // --accent-strong (button gradient start)
const ACCENT_DEEP = '#d8584b'; // button gradient end + solid fallback
const ACCENT_LINK = '#cf5447'; // deeper coral so links read on a white surface
const LOGO = '#FF4867'; // brand mark red — matches the app sidebar logo exactly
// Pure white surfaces — the safest possible target for Outlook dark mode.
// Canvas and card are both #ffffff; the card reads via border + soft shadow,
// not a fill (so there's no off-white tone for Outlook to gray). The chip is
// the only light-gray surface — an input-style nest the eye expects to recede.
const PAGE_BG = '#ffffff'; // canvas
const CARD_BG = '#ffffff'; // card (border + shadow define it)
const CARD_BORDER = '#e4e2df'; // visible warm hairline on white
const CHIP_BG = '#f4f3f1'; // input-style nest inside the card
const HEADING = '#191a1e'; // near-black
const BODY = '#4e5054'; // --text-2
const SUBTLE = '#787a7f'; // --text-3
const FAINT = '#909297'; // --text-4
const FONT =
	"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const CARD_SHADOW =
	'0 1px 0 rgba(255,255,255,0.6) inset, 0 14px 36px -12px rgba(40,30,30,0.16), 0 2px 6px rgba(40,30,30,0.05)';
const BTN_SHADOW =
	'0 1px 0 rgba(255,255,255,0.25) inset, 0 8px 20px -6px rgba(216,88,75,0.40)';

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
					<td align="center" bgcolor="${ACCENT_DEEP}"
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
					<td style="background-color:${CHIP_BG};border:1px solid ${CARD_BORDER};border-radius:8px;padding:11px 13px;">
						<a href="${escapeHtml(url)}" target="_blank" style="font-family:${MONO};font-size:12px;line-height:1.55;color:${ACCENT_LINK};text-decoration:none;word-break:break-all;">${escapeHtml(url)}</a>
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
	<meta name="color-scheme" content="light" />
	<meta name="supported-color-schemes" content="light" />
	<title>${escapeHtml(opts.heading)}</title>
	<style>
		:root { color-scheme: light only; supported-color-schemes: light; }
		/* Keep it light in clients that honour this (e.g. Apple Mail dark mode). */
		@media (prefers-color-scheme: dark) {
			body, .em-canvas { background-color: ${PAGE_BG} !important; }
			.em-card { background-color: ${CARD_BG} !important; }
			.em-chip { background-color: ${CHIP_BG} !important; }
		}
	</style>
</head>
<body class="em-canvas" style="margin:0;padding:0;background-color:${PAGE_BG};-webkit-text-size-adjust:100%;">
	<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE_BG};">${escapeHtml(opts.preheader)}</div>
	<table role="presentation" class="em-canvas" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE_BG};">
		<tr>
			<td align="center" class="em-canvas" style="padding:0 16px;background-color:${PAGE_BG};">
				<table role="presentation" width="448" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:448px;">
					<tr><td align="center" class="em-canvas" style="padding:48px 0 26px;background-color:${PAGE_BG};">${brandMark()}</td></tr>
					<tr>
						<td class="em-card" style="background-color:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:16px;padding:32px 32px 28px;box-shadow:${CARD_SHADOW};">
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
						<td align="center" class="em-canvas" style="font-family:${FONT};font-size:11.5px;line-height:1.6;color:${FAINT};padding:22px 8px 44px;background-color:${PAGE_BG};">
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
