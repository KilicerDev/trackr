import type { EmailMessage } from '../types';
import type { EmailTransport, SendResult } from './index';

const HR = '─'.repeat(72);

export class ConsoleTransport implements EmailTransport {
	readonly name = 'console';

	async send(message: EmailMessage): Promise<SendResult> {
		const stamp = new Date().toISOString();
		console.log(
			[
				'',
				`\x1b[36m${HR}\x1b[0m`,
				`\x1b[36m✉  EMAIL (console transport)\x1b[0m  ${stamp}`,
				`\x1b[36m${HR}\x1b[0m`,
				`\x1b[1mTo:\x1b[0m      ${message.to}`,
				`\x1b[1mSubject:\x1b[0m ${message.subject}`,
				'',
				message.text,
				`\x1b[36m${HR}\x1b[0m`,
				''
			].join('\n')
		);
		return {};
	}
}
