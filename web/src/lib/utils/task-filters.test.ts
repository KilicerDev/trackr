import { describe, expect, test } from 'bun:test';
import { activeFilterCount, matchesTaskFilters, tagsInUse, UNASSIGNED } from './task-filters';
import type { TaskSummary } from '$lib/types';

const base = {
	id: 'TRACK-1',
	title: 'Fix the sidebar',
	status: 'todo',
	priority: 'medium',
	assignee: 'u1',
	assignees: ['u1', 'u2'],
	project: 'TRACK',
	labels: ['web']
} as unknown as TaskSummary;

const task = (over: Partial<TaskSummary>) => ({ ...base, ...over }) as TaskSummary;

describe('matchesTaskFilters', () => {
	test('no filters match everything', () => {
		expect(matchesTaskFilters(base, {})).toBe(true);
		expect(matchesTaskFilters(base, { status: [] })).toBe(true);
	});

	test('a field matches any of its values; all fields must match', () => {
		expect(matchesTaskFilters(base, { status: ['todo', 'in_progress'] })).toBe(true);
		expect(matchesTaskFilters(base, { status: ['done'] })).toBe(false);
		expect(matchesTaskFilters(base, { status: ['todo'], priority: ['high'] })).toBe(false);
		expect(matchesTaskFilters(base, { project: ['TRACK'], tags: ['web', 'ios'] })).toBe(true);
	});

	test('assignee matches anyone on the task, and the unassigned sentinel', () => {
		expect(matchesTaskFilters(base, { assignee: ['u2'] })).toBe(true);
		expect(matchesTaskFilters(base, { assignee: [UNASSIGNED] })).toBe(false);
		const nobody = task({ assignee: '', assignees: undefined });
		expect(matchesTaskFilters(nobody, { assignee: [UNASSIGNED] })).toBe(true);
	});

	test('search looks at title and id, case-insensitively', () => {
		expect(matchesTaskFilters(base, {}, 'SIDEBAR')).toBe(true);
		expect(matchesTaskFilters(base, {}, 'track-1')).toBe(true);
		expect(matchesTaskFilters(base, {}, 'nope')).toBe(false);
	});
});

test('activeFilterCount counts selected values', () => {
	expect(activeFilterCount({ status: ['todo', 'done'], tags: [], project: ['TRACK'] })).toBe(3);
});

test('tagsInUse dedupes in first-seen order', () => {
	expect(tagsInUse([{ labels: ['a', 'b'] }, { labels: ['b', 'c'] }, {}])).toEqual(['a', 'b', 'c']);
});
