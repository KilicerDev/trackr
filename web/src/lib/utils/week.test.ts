import { describe, expect, test } from 'bun:test';
import { dayProjectGroups, placeWeekTasks, remainingMinutes, type PlaceableTask } from './week';

const projects: Record<string, { name: string; color: string }> = {
	SCM: { name: 'Smart Climate Monitoring', color: '#7fc8a9' },
	KHZ: { name: 'KHZ Internal', color: '#9b8cf0' }
};
const resolve = (key: string) => projects[key];

describe('dayProjectGroups', () => {
	test('one group per project, sorted by name, task order kept', () => {
		const tasks = [
			{ id: 'SCM-20', project: 'SCM' },
			{ id: 'KHZ-56', project: 'KHZ' },
			{ id: 'SCM-19', project: 'SCM' }
		];
		const groups = dayProjectGroups(tasks, resolve);
		expect(groups.map((g) => g.name)).toEqual(['KHZ Internal', 'Smart Climate Monitoring']);
		expect(groups[1].tasks.map((t) => t.id)).toEqual(['SCM-20', 'SCM-19']);
		expect(groups[1].color).toBe('#7fc8a9');
	});

	test('unknown projects fall back to their key and a neutral colour', () => {
		const [g] = dayProjectGroups([{ project: 'GONE' }], resolve);
		expect(g).toMatchObject({ key: 'GONE', name: 'GONE', color: '#7c7c84' });
	});
});

// Mon 2026-11-09 … Sun 2026-11-15; "today" is Wednesday the 11th.
const WEEK = [
	'2026-11-09',
	'2026-11-10',
	'2026-11-11',
	'2026-11-12',
	'2026-11-13',
	'2026-11-14',
	'2026-11-15'
];
const TODAY = '2026-11-11';
const MON = 0;
const TUE = 1;
const WED = 2;
const THU = 3;

function t(over: Partial<PlaceableTask> & { uuid: string }): PlaceableTask {
	return { project: 'TRACK', status: 'todo', estimate: 120, loggedMinutes: 0, ...over };
}

function place(
	tasks: PlaceableTask[],
	dayLogs: { taskUuid: string; date: string; minutes: number }[] = []
) {
	const days = placeWeekTasks({
		tasks,
		weekDates: WEEK,
		todayIso: TODAY,
		dayLogs,
		defaultEstimate: 60
	});
	return days.map((d) => d.map((e) => `${e.task.uuid}:${e.kind}:${e.minutes}`));
}

describe('remainingMinutes', () => {
	test('estimate minus everything logged, never below zero', () => {
		expect(remainingMinutes(t({ uuid: 'a', estimate: 120, loggedMinutes: 45 }), 60)).toBe(75);
		expect(remainingMinutes(t({ uuid: 'a', estimate: 30, loggedMinutes: 45 }), 60)).toBe(0);
	});
	test('closed tasks have nothing left; no estimate counts the default until logged', () => {
		expect(remainingMinutes(t({ uuid: 'a', status: 'done' }), 60)).toBe(0);
		expect(remainingMinutes(t({ uuid: 'a', estimate: undefined }), 60)).toBe(60);
		expect(remainingMinutes(t({ uuid: 'a', estimate: undefined, loggedMinutes: 10 }), 60)).toBe(0);
	});
});

describe('placeWeekTasks', () => {
	test('a task planned for a future day sits only on that day, counting what is left', () => {
		const days = place([t({ uuid: 'a', plannedFor: WEEK[THU], loggedMinutes: 30 })]);
		expect(days[THU]).toEqual(['a:planned:90']);
		expect(days.flat()).toHaveLength(1);
	});

	test('an unfinished task from an earlier day carries over onto today', () => {
		const days = place(
			[t({ uuid: 'a', plannedFor: WEEK[MON], loggedMinutes: 60 })],
			[{ taskUuid: 'a', date: WEEK[MON], minutes: 60 }]
		);
		expect(days[MON]).toEqual(['a:planned:60']); // what was logged there
		expect(days[WED]).toEqual(['a:carried:60']); // what's left, today
	});

	test('carry-over also reaches back into earlier weeks', () => {
		const days = place([t({ uuid: 'a', plannedFor: '2026-11-05' })]);
		expect(days[WED]).toEqual(['a:carried:120']);
		expect(days.flat()).toHaveLength(1);
	});

	test('done, cancelled and in-review tasks never carry over', () => {
		for (const status of ['done', 'cancelled', 'in_review']) {
			const days = place([t({ uuid: 'a', status, plannedFor: WEEK[MON] })]);
			expect(days[WED]).toEqual([]);
		}
	});

	test('days I worked on a task show it as a chunk with that day’s time', () => {
		const days = place(
			[t({ uuid: 'a', plannedFor: WEEK[THU], loggedMinutes: 75 })],
			[
				{ taskUuid: 'a', date: WEEK[MON], minutes: 45 },
				{ taskUuid: 'a', date: WEEK[TUE], minutes: 30 }
			]
		);
		expect(days[MON]).toEqual(['a:chunk:45']);
		expect(days[TUE]).toEqual(['a:chunk:30']);
		expect(days[THU]).toEqual(['a:planned:45']);
	});

	test('time logged today on a carried task counts as today’s time', () => {
		const days = place(
			[t({ uuid: 'a', plannedFor: WEEK[MON], loggedMinutes: 20 })],
			[{ taskUuid: 'a', date: TODAY, minutes: 20 }]
		);
		expect(days[WED]).toEqual(['a:carried:20']);
	});

	test('no carry-over when viewing a week that doesn’t contain today', () => {
		const days = placeWeekTasks({
			tasks: [t({ uuid: 'a', plannedFor: '2026-11-02' })],
			weekDates: WEEK,
			todayIso: '2026-11-20',
			dayLogs: [],
			defaultEstimate: 60
		});
		expect(days.flat()).toHaveLength(0);
	});
});
