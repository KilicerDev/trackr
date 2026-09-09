import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { assertCan } from '$lib/server/permissions';
import { recordAudit } from '$lib/server/audit';
import { isSuperadmin } from '$lib/roles';
import { canViewUser } from '$lib/server/user-policy';
import { m } from '$lib/paraglide/messages';
import { getMcpConnection, listMcpConnections, revokeMcpConnection } from '$lib/server/mcp/access';
import {
	deleteGuide,
	getInstructions,
	GuidanceError,
	INSTRUCTIONS_MAX_CHARS,
	listGuides,
	refreshGuide,
	setGuideEnabled,
	setInstructions
} from '$lib/server/mcp/guidance';
import { guidanceErrorMessage } from '$lib/server/mcp/guidance-messages';

async function guard(locals: App.Locals) {
	await assertCan(locals, 'admin.settings.manage');
	if (!locals.user) throw error(401, m.settings_err_not_authenticated());
	return locals.user;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = await guard(locals);
	// Per-user MCP access lives in Directory → Users (mcpEnable/mcpDisable);
	// this page owns the guidance layer and the OAuth connection registry.
	const [connections, instructions, guides] = await Promise.all([
		listMcpConnections(),
		getInstructions(),
		listGuides()
	]);
	const mcpUrl = `${url.origin}/api/mcp`;
	return {
		mcpUrl,
		claudeCodeCommand: `claude mcp add --transport http trackr ${mcpUrl}`,
		instructions: instructions.instructions,
		instructionsUpdatedAt: instructions.updatedAt,
		instructionsMax: INSTRUCTIONS_MAX_CHARS,
		guides: guides.map((g) => ({
			id: g.id,
			slug: g.slug,
			title: g.title,
			summary: g.summary,
			sourceUrl: g.sourceUrl,
			fetchedAt: g.fetchedAt,
			enabled: g.enabled,
			updatedAt: g.updatedAt,
			bodyChars: g.body.length
		})),
		// Same tier or below only (admins never see superadmins) — same rule as
		// user management and API keys.
		connections: connections.filter((c) =>
			canViewUser(me, { id: c.userId ?? '', role: c.userRole })
		),
		isSuperadmin: isSuperadmin(me.role)
	};
};

export const actions: Actions = {
	revoke: async ({ request, locals }) => {
		const me = await guard(locals);
		const id = String((await request.formData()).get('id') ?? '').trim();
		const existing = id ? await getMcpConnection(id) : null;
		const owner = existing ? { id: existing.userId ?? '', role: existing.userRole } : null;
		if (!existing || !owner || !canViewUser(me, owner))
			return fail(404, { message: m.mcp_err_not_found() });
		if (!(await revokeMcpConnection(id, me))) return fail(404, { message: m.mcp_err_not_found() });
		void recordAudit({
			type: 'mcp_connection.revoke',
			actorId: me.id,
			targetType: 'mcp_connection',
			targetId: id,
			targetLabel: existing.clientName ?? existing.clientId ?? null,
			meta: {
				userId: existing.userId,
				userName: existing.userName,
				clientId: existing.clientId,
				clientName: existing.clientName
			}
		});
		return { success: true, revoked: id };
	},
	saveInstructions: async ({ request, locals }) => {
		const me = await guard(locals);
		const text = String((await request.formData()).get('instructions') ?? '');
		try {
			await setInstructions(text, me.id);
		} catch (err) {
			if (err instanceof GuidanceError) return fail(400, { message: guidanceErrorMessage(err) });
			throw err;
		}
		void recordAudit({
			type: 'mcp_instructions.update',
			actorId: me.id,
			targetType: 'mcp_settings',
			targetId: 'default',
			meta: { chars: text.trim().length }
		});
		return { success: true, instructions: true };
	},

	guideEnable: async ({ request, locals }) => {
		const me = await guard(locals);
		const id = String((await request.formData()).get('id') ?? '').trim();
		const row = id ? await setGuideEnabled(id, true, me.id) : null;
		if (!row) return fail(404, { message: m.mcp_guide_err_not_found() });
		void recordAudit({
			type: 'mcp_guide.update',
			actorId: me.id,
			targetType: 'mcp_guide',
			targetId: id,
			targetLabel: row.title,
			meta: { enabled: true }
		});
		return { success: true };
	},

	guideDisable: async ({ request, locals }) => {
		const me = await guard(locals);
		const id = String((await request.formData()).get('id') ?? '').trim();
		const row = id ? await setGuideEnabled(id, false, me.id) : null;
		if (!row) return fail(404, { message: m.mcp_guide_err_not_found() });
		void recordAudit({
			type: 'mcp_guide.update',
			actorId: me.id,
			targetType: 'mcp_guide',
			targetId: id,
			targetLabel: row.title,
			meta: { enabled: false }
		});
		return { success: true };
	},

	guideRefresh: async ({ request, locals }) => {
		const me = await guard(locals);
		const id = String((await request.formData()).get('id') ?? '').trim();
		try {
			const row = await refreshGuide(id, me.id);
			void recordAudit({
				type: 'mcp_guide.update',
				actorId: me.id,
				targetType: 'mcp_guide',
				targetId: id,
				targetLabel: row.title,
				meta: { refreshedFrom: row.sourceUrl, chars: row.body.length }
			});
			return { success: true, refreshed: id };
		} catch (err) {
			if (err instanceof GuidanceError) return fail(400, { message: guidanceErrorMessage(err) });
			throw err;
		}
	},

	guideDelete: async ({ request, locals }) => {
		const me = await guard(locals);
		const id = String((await request.formData()).get('id') ?? '').trim();
		const row = id ? await deleteGuide(id) : null;
		if (!row) return fail(404, { message: m.mcp_guide_err_not_found() });
		void recordAudit({
			type: 'mcp_guide.delete',
			actorId: me.id,
			targetType: 'mcp_guide',
			targetId: id,
			targetLabel: row.title,
			meta: { slug: row.slug }
		});
		return { success: true, deleted: id };
	}
};
