// Pure helpers behind the task side panel (Inspector): the time card numbers
// and the merged "Linked" list. Kept free of Svelte so they're unit-tested.
import type { StatusId } from '$lib/types';
import { isClosedStatus } from './task';

export type TimeSummary = {
	logged: number;
	estimate: number | null;
	/** Share of the bar filled by logged time within the estimate (0–100). */
	fillPct: number;
	/** Share of the bar taken by time over the estimate (0–100). */
	overPct: number;
	/** Minutes left of the estimate (0 when over or without one). */
	left: number;
	/** Minutes logged beyond the estimate (0 when within). */
	over: number;
};

export function timeSummary(logged: number, estimate: number | null | undefined): TimeSummary {
	const est = estimate && estimate > 0 ? estimate : null;
	if (est === null) {
		return { logged, estimate: null, fillPct: logged > 0 ? 100 : 0, overPct: 0, left: 0, over: 0 };
	}
	if (logged <= est) {
		return {
			logged,
			estimate: est,
			fillPct: (logged / est) * 100,
			overPct: 0,
			left: est - logged,
			over: 0
		};
	}
	// Over the estimate: the bar shows the whole logged span, the estimate as
	// the accent part and the excess as the warning part.
	const over = logged - est;
	return {
		logged,
		estimate: est,
		fillPct: (est / logged) * 100,
		overPct: (over / logged) * 100,
		left: 0,
		over
	};
}

export type LinkedKind = 'prerequisite' | 'dependent' | 'ticket' | 'parent';

export type LinkedItem = {
	kind: LinkedKind;
	key: string;
	/** Display id (task / ticket key). */
	ref: string;
	title: string;
	status?: StatusId;
	href: string;
	/** An open prerequisite: this task waits on it. */
	blocking: boolean;
	/** Removable from the panel (prerequisites only). */
	removable: boolean;
	uuid?: string;
};

type Link = { uuid: string; id: string; title: string; status: StatusId };

/**
 * One "Linked" list: open prerequisites first (they block this task), then
 * finished ones, then tasks waiting on this one, then the source ticket and
 * the parent task.
 */
export function linkedItems(opts: {
	dependsOn: Link[];
	dependents: Link[];
	sourceTicket?: { id: string; displayId: string } | null;
	parent?: string | null;
}): LinkedItem[] {
	const pre = opts.dependsOn.map<LinkedItem>((d) => ({
		kind: 'prerequisite',
		key: `pre:${d.uuid}`,
		ref: d.id,
		title: d.title,
		status: d.status,
		href: `/tasks?task=${d.id}`,
		blocking: !isClosedStatus(d.status),
		removable: true,
		uuid: d.uuid
	}));
	pre.sort((a, b) => Number(b.blocking) - Number(a.blocking));
	const dep = opts.dependents.map<LinkedItem>((d) => ({
		kind: 'dependent',
		key: `dep:${d.uuid}`,
		ref: d.id,
		title: d.title,
		status: d.status,
		href: `/tasks?task=${d.id}`,
		blocking: false,
		removable: false,
		uuid: d.uuid
	}));
	const out = [...pre, ...dep];
	if (opts.sourceTicket) {
		out.push({
			kind: 'ticket',
			key: `ticket:${opts.sourceTicket.id}`,
			ref: opts.sourceTicket.displayId,
			title: opts.sourceTicket.displayId,
			href: `/tickets/${opts.sourceTicket.id}`,
			blocking: false,
			removable: false
		});
	}
	if (opts.parent) {
		out.push({
			kind: 'parent',
			key: `parent:${opts.parent}`,
			ref: opts.parent,
			title: opts.parent,
			href: `/tasks?task=${opts.parent}`,
			blocking: false,
			removable: false
		});
	}
	return out;
}
