import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin } from 'better-auth/plugins/admin';
import { adminAc, defaultAc, userAc } from 'better-auth/plugins/admin/access';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { sendEmailFireAndForget } from '$lib/server/email';
import { passwordResetEmail } from '$lib/server/email/templates';

// Force the current request's origin onto a better-auth-generated link. Under
// host-based routing `baseURL` (env.ORIGIN) is unset, so the link better-auth
// builds has no reliable domain — we keep its path/query and swap in the real
// origin from the request (the same source notifications use). Falls back to the
// original url if there's no request context (e.g. a background flow).
function withRequestOrigin(url: string): string {
	try {
		const origin = getRequestEvent().url.origin;
		const parsed = new URL(url, origin);
		return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return url;
	}
}

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
		resetPasswordTokenExpiresIn: 60 * 60 * 24,
		sendResetPassword: async ({ user, url }) => {
			sendEmailFireAndForget(
				passwordResetEmail({ to: user.email, resetUrl: withRequestOrigin(url) })
			);
		}
	},
	trustedOrigins: env.ORIGIN ? [env.ORIGIN] : [],
	plugins: [
		admin({
			defaultRole: 'user',
			adminRoles: ['admin', 'superadmin'],
			allowImpersonatingAdmins: true,
			roles: {
				user: userAc,
				admin: adminAc,
				superadmin: defaultAc.newRole({
					user: [
						'create',
						'list',
						'set-role',
						'ban',
						'impersonate',
						'delete',
						'set-password',
						'get',
						'update'
					],
					session: ['list', 'revoke', 'delete']
				})
			}
		}),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
