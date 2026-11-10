import { describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { docToMarkdown, messageSchemaExtensions } from './message';

const schema = getSchema(messageSchemaExtensions());

function paragraph(...inline: ReturnType<typeof schema.text>[]) {
	return schema.node('doc', null, [schema.node('paragraph', null, inline)]);
}

describe('message editor links', () => {
	test('the link mark is not inclusive, so typing after a link leaves it', () => {
		expect(schema.marks.link.spec.inclusive).toBe(false);
	});

	test('trailing spaces inside a link are written outside it', () => {
		const link = schema.marks.link.create({ href: 'https://example.com/a' });
		const doc = paragraph(
			schema.text('see '),
			schema.text('https://example.com/a   ', [link]),
			schema.text('then')
		);
		expect(docToMarkdown(doc)).toBe('see [https://example.com/a](https://example.com/a)   then');
	});
});
