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

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
		resetPasswordTokenExpiresIn: 60 * 60 * 24,
		sendResetPassword: async ({ user, url }) => {
			sendEmailFireAndForget(passwordResetEmail({ to: user.email, resetUrl: url }));
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
