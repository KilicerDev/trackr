import { env } from '$env/dynamic/private';
import type { EmailMessage } from '../types';
import { ConsoleTransport } from './console';
import { SmtpTransport } from './smtp';

export type SendResult = {
	providerId?: string;
};

export interface EmailTransport {
	readonly name: string;
	send(message: EmailMessage): Promise<SendResult>;
}

export function getTransport(): EmailTransport {
	return env.SMTP_HOST ? new SmtpTransport() : new ConsoleTransport();
}
