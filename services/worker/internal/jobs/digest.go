package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	neturl "net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KilicerDev/trackr/services/shared/jobq"
	"github.com/KilicerDev/trackr/services/shared/jobworker"
)

// notifyDigest returns the `notify.digest` handler. It's driven by a 15-minute
// schedule; on each run it scans the notification_digest_item queue, and for
// every user whose hourly/daily digest window is due, rolls their pending items
// into one email (enqueued as a mail.send job) and marks them sent. All
// local-time reasoning uses DIGEST_TZ so it matches the web app's quiet-hours /
// digest-hour interpretation.
func notifyDigest(db *pgxpool.Pool) jobworker.Handler {
	return func(ctx context.Context, _ jobq.Job) (map[string]any, error) {
		loc := digestLocation()
		now := time.Now()

		candidates, err := digestCandidates(ctx, db)
		if err != nil {
			return nil, err
		}

		sent := 0
		for _, c := range candidates {
			if !digestDue(c, now, loc) {
				continue
			}
			ok, err := flushUserDigest(ctx, db, c)
			if err != nil {
				// One user failing must not abort the batch; their items stay
				// unsent and are retried on the next run.
				continue
			}
			if ok {
				sent++
			}
		}

		// Keep the queue bounded — drop rows delivered more than a week ago.
		_, _ = db.Exec(ctx, `
			DELETE FROM notification_digest_item
			WHERE sent_at IS NOT NULL AND sent_at < now() - interval '7 days'`)

		return map[string]any{"digests_sent": sent, "candidates": len(candidates)}, nil
	}
}

// digestLocation resolves DIGEST_TZ (default Europe/Berlin), falling back to UTC
// if the zone can't be loaded.
func digestLocation() *time.Location {
	name := os.Getenv("DIGEST_TZ")
	if name == "" {
		name = "Europe/Berlin"
	}
	if loc, err := time.LoadLocation(name); err == nil {
		return loc
	}
	return time.UTC
}

type digestCandidate struct {
	userID   string
	email    string
	locale   string
	freq     string
	hour     int
	lastSent *time.Time
}

