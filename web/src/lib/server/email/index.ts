import { getTransport } from './transport';
import type { EmailMessage } from './types';

export type { EmailMessage } from './types';

export async function sendEmail(message: EmailMessage): Promise<void> {
	const transport = getTransport();
	try {
		await transport.send(message);
	} catch (err) {
		console.error(`[email:${transport.name}] send failed`, {
			to: message.to,
			subject: message.subject,
			error: err
		});
		throw err;
	}
}

export function sendEmailFireAndForget(message: EmailMessage): void {
	void sendEmail(message).catch(() => {
		// already logged in sendEmail
	});
}
