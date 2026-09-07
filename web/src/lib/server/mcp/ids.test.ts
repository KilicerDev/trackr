import { describe, expect, test } from 'bun:test';
import {
	describeCandidates,
	isUuid,
	normalizeDisplayId,
	normalizeKey,
	parseDisplayId,
	resolveUserRefs
} from './ids';

describe('parseDisplayId', () => {
	test('parses key + number, any case, trimmed', () => {
		expect(parseDisplayId('TRACK-108')).toEqual({ key: 'TRACK', number: 108 });
		expect(parseDisplayId('  web-12 ')).toEqual({ key: 'WEB', number: 12 });
		expect(parseDisplayId('a1-1')).toEqual({ key: 'A1', number: 1 });
	});

	test('rejects malformed ids', () => {
		expect(parseDisplayId('TRACK')).toBeNull();
		expect(parseDisplayId('TRACK-')).toBeNull();
		expect(parseDisplayId('-12')).toBeNull();
		expect(parseDisplayId('1ABC-12')).toBeNull();
		expect(parseDisplayId('TRACK-12x')).toBeNull();
		expect(parseDisplayId('TRACK 12')).toBeNull();
		expect(parseDisplayId('')).toBeNull();
	});

	test('caps key and number length', () => {
		expect(parseDisplayId('ABCDEFGHIJKL-1')).not.toBeNull(); // 12 chars
		expect(parseDisplayId('ABCDEFGHIJKLM-1')).toBeNull(); // 13 chars
		expect(parseDisplayId('A-1234567890')).toBeNull(); // 10 digits
	});
});

describe('normalizers', () => {
	test('normalizeDisplayId / normalizeKey trim + upper-case', () => {
		expect(normalizeDisplayId(' track-1 ')).toBe('TRACK-1');
		expect(normalizeKey(' siweb ')).toBe('SIWEB');
	});

	test('isUuid', () => {
		expect(isUuid('6d31d0e9-3202-4d44-9dd4-0997360faccd')).toBe(true);
		expect(isUuid(' 6D31D0E9-3202-4D44-9DD4-0997360FACCD ')).toBe(true);
		expect(isUuid('6d31d0e9-3202-4d44-9dd4')).toBe(false);
		expect(isUuid('TRACK-1')).toBe(false);
	});
});

describe('resolveUserRefs', () => {
	const candidates = [
		{ id: 'u1', name: 'Max Muster', email: 'max@trackr.dev' },
		{ id: 'u2', name: 'Maja Schmidt', email: 'maja@trackr.dev' },
		{ id: 'u3', name: 'Twin', email: 'twin-a@trackr.dev' },
		{ id: 'u4', name: 'Twin', email: 'twin-b@trackr.dev' }
	];

	test('resolves by id, email (any case) and unambiguous name', () => {
		const r = resolveUserRefs(['u1', 'MAJA@trackr.dev', 'max muster'], candidates);
		expect(r).toEqual({ ids: ['u1', 'u2'], unknown: [] });
	});

	test('ambiguous names and strangers land in unknown', () => {
		const r = resolveUserRefs(['Twin', 'nobody@x.y'], candidates);
		expect(r.ids).toEqual([]);
		expect(r.unknown).toEqual(['Twin', 'nobody@x.y']);
	});

	test('dedupes and skips blanks', () => {
		const r = resolveUserRefs(['u1', ' ', 'max@trackr.dev', ''], candidates);
		expect(r.ids).toEqual(['u1']);
		expect(r.unknown).toEqual([]);
	});

	test('describeCandidates lists rows and truncates', () => {
		const s = describeCandidates(candidates, 2);
		expect(s.split('\n')).toHaveLength(3);
		expect(s).toContain('Max Muster <max@trackr.dev> (id u1)');
		expect(s).toContain('… 2 more');
	});
});
