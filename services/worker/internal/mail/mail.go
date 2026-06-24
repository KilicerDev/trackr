// Package mail transmits one email to one recipient. It is the transport behind
// the `mail.send` job: /web renders the email (templates live there) and enqueues
// it; this package sends it via SMTP. When no SMTP host is configured it falls
// back to logging the email — the dev convenience the web app used to provide.
package mail

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	gomail "github.com/wneessen/go-mail"
)

// Message is one email to one recipient. Its JSON shape mirrors the web side's
// EmailMessage and the `mail.send` job payload.
type Message struct {
	To      string `json:"to"`
	Subject string `json:"subject"`
	Text    string `json:"text"`
	HTML    string `json:"html,omitempty"`
	From    string `json:"from,omitempty"`
	ReplyTo string `json:"replyTo,omitempty"`
}

// Sender transmits a Message. Send returning an error makes the job retry.
type Sender interface {
	Send(ctx context.Context, m Message) error
}

// Config is the SMTP configuration. When Host is empty, New returns a console
// sender that logs emails instead of transmitting them (zero-config dev).
type Config struct {
	Host     string
	Port     int
	Secure   bool // implicit TLS (e.g. port 465); otherwise opportunistic STARTTLS
	Username string
	Password string
	From     string // default From when a Message doesn't set one
}

// New returns an SMTP sender when cfg.Host is set, otherwise a console sender.
func New(cfg Config, logger *slog.Logger) (Sender, error) {
	if cfg.Host == "" {
		logger.Info("mail: SMTP_HOST unset — using console sender (emails are logged, not delivered)")
		return &consoleSender{logger: logger, from: cfg.From}, nil
	}
	if cfg.From == "" {
		return nil, fmt.Errorf("EMAIL_FROM is required when SMTP_HOST is set")
	}

	opts := []gomail.Option{gomail.WithPort(cfg.Port), gomail.WithTimeout(30 * time.Second)}
	if cfg.Secure {
		opts = append(opts, gomail.WithSSL())
	} else {
		// Use STARTTLS when the server offers it, plaintext otherwise (covers Mailpit).
		opts = append(opts, gomail.WithTLSPortPolicy(gomail.TLSOpportunistic))
	}
	if cfg.Username != "" || cfg.Password != "" {
		opts = append(opts,
			gomail.WithSMTPAuth(gomail.SMTPAuthAutoDiscover),
			gomail.WithUsername(cfg.Username),
			gomail.WithPassword(cfg.Password),
		)
	}

	// Validate the configuration up front (fail fast at boot).
	if _, err := gomail.NewClient(cfg.Host, opts...); err != nil {
		return nil, fmt.Errorf("mail: invalid SMTP configuration: %w", err)
	}

	return &smtpSender{host: cfg.Host, opts: opts, from: cfg.From}, nil
}

type smtpSender struct {
	host string
	opts []gomail.Option
	from string
}

// Send dials a fresh connection per message. A new client per send keeps
// concurrent worker slots independent (go-mail's Client is not safe for
// concurrent DialAndSend on one instance).
func (s *smtpSender) Send(ctx context.Context, m Message) error {
	msg := gomail.NewMsg()

	from := m.From
	if from == "" {
		from = s.from
	}
	if err := msg.From(from); err != nil {
		return fmt.Errorf("invalid From %q: %w", from, err)
	}
	if err := msg.To(m.To); err != nil {
		return fmt.Errorf("invalid To %q: %w", m.To, err)
	}
	if m.ReplyTo != "" {
		if err := msg.ReplyTo(m.ReplyTo); err != nil {
			return fmt.Errorf("invalid ReplyTo %q: %w", m.ReplyTo, err)
		}
	}
	msg.Subject(m.Subject)
	msg.SetBodyString(gomail.TypeTextPlain, m.Text)
	if strings.TrimSpace(m.HTML) != "" {
		msg.AddAlternativeString(gomail.TypeTextHTML, m.HTML)
	}

	client, err := gomail.NewClient(s.host, s.opts...)
	if err != nil {
		return fmt.Errorf("build SMTP client: %w", err)
	}
	if err := client.DialAndSendWithContext(ctx, msg); err != nil {
		return fmt.Errorf("smtp send: %w", err)
	}
	return nil
}

type consoleSender struct {
	logger *slog.Logger
	from   string
}

func (c *consoleSender) Send(_ context.Context, m Message) error {
	from := m.From
	if from == "" {
		from = c.from
	}
	c.logger.Info("mail (console sender)",
		"from", from, "to", m.To, "subject", m.Subject, "body", m.Text)
	return nil
}
