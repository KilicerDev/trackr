import { describe, expect, test } from 'bun:test';
import { buildRefToken, plainifyRefs, REF_RE, refUrl } from './refs';

describe('entity refs', () => {
	test('buildRefToken', () => {
		expect(buildRefToken('SIWEB-15', 'task', 'abc')).toBe('~[SIWEB-15](task:abc)');
	});

	test('plainifyRefs flattens to the display id', () => {
		const s = 'see ~[SIWEB-15](task:abc) and ~[SGP-2](ticket:def), not ~[x](y)';
		expect(plainifyRefs(s)).toBe('see SIWEB-15 and SGP-2, not ~[x](y)');
		expect(plainifyRefs(null)).toBe('');
	});

	test('REF_RE requires a known type prefix', () => {
		expect([...'~[A](task:1)'.matchAll(REF_RE)]).toHaveLength(1);
		expect([...'~[A](user:1)'.matchAll(REF_RE)]).toHaveLength(0);
		expect([...'![A](task:1)'.matchAll(REF_RE)]).toHaveLength(0);
	});

	test('refUrl per type', () => {
		expect(refUrl('ticket', 'id1', 'SGP-2')).toBe('/tickets/id1');
		expect(refUrl('task', 'id2', 'SIWEB-15')).toBe('/tasks?task=SIWEB-15');
		expect(refUrl('project', 'id3', 'SIWEB')).toBe('/projects/id3');
	});
});
