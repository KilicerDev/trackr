import { describe, expect, test } from 'bun:test';
import { linkedItems, timeSummary } from './task-panel';

describe('timeSummary', () => {
	test('within the estimate: fill share and time left', () => {
		expect(timeSummary(90, 360)).toMatchObject({ fillPct: 25, overPct: 0, left: 270, over: 0 });
	});

	test('over the estimate: estimate and excess split the bar', () => {
		const s = timeSummary(450, 360);
		expect(s.over).toBe(90);
		expect(s.left).toBe(0);
		expect(s.fillPct).toBe(80);
		expect(s.overPct).toBe(20);
	});

	test('no estimate: logged time only', () => {
		expect(timeSummary(0, null)).toMatchObject({ estimate: null, fillPct: 0 });
		expect(timeSummary(30, 0)).toMatchObject({ estimate: null, fillPct: 100, left: 0 });
	});
});

describe('linkedItems', () => {
	const link = (n: number, status: 'todo' | 'done' | 'cancelled') => ({
		uuid: `u${n}`,
		id: `SCM-${n}`,
		title: `Task ${n}`,
		status
	});

	test('open prerequisites first and marked blocking, then dependents, ticket, parent', () => {
		const items = linkedItems({
			dependsOn: [link(1, 'done'), link(2, 'todo'), link(3, 'cancelled')],
			dependents: [link(4, 'todo')],
			sourceTicket: { id: 't1', displayId: 'SG-36' },
			parent: 'SCM-9'
		});
		expect(items.map((i) => `${i.kind}:${i.ref}:${i.blocking}`)).toEqual([
			'prerequisite:SCM-2:true',
			'prerequisite:SCM-1:false',
			'prerequisite:SCM-3:false',
			'dependent:SCM-4:false',
			'ticket:SG-36:false',
			'parent:SCM-9:false'
		]);
		expect(items.find((i) => i.kind === 'ticket')?.href).toBe('/tickets/t1');
		expect(items.filter((i) => i.removable).length).toBe(3);
	});
});
