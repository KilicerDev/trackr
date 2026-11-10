import { describe, expect, test } from 'bun:test';
import {
	formatDate,
	formatDateLong,
	formatDateShort,
	formatDateTime,
	formatDateTimeIn
} from './format';

describe('date formatting (dd.mm.yyyy)', () => {
	test('a bare calendar day is shown as written', () => {
		expect(formatDate('2026-11-03')).toBe('03.11.2026');
		expect(formatDateLong('2026-11-03')).toBe('03.11.2026');
		expect(formatDateShort('2026-11-03')).toBe('03.11.');
		expect(formatDateTime('2026-11-03')).toBe('03.11.2026');
	});

	test('timestamps use local time and add HH:mm', () => {
		const d = new Date(2026, 0, 5, 9, 7);
		expect(formatDate(d)).toBe('05.01.2026');
		expect(formatDateTime(d)).toBe('05.01.2026, 09:07');
		expect(formatDateTime(d.toISOString())).toBe('05.01.2026, 09:07');
	});

	test('empty and unparseable input', () => {
		expect(formatDate(null)).toBe('');
		expect(formatDate(undefined)).toBe('');
		expect(formatDate('soon')).toBe('soon');
	});
});

test('formatDateTimeIn renders in the given zone', () => {
	const d = new Date(Date.UTC(2026, 10, 13, 23, 30));
	expect(formatDateTimeIn(d, 'Europe/Berlin')).toBe('14.11.2026, 00:30');
	expect(formatDateTimeIn(d, 'UTC')).toBe('13.11.2026, 23:30');
});
