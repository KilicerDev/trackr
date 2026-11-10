import { describe, expect, test } from 'bun:test';
import { dayProjectGroups } from './week';

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