// digestCandidates returns every non-banned user with at least one pending
// digest item, plus their cadence config and the timestamp of their last flush.
func digestCandidates(ctx context.Context, db *pgxpool.Pool) ([]digestCandidate, error) {
	rows, err := db.Query(ctx, `
		SELECT d.user_id,
		       u.email,
		       COALESCE(p.locale, 'en'),
		       COALESCE(p.digest->>'frequency', 'daily'),
		       COALESCE((p.digest->>'hour')::int, 9),
		       MAX(d.sent_at)
		FROM notification_digest_item d
		JOIN "user" u ON u.id = d.user_id
		LEFT JOIN user_preferences p ON p.user_id = d.user_id
		WHERE COALESCE(u.banned, false) = false
		GROUP BY d.user_id, u.email, p.locale, p.digest
		HAVING count(*) FILTER (WHERE d.sent_at IS NULL) > 0`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []digestCandidate
	for rows.Next() {
		var c digestCandidate
		if err := rows.Scan(&c.userID, &c.email, &c.locale, &c.freq, &c.hour, &c.lastSent); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// digestDue decides whether a user's batched email should go out now.
//   - hourly: at most once per hour (guarded by the last send time).
//   - daily:  when the local hour equals their chosen hour and nothing has been
//     sent yet on the current local day.
func digestDue(c digestCandidate, now time.Time, loc *time.Location) bool {
	if c.freq == "hourly" {
		// 55m (not 60m) tolerates the 15m scheduler tick drifting the send time.
		return c.lastSent == nil || now.Sub(*c.lastSent) >= 55*time.Minute
	}
	local := now.In(loc)
	if local.Hour() != c.hour {
		return false
	}
	if c.lastSent == nil {
		return true
	}
	ls := c.lastSent.In(loc)
	return ls.Year() != local.Year() || ls.YearDay() != local.YearDay()
}

type digestItem struct {
	id    string
	title string
	url   string
}

// flushUserDigest emails a user's pending items and marks them sent, atomically.
// Returns false (no error) when there was nothing to send. The mail.send insert
// and the sent-stamp share one transaction so a crash can neither drop the mail
// nor resend it.
func flushUserDigest(ctx context.Context, db *pgxpool.Pool, c digestCandidate) (bool, error) {
	rows, err := db.Query(ctx, `
		SELECT id, title, url
		FROM notification_digest_item
		WHERE user_id = $1 AND sent_at IS NULL
		ORDER BY created_at ASC`, c.userID)
	if err != nil {
		return false, err
	}
	var items []digestItem
	var ids []string
	for rows.Next() {
		var it digestItem
		if err := rows.Scan(&it.id, &it.title, &it.url); err != nil {
			rows.Close()
			return false, err
		}
		items = append(items, it)
		ids = append(ids, it.id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return false, err
	}
	if len(items) == 0 {
		return false, nil
	}

	payload, err := json.Marshal(buildDigestMessage(c.email, c.locale, items))
	if err != nil {
		return false, err
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	// Low priority (-100): batched mail yields to transactional/auth mail.
	if _, err := tx.Exec(ctx,
		`INSERT INTO jobs (type, payload, priority) VALUES ('mail.send', $1, -100)`,
		payload); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE notification_digest_item SET sent_at = now() WHERE id = ANY($1)`,
		ids); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

// mailMessage mirrors the web `MailPayload` / Go `mail.Message` shape.
type mailMessage struct {
	To      string `json:"to"`
	Subject string `json:"subject"`
	Text    string `json:"text"`
	HTML    string `json:"html,omitempty"`
}

// buildDigestMessage renders the rollup email. Item titles/urls were already
// localized when queued, so only the surrounding copy is localized here (en/de).
func buildDigestMessage(to, locale string, items []digestItem) mailMessage {
	de := locale == "de"
	n := len(items)

	var subject, intro, eyebrow, footer, manage string
	if de {
		subject = fmt.Sprintf("[Trackr] %d neue Benachrichtigungen", n)
		eyebrow = fmt.Sprintf("Zusammenfassung · %d Neue", n)
		if n == 1 {
			subject = "[Trackr] 1 neue Benachrichtigung"
			eyebrow = "Zusammenfassung · 1 Neue"
		}
		intro = "Sie haben neue Aktivität in Trackr:"
		footer = "Trackr · Sie erhalten diese Zusammenfassung, weil es Aktivität in Ihrem Trackr-Konto gab."
		manage = "Benachrichtigungen verwalten"
	} else {
		subject = fmt.Sprintf("[Trackr] %d new notifications", n)
		eyebrow = fmt.Sprintf("Digest · %d new", n)
		if n == 1 {
			subject = "[Trackr] 1 new notification"
			eyebrow = "Digest · 1 new"
		}
		intro = "You have new activity in Trackr:"
		footer = "Trackr · You're receiving this digest because of activity in your Trackr account."
		manage = "Manage notifications"
	}

	var text strings.Builder
	text.WriteString(intro)
	text.WriteString("\n\n")
	for _, it := range items {
		text.WriteString("• ")
		text.WriteString(it.title)
		text.WriteString("\n  ")
		text.WriteString(it.url)
		text.WriteString("\n\n")
	}
	text.WriteString("— Trackr")

	const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`

	// Hairline-separated item rows, matching the web templates' meta table.
	var list strings.Builder
	for i, it := range items {
		bottom := ""
		if i == len(items)-1 {
			bottom = "border-bottom:1px solid #eeece9;"
		}
		list.WriteString(fmt.Sprintf(
			`<tr><td style="padding:9px 0;border-top:1px solid #eeece9;%sfont-family:%s;font-size:13.5px;line-height:1.5;">`+
				`<a href="%s" target="_blank" style="color:#191a1e;text-decoration:none;font-weight:600;">%s</a></td></tr>`,
			bottom, font, html.EscapeString(it.url), html.EscapeString(it.title)))
	}

	// Settings link derived from the first item's absolute URL (the worker has
	// no origin of its own); dropped if the URL doesn't parse.
	manageLink := ""
	if u, err := neturl.Parse(items[0].url); err == nil && u.Scheme != "" && u.Host != "" {
		manageLink = fmt.Sprintf(
			`<br /><a href="%s://%s/me/settings" target="_blank" style="color:#cf5447;text-decoration:none;">%s</a>`,
			u.Scheme, u.Host, html.EscapeString(manage))
	}

	// Same static-light shell as the web templates (mail-layout.ts): centered
	// brand bars, white card with warm hairline, forced-light color scheme.
	brand := `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>` +
		`<td valign="middle" style="font-size:0;line-height:0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>` +
		`<td width="4" valign="middle" style="padding-right:3px;font-size:0;line-height:0;"><div style="width:4px;height:18px;background-color:#FF4867;border-radius:1px;font-size:0;line-height:18px;">&nbsp;</div></td>` +
		`<td width="4" valign="middle" style="padding-right:3px;font-size:0;line-height:0;"><div style="width:4px;height:18px;background-color:#FF4867;border-radius:1px;font-size:0;line-height:18px;">&nbsp;</div></td>` +
		`<td width="4" valign="middle" style="font-size:0;line-height:0;"><div style="width:4px;height:18px;background-color:#FF4867;border-radius:1px;font-size:0;line-height:18px;">&nbsp;</div></td>` +
		`</tr></table></td>` +
		`<td width="10" style="font-size:0;line-height:0;">&nbsp;</td>` +
		fmt.Sprintf(`<td valign="middle" style="font-family:%s;font-size:17px;font-weight:700;letter-spacing:-0.02em;color:#191a1e;">Trackr</td>`, font) +
		`</tr></table>`

	htmlBody := fmt.Sprintf(`<!doctype html>
<html lang="%s"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/><meta name="supported-color-schemes" content="light"/>
<style>:root { color-scheme: light only; supported-color-schemes: light; }</style></head>
<body style="margin:0;padding:0;background-color:#ffffff;">
	<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;">
		<tr><td align="center" bgcolor="#ffffff" style="padding:0 16px;background-color:#ffffff;">
			<table role="presentation" width="452" cellpadding="0" cellspacing="0" border="0" style="width:100%%;max-width:452px;">
				<tr><td align="center" bgcolor="#ffffff" style="padding:44px 0 24px;background-color:#ffffff;">%s</td></tr>
				<tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #e4e2df;border-radius:16px;padding:26px 28px 24px;box-shadow:0 8px 24px -14px rgba(40,30,30,0.14), 0 2px 4px rgba(40,30,30,0.04);">
					<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0">
						<tr><td style="font-family:%s;font-size:11px;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:#787a7f;padding:0 0 12px;">%s</td></tr>
						<tr><td style="font-family:%s;font-size:14px;line-height:1.6;color:#4e5054;padding:0 0 14px;">%s</td></tr>
						%s
					</table>
				</td></tr>
				<tr><td align="center" bgcolor="#ffffff" style="font-family:%s;font-size:11.5px;line-height:1.7;color:#909297;padding:18px 12px 44px;background-color:#ffffff;">%s%s</td></tr>
			</table>
		</td></tr>
	</table>
</body></html>`, locale, brand, font, html.EscapeString(eyebrow), font, html.EscapeString(intro), list.String(), font, html.EscapeString(footer), manageLink)

	return mailMessage{To: to, Subject: subject, Text: text.String(), HTML: htmlBody}
}
