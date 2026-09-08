import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { assertCan } from '$lib/server/permissions';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';
import {
	BRAND_NAME_MAX_CHARS,
	BrandingError,
	clearBrandLogo,
	DEFAULT_BRAND_NAME,
	getBranding,
	LOGO_ACCEPTED_MIMES,
	LOGO_MAX_BYTES,
	setBrandLogo,
	setBrandName
} from '$lib/server/branding';

async function guard(locals: App.Locals) {
	await assertCan(locals, 'admin.settings.manage');
	if (!locals.user) throw error(401, m.settings_err_not_authenticated());
	return locals.user;
}

const LOGO_MAX_KB = Math.round(LOGO_MAX_BYTES / 1024);

function brandingErrorMessage(err: BrandingError): string {
	switch (err.code) {
		case 'name_too_long':
			return m.admin_branding_err_name_too_long({ max: BRAND_NAME_MAX_CHARS });
		case 'logo_type':
			return m.admin_branding_err_logo_type();
		case 'logo_too_large':
			return m.admin_branding_err_logo_size({ max: LOGO_MAX_KB });
		case 'logo_invalid':
			return m.admin_branding_err_logo_invalid();
	}
}

// Browsers usually send the MIME type; fall back to the extension when a
// client leaves it empty (seen with SVGs on some platforms).
const EXT_MIME: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	svg: 'image/svg+xml'
};
function mimeOf(file: File): string {
	if (file.type) return file.type;
	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
	return EXT_MIME[ext] ?? '';
}

export const load: PageServerLoad = async ({ locals }) => {
	await guard(locals);
	const b = await getBranding();
	return {
		branding: { name: b.name, logoUrl: b.logoUrl },
		brandingForm: {
			updatedAt: b.updatedAt,
			defaultName: DEFAULT_BRAND_NAME,
			nameMax: BRAND_NAME_MAX_CHARS,
			logoMaxKb: LOGO_MAX_KB,
			accept: LOGO_ACCEPTED_MIMES.join(',')
		}
	};
};

export const actions: Actions = {
	saveBranding: async ({ request, locals }) => {
		const me = await guard(locals);
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const file = form.get('logo');
		try {
			const before = await getBranding();
			const saved = await setBrandName(name, me.id);
			let logo: 'unchanged' | 'replaced' = 'unchanged';
			if (file instanceof File && file.size > 0) {
				await setBrandLogo(new Uint8Array(await file.arrayBuffer()), mimeOf(file), me.id);
				logo = 'replaced';
			}
			void recordAudit({
				type: 'settings.branding',
				actorId: me.id,
				actorLabel: me.email,
				targetType: 'settings',
				targetId: 'branding',
				targetLabel: saved,
				meta: { name: { from: before.name, to: saved }, logo }
			});
			return { ok: true };
		} catch (err) {
			if (err instanceof BrandingError) return fail(400, { message: brandingErrorMessage(err) });
			throw err;
		}
	},

	removeLogo: async ({ locals }) => {
		const me = await guard(locals);
		const before = await getBranding();
		await clearBrandLogo(me.id);
		void recordAudit({
			type: 'settings.branding',
			actorId: me.id,
			actorLabel: me.email,
			targetType: 'settings',
			targetId: 'branding',
			targetLabel: before.name,
			meta: { logo: 'removed' }
		});
		return { ok: true };
	}
};
