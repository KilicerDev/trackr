import { describe, expect, test } from 'bun:test';
import {
	attachmentDownloadUrl,
	checklistMd,
	checklistSummary,
	day,
	iso,
	listMd,
	truncate,
	userName,
	userNames
} from './format';

describe('dates', () => {
	test('iso accepts Date and strings, rejects garbage', () => {
		expect(iso(new Date('2026-09-07T10:00:00Z'))).toBe('2026-09-07T10:00:00.000Z');
		expect(iso('2026-09-07T10:00:00Z')).toBe('2026-09-07T10:00:00.000Z');
		expect(iso(null)).toBeNull();
		expect(iso(undefined)).toBeNull();
		expect(iso('not a date')).toBeNull();
		expect(iso(new Date('x'))).toBeNull();
	});

	test('day keeps date-only strings verbatim and truncates others', () => {
		expect(day('2026-09-07')).toBe('2026-09-07');
		expect(day('2026-09-07T23:59:00Z')).toBe('2026-09-07');
		expect(day(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01-02');
		expect(day('')).toBeNull();
		expect(day(null)).toBeNull();
	});
});

describe('users', () => {
	const dir = new Map([['u1', 'Max']]);
	test('userName falls back to the id, then a dash', () => {
		expect(userName(dir, 'u1')).toBe('Max');
		expect(userName(dir, 'u9')).toBe('u9');
		expect(userName(dir, null)).toBe('—');
	});
	test('userNames joins or dashes', () => {
		expect(userNames(dir, ['u1', 'u9'])).toBe('Max, u9');
		expect(userNames(dir, [])).toBe('—');
		expect(userNames(dir, undefined)).toBe('—');
	});
});

describe('text helpers', () => {
	test('truncate adds an ellipsis within the budget', () => {
		expect(truncate('short', 10)).toBe('short');
		expect(truncate('hello world', 6)).toBe('hello…');
		expect(truncate('hello world', 6)).toHaveLength(6);
	});

	test('attachmentDownloadUrl', () => {
		expect(attachmentDownloadUrl('https://t.example', 'abc')).toBe(
			'https://t.example/api/attachments/abc/download'
		);
	});

	test('checklistMd / checklistSummary', () => {
		const items = [
			{ id: 'a', text: 'one', done: true },
			{ id: 'b', text: 'two', done: false }
		];
		expect(checklistMd(items)).toBe('- [x] one — id `a`\n- [ ] two — id `b`');
		expect(checklistMd([])).toBe('_none_');
		expect(checklistSummary(items)).toBe('1/2');
	});

	test('listMd headings reflect paging', () => {
		expect(listMd('Tasks', ['- a', '- b'], 2)).toBe('## Tasks (2)\n\n- a\n- b');
		expect(listMd('Tasks', ['- a'], 5)).toBe('## Tasks (showing 1 of 5)\n\n- a');
		expect(listMd('Tasks', [], 0)).toBe('## Tasks (0)\n\n_none_');
	});
});
