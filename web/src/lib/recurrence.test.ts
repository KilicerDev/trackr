import { describe, expect, test } from 'bun:test';
import {
	addDays,
	nextOccurrence,
	parseSchedule,
	upcomingOccurrences,
	zonedInstant,
	type RecurrenceSchedule
} from './recurrence';

const BERLIN = 'Europe/Berlin';

function sched(
	over: Partial<RecurrenceSchedule> & Pick<RecurrenceSchedule, 'rule'>
): RecurrenceSchedule {
	return { time: '09:00', timezone: BERLIN, startsOn: '2026-01-01', endsOn: null, ...over };
}
const dates = (s: RecurrenceSchedule, after: string, n: number) =>
	upcomingOccurrences(s, new Date(after), n).map((o) => o.date);

describe('recurrence: zonedInstant', () => {
	test('converts local wall time to UTC across DST', () => {
		const winter = zonedInstant(new Date('2026-01-15T00:00:00Z'), '09:00', BERLIN);
		expect(winter.toISOString()).toBe('2026-01-15T08:00:00.000Z');
		const summer = zonedInstant(new Date('2026-07-15T00:00:00Z'), '09:00', BERLIN);
		expect(summer.toISOString()).toBe('2026-07-15T07:00:00.000Z');
		const ny = zonedInstant(new Date('2026-07-15T00:00:00Z'), '09:00', 'America/New_York');
		expect(ny.toISOString()).toBe('2026-07-15T13:00:00.000Z');
	});
});

describe('recurrence: nextOccurrence', () => {
	test('daily fires later today when the slot has not passed', () => {
		const s = sched({ rule: { freq: 'daily', interval: 1 } });
		expect(nextOccurrence(s, new Date('2026-03-10T07:59:00Z'))?.date).toBe('2026-03-10');
		expect(nextOccurrence(s, new Date('2026-03-10T08:00:00Z'))?.date).toBe('2026-03-11');
	});

	test('daily with an interval counts from startsOn', () => {
		const s = sched({ rule: { freq: 'daily', interval: 3 }, startsOn: '2026-03-01' });
		expect(dates(s, '2026-03-02T00:00:00Z', 3)).toEqual(['2026-03-04', '2026-03-07', '2026-03-10']);
	});

	test('weekly on several weekdays, every other week', () => {
		// 2026-03-02 is a Monday.
		const s = sched({
			rule: { freq: 'weekly', interval: 2, weekdays: [1, 4] },
			startsOn: '2026-03-02'
		});
		expect(dates(s, '2026-03-01T00:00:00Z', 4)).toEqual([
			'2026-03-02',
			'2026-03-05',
			'2026-03-16',
			'2026-03-19'
		]);
	});

	test('weekly defaults to the start day', () => {
		const s = sched({ rule: { freq: 'weekly', interval: 1 }, startsOn: '2026-03-04' }); // Wednesday
		expect(dates(s, '2026-03-01T00:00:00Z', 2)).toEqual(['2026-03-04', '2026-03-11']);
	});

	test('monthly on the 31st clamps to short months', () => {
		const s = sched({
			rule: { freq: 'monthly', interval: 1, monthDay: 31 },
			startsOn: '2026-01-01'
		});
		expect(dates(s, '2026-01-01T00:00:00Z', 4)).toEqual([
			'2026-01-31',
			'2026-02-28',
			'2026-03-31',
			'2026-04-30'
		]);
	});

	test('quarterly via monthly interval 3', () => {
		const s = sched({ rule: { freq: 'monthly', interval: 3 }, startsOn: '2026-01-15' });
		expect(dates(s, '2026-01-01T00:00:00Z', 3)).toEqual(['2026-01-15', '2026-04-15', '2026-07-15']);
	});

	test('yearly on Feb 29 falls back to Feb 28', () => {
		const s = sched({ rule: { freq: 'yearly', interval: 1 }, startsOn: '2028-02-29' });
		expect(dates(s, '2028-01-01T00:00:00Z', 3)).toEqual(['2028-02-29', '2029-02-28', '2030-02-28']);
	});

	test('never fires before startsOn and stops after endsOn', () => {
		const s = sched({
			rule: { freq: 'daily', interval: 1 },
			startsOn: '2026-05-10',
			endsOn: '2026-05-12'
		});
		expect(dates(s, '2026-01-01T00:00:00Z', 10)).toEqual([
			'2026-05-10',
			'2026-05-11',
			'2026-05-12'
		]);
		expect(nextOccurrence(s, new Date('2026-05-12T12:00:00Z'))).toBeNull();
	});

	test('fires at the local time in the series timezone', () => {
		const s = sched({
			rule: { freq: 'daily', interval: 1 },
			time: '23:30',
			timezone: 'Asia/Tokyo'
		});
		const n = nextOccurrence(s, new Date('2026-06-01T00:00:00Z'));
		expect(n?.date).toBe('2026-06-01');
		expect(n?.at.toISOString()).toBe('2026-06-01T14:30:00.000Z');
	});
});

describe('recurrence: parseSchedule', () => {
	test('accepts a full schedule and normalises weekdays', () => {
		const r = parseSchedule({
			rule: { freq: 'weekly', interval: 1, weekdays: [5, 1, 1] },
			time: '08:15',
			timezone: BERLIN,
			startsOn: '2026-03-02',
			endsOn: ''
		});
		expect(r).toEqual({
			ok: true,
			value: {
				rule: { freq: 'weekly', interval: 1, weekdays: [1, 5] },
				time: '08:15',
				timezone: BERLIN,
				startsOn: '2026-03-02',
				endsOn: null
			}
		});
	});

	test('rejects bad input', () => {
		expect(parseSchedule({ rule: { freq: 'hourly' }, startsOn: '2026-01-01' }).ok).toBe(false);
		expect(parseSchedule({ rule: { freq: 'daily', interval: 0 }, startsOn: '2026-01-01' }).ok).toBe(
			false
		);
		expect(parseSchedule({ rule: { freq: 'daily' }, startsOn: '2026-02-30' }).ok).toBe(false);
		expect(
			parseSchedule({ rule: { freq: 'daily' }, startsOn: '2026-01-01', time: '25:00' }).ok
		).toBe(false);
		expect(
			parseSchedule({ rule: { freq: 'daily' }, startsOn: '2026-01-01', timezone: 'Mars/Base' }).ok
		).toBe(false);
		expect(
			parseSchedule({ rule: { freq: 'daily' }, startsOn: '2026-02-01', endsOn: '2026-01-01' }).ok
		).toBe(false);
	});
});

test('recurrence: addDays gives the UTC-midnight due date', () => {
	expect(addDays('2026-02-27', 2).toISOString()).toBe('2026-03-01T00:00:00.000Z');
});
