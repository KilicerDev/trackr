import { describe, expect, test } from 'bun:test';
import { buildMentionToken, parseMentionIds, plainifyMentions, segmentMentions } from './mentions';

const body = 'Hi @[Max Muster](u1), ping @[Maja](u2) and again @[Max Muster](u1).';

describe('mentions', () => {
	test('buildMentionToken', () => {
		expect(buildMentionToken('Max Muster', 'u1')).toBe('@[Max Muster](u1)');
	});

	test('parseMentionIds is unique, first-seen order', () => {
		expect(parseMentionIds(body)).toEqual(['u1', 'u2']);
		expect(parseMentionIds('')).toEqual([]);
		expect(parseMentionIds(null)).toEqual([]);
	});

	test('segmentMentions splits text and chips in order', () => {
		expect(segmentMentions('a @[B](2) c')).toEqual([
			{ type: 'text', value: 'a ' },
			{ type: 'mention', name: 'B', id: '2' },
			{ type: 'text', value: ' c' }
		]);
		expect(segmentMentions('plain')).toEqual([{ type: 'text', value: 'plain' }]);
		expect(segmentMentions('@[X](1)')).toEqual([{ type: 'mention', name: 'X', id: '1' }]);
	});

	test('plainifyMentions flattens to @Name', () => {
		expect(plainifyMentions(body)).toBe('Hi @Max Muster, ping @Maja and again @Max Muster.');
		expect(plainifyMentions(undefined)).toBe('');
	});

	test('the shared g-flag regex is safe to use repeatedly', () => {
		// Two consecutive calls must see all matches (no lastIndex leakage).
		expect(parseMentionIds(body)).toEqual(parseMentionIds(body));
	});
});
