import { describe, expect, test } from 'bun:test';
import { CLOSED_TASK_STATUSES, isClosedStatus } from './task';

describe('isClosedStatus', () => {
	test('done and cancelled are closed', () => {
		for (const s of CLOSED_TASK_STATUSES) expect(isClosedStatus(s)).toBe(true);
	});

	test('everything else, including in review, is still open', () => {
		for (const s of [
			'backlog',
			'todo',
			'in_progress',
			'paused',
			'in_review',
			'',
			null,
			undefined
		]) {
			expect(isClosedStatus(s)).toBe(false);
		}
	});
});
