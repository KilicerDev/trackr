package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	neturl "net/url"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KilicerDev/trackr/services/shared/jobq"
	"github.com/KilicerDev/trackr/services/shared/jobworker"
	"github.com/KilicerDev/trackr/services/worker/internal/webhook"
)

// webhookDeliverPayload mirrors WebhookDeliverPayload in
// web/src/lib/server/jobs/services/webhook.ts.
type webhookDeliverPayload struct {
	DeliveryID string `json:"deliveryId"`
}

// Retry schedule after a failed attempt (attempt 1 → wait 1m before attempt 2,
// …). A delivery is exhausted after len(schedule)+1 attempts.
var webhookRetrySchedule = []time.Duration{
	1 * time.Minute,
	5 * time.Minute,
	30 * time.Minute,
	2 * time.Hour,
	12 * time.Hour,
}

// Auto-disable: this many exhausted deliveries in a row, with no successful
// delivery in the last autoDisableWindow, switches the subscription off.
const (
	autoDisableFailures = 5
	autoDisableWindow   = 72 * time.Hour
)

type deliveryRow struct {
	id             string
	status         string
	attempt        int
	subscriptionID string
	subName        string
	url            string
	secret         string
	enabled        bool
	eventType      string
	payload        []byte
}

// deliverWebhook returns the `webhook.deliver` handler. The job is one-shot:
// every outcome that is "the receiver's fault" is recorded on the delivery row
// and the handler returns nil so the engine never applies its own backoff.
// Only infrastructure errors (DB down) bubble up.
func deliverWebhook(db *pgxpool.Pool, client *webhook.Client) jobworker.Handler {
	return func(ctx context.Context, job jobq.Job) (map[string]any, error) {
		var p webhookDeliverPayload
		if err := json.Unmarshal(job.Payload, &p); err != nil {
			return nil, fmt.Errorf("invalid payload: %w", err)
		}
		if p.DeliveryID == "" {
			return nil, errors.New("webhook.deliver: missing deliveryId")
		}

		var d deliveryRow
		err := db.QueryRow(ctx, `
			SELECT d.id, d.status, d.attempt, d.subscription_id, s.name, s.url, s.secret, s.enabled,
			       e.type, e.payload
			FROM webhook_delivery d
			JOIN webhook_subscription s ON s.id = d.subscription_id
			JOIN webhook_event e ON e.id = d.event_id
			WHERE d.id = $1`, p.DeliveryID).Scan(
			&d.id, &d.status, &d.attempt, &d.subscriptionID, &d.subName, &d.url, &d.secret, &d.enabled,
			&d.eventType, &d.payload)
		if errors.Is(err, pgx.ErrNoRows) {
			// Pruned or cascaded away — nothing to do.
			return map[string]any{"skipped": "delivery not found"}, nil
		}
		if err != nil {
			return nil, fmt.Errorf("webhook.deliver: loading delivery: %w", err)
		}
		if d.status != "pending" && d.status != "failed" {
			return map[string]any{"skipped": "delivery is " + d.status}, nil
		}
		if !d.enabled {
			_, err := db.Exec(ctx, `
				UPDATE webhook_delivery SET status = 'cancelled', next_attempt_at = NULL, updated_at = now()
				WHERE id = $1`, d.id)
			if err != nil {
				return nil, err
			}
			return map[string]any{"skipped": "subscription disabled"}, nil
		}

		attempt := d.attempt + 1
		res := client.Do(ctx, webhook.Request{
			URL:        d.url,
			Secret:     d.secret,
			EventType:  d.eventType,
			DeliveryID: d.id,
			Body:       d.payload,
		})

		var errText *string
		if res.Err != nil {
			s := res.Err.Error()
			errText = &s
		}
		var status *int
		if res.StatusCode > 0 {
			status = &res.StatusCode
		}
		headersJSON, _ := json.Marshal(res.Headers)

		tx, err := db.Begin(ctx)
		if err != nil {
			return nil, err
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `
			INSERT INTO webhook_delivery_attempt
				(id, delivery_id, attempt, status_code, error, duration_ms, request_headers, response_snippet)
			VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)`,
			d.id, attempt, status, errText, res.Duration.Milliseconds(), headersJSON, nullIfEmpty(res.Body),
		); err != nil {
			return nil, err
		}

		result := map[string]any{"attempt": attempt, "status": res.StatusCode, "durationMs": res.Duration.Milliseconds()}

		if res.Ok() {
			if _, err := tx.Exec(ctx, `
				UPDATE webhook_delivery
				SET status = 'success', attempt = $2, next_attempt_at = NULL, last_status_code = $3,
				    last_error = NULL, last_duration_ms = $4, response_snippet = $5, updated_at = now()
				WHERE id = $1`, d.id, attempt, status, res.Duration.Milliseconds(), nullIfEmpty(res.Body)); err != nil {
				return nil, err
			}
			if _, err := tx.Exec(ctx, `
				UPDATE webhook_subscription SET consecutive_failures = 0, last_success_at = now()
				WHERE id = $1`, d.subscriptionID); err != nil {
				return nil, err
			}
			result["outcome"] = "success"
			return result, tx.Commit(ctx)
		}

		// Failed attempt: schedule the next one or exhaust.
		if attempt <= len(webhookRetrySchedule) {
			wait := webhookRetrySchedule[attempt-1]
			next := time.Now().Add(wait)
			if _, err := tx.Exec(ctx, `
				UPDATE webhook_delivery
				SET status = 'failed', attempt = $2, next_attempt_at = $3, last_status_code = $4,
				    last_error = $5, last_duration_ms = $6, response_snippet = $7, updated_at = now()
				WHERE id = $1`, d.id, attempt, next, status, errText, res.Duration.Milliseconds(), nullIfEmpty(res.Body)); err != nil {
				return nil, err
			}
			payload, _ := json.Marshal(webhookDeliverPayload{DeliveryID: d.id})
			if _, _, err := jobq.Enqueue(ctx, tx, jobq.EnqueueParams{
				Type:        "webhook.deliver",
				Payload:     payload,
				MaxAttempts: 1,
				ScheduledAt: next,
				DedupeKey:   fmt.Sprintf("%s:%d", d.id, attempt+1),
			}); err != nil {
				return nil, err
			}
			result["outcome"] = "retry"
			result["retryIn"] = wait.String()
			return result, tx.Commit(ctx)
		}

		if _, err := tx.Exec(ctx, `
			UPDATE webhook_delivery
			SET status = 'exhausted', attempt = $2, next_attempt_at = NULL, last_status_code = $3,
			    last_error = $4, last_duration_ms = $5, response_snippet = $6, updated_at = now()
			WHERE id = $1`, d.id, attempt, status, errText, res.Duration.Milliseconds(), nullIfEmpty(res.Body)); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE webhook_subscription
			SET consecutive_failures = consecutive_failures + 1, last_failure_at = now()
			WHERE id = $1`, d.subscriptionID); err != nil {
			return nil, err
		}

		// Auto-disable when the endpoint has been dead for a while.
		var disabledName string
		err = tx.QueryRow(ctx, `
			UPDATE webhook_subscription
			SET enabled = false, disabled_reason = 'failures', updated_at = now()
			WHERE id = $1 AND enabled
			  AND consecutive_failures >= $2
			  AND (last_success_at IS NULL OR last_success_at < now() - $3::interval)
			RETURNING name`, d.subscriptionID, autoDisableFailures, autoDisableWindow.String()).Scan(&disabledName)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		result["outcome"] = "exhausted"
		if err == nil {
			if err := notifyWebhookDisabled(ctx, tx, d.subscriptionID, disabledName, originFromPayload(d.payload)); err != nil {
				return nil, err
			}
			result["autoDisabled"] = true
		}
		return result, tx.Commit(ctx)
	}
}

// notifyWebhookDisabled writes an inbox notification for every internal-org
// admin and enqueues an email (en/de by the recipient's locale) so someone
// notices a dead endpoint. Runs inside the delivery transaction.
func notifyWebhookDisabled(ctx context.Context, tx pgx.Tx, subID, subName, origin string) error {
	rows, err := tx.Query(ctx, `
		SELECT u.id, u.email, COALESCE(p.locale, 'en')
		FROM organization_member om
		JOIN organization o ON o.id = om.org_id AND o.is_internal
		JOIN "user" u ON u.id = om.user_id
		LEFT JOIN user_preferences p ON p.user_id = u.id
		WHERE om.role IN ('org.admin', 'org.superadmin')`)
	if err != nil {
		return err
	}
	type admin struct{ id, email, locale string }
	var admins []admin
	for rows.Next() {
		var a admin
		if err := rows.Scan(&a.id, &a.email, &a.locale); err != nil {
			rows.Close()
			return err
		}
		admins = append(admins, a)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	path := "/admin/settings/webhooks/" + subID
	link := path
	if origin != "" {
		link = origin + path
	}
	for _, a := range admins {
		title, body, subject, text, htmlBody := webhookDisabledCopy(a.locale, subName, link)
		if _, err := tx.Exec(ctx, `
			INSERT INTO notification (id, recipient_id, kind, title, body, url, entity_type, entity_id)
			VALUES (gen_random_uuid()::text, $1, 'webhookDisabled', $2, $3, $4, 'webhook', $5)`,
			a.id, title, body, path, subID); err != nil {
			return err
		}
		if a.email == "" {
			continue
		}
		payload, _ := json.Marshal(mailMessage{To: a.email, Subject: subject, Text: text, HTML: htmlBody})
		if _, err := tx.Exec(ctx,
			`INSERT INTO jobs (type, payload, priority) VALUES ('mail.send', $1, 0)`, payload); err != nil {
			return err
		}
	}
	return nil
}

func webhookDisabledCopy(locale, name, link string) (title, body, subject, text, htmlBody string) {
	safe := html.EscapeString(name)
	if locale == "de" {
		title = fmt.Sprintf("Webhook „%s“ wurde deaktiviert", name)
		body = "Zustellungen sind über mehrere Tage fehlgeschlagen. Prüfe den Endpunkt und aktiviere den Webhook erneut."
		subject = "[Trackr] Webhook deaktiviert"
		text = fmt.Sprintf("%s\n\n%s\n\n%s\n\n— Trackr", title, body, link)
		htmlBody = fmt.Sprintf(`<p><strong>Webhook „%s“ wurde deaktiviert</strong></p><p>%s</p><p><a href="%s">Webhook öffnen</a></p>`, safe, html.EscapeString(body), html.EscapeString(link))
		return
	}
	title = fmt.Sprintf("Webhook \"%s\" was disabled", name)
	body = "Deliveries kept failing for several days. Check the endpoint and re-enable the webhook."
	subject = "[Trackr] Webhook disabled"
	text = fmt.Sprintf("%s\n\n%s\n\n%s\n\n— Trackr", title, body, link)
	htmlBody = fmt.Sprintf(`<p><strong>Webhook "%s" was disabled</strong></p><p>%s</p><p><a href="%s">Open webhook</a></p>`, safe, html.EscapeString(body), html.EscapeString(link))
	return
}

// originFromPayload recovers "https://host" from the event's entity url so the
// admin email can carry an absolute link (the worker has no origin of its own).
func originFromPayload(payload []byte) string {
	var env struct {
		Data map[string]json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(payload, &env); err != nil {
		return ""
	}
	for _, raw := range env.Data {
		var obj struct {
			URL string `json:"url"`
		}
		if json.Unmarshal(raw, &obj) == nil && obj.URL != "" {
			if u, err := neturl.Parse(obj.URL); err == nil && u.Scheme != "" && u.Host != "" {
				return u.Scheme + "://" + u.Host
			}
		}
	}
	return ""
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// pruneWebhookDeliveries returns the `prune.webhook_deliveries` handler:
// deletes webhook events (and, via cascade, their deliveries and attempts)
// older than olderThanDays.
func pruneWebhookDeliveries(db *pgxpool.Pool) jobworker.Handler {
	return func(ctx context.Context, job jobq.Job) (map[string]any, error) {
		var p prunePayload
		if err := json.Unmarshal(job.Payload, &p); err != nil {
			return nil, fmt.Errorf("invalid payload: %w", err)
		}
		if p.OlderThanDays <= 0 {
			return nil, fmt.Errorf("olderThanDays must be > 0, got %d", p.OlderThanDays)
		}
		tag, err := db.Exec(ctx, `
			DELETE FROM webhook_event
			WHERE created_at < now() - make_interval(days => $1)`, p.OlderThanDays)
		if err != nil {
			return nil, err
		}
		return map[string]any{"deleted": tag.RowsAffected()}, nil
	}
}
