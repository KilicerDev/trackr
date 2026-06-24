import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '$env/dynamic/private';
import type { EmailMessage } from '../types';
import type { EmailTransport, SendResult } from './index';

function parseBool(v: string | undefined, fallback: boolean): boolean {
	if (v === undefined) return fallback;
	const s = v.trim().toLowerCase();
	return s === '1' || s === 'true' || s === 'yes';
}

function parsePort(v: string | undefined, fallback: number): number {
	const n = v ? Number.parseInt(v, 10) : NaN;
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

export class SmtpTransport implements EmailTransport {
	readonly name = 'smtp';

	private readonly transporter: Transporter;
	private readonly from: string;

	constructor() {
		const host = env.SMTP_HOST;
		if (!host) {
			throw new Error('SMTP_HOST is required for SMTP transport');
		}
		const from = env.EMAIL_FROM;
		if (!from) {
			throw new Error('EMAIL_FROM is required for SMTP transport');
		}

		const port = parsePort(env.SMTP_PORT, 587);
		this.transporter = nodemailer.createTransport({
			host,
			port,
			secure: parseBool(env.SMTP_SECURE, port === 465),
			auth:
				env.SMTP_USER || env.SMTP_PASS
					? { user: env.SMTP_USER ?? '', pass: env.SMTP_PASS ?? '' }
					: undefined
		});
		this.from = from;
	}

	async send(message: EmailMessage): Promise<SendResult> {
		const info = await this.transporter.sendMail({
			from: message.from ?? this.from,
			to: message.to,
			subject: message.subject,
			text: message.text,
			html: message.html,
			replyTo: message.replyTo
		});
		return { providerId: info.messageId };
	}
}
