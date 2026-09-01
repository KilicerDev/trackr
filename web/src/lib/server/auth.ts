import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin } from 'better-auth/plugins/admin';
import { bearer } from 'better-auth/plugins/bearer';
import { adminAc, defaultAc, userAc } from 'better-auth/plugins/admin/access';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { sendEmailFireAndForget, passwordResetEmail, EMAIL_PRIORITY } from '$lib/server/jobs';
import { recordAudit } from '$lib/server/audit';

// Where the native (Tauri) app's sign-in lands after the browser round-trip.
// Three places must agree on this scheme: this constant, the app's
// session.svelte.ts DEEP_LINK_PREFIX, and apps/trackr-mobile/src-tauri/
// tauri.conf.json (deep-link plugin config).
export const NATIVE_AUTH_CALLBACK = 'dev.kilicer.trackr://auth';

// Where the CLI's sign-in lands: a loopback HTTP server the CLI runs for the
// duration of `trackr login`. Only the port is caller-controlled — the host
// is pinned to 127.0.0.1, so the redirect can never leave the machine the
// browser runs on (no open-redirect surface).
export const cliAuthCallback = (port: number) => `http://127.0.0.1:${port}/callback`;

function ipFromHeaders(headers: Headers | undefined): string | null {
	if (!headers) return null;
	const fwd = headers.get('x-forwarded-for');
	if (fwd) return fwd.split(',')[0]?.trim() ?? null;
	return headers.get('x-real-ip');
}

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
		sendResetPassword: async ({ user, token }) => {
			// Point at better-auth's API callback (`/api/auth/reset-password/:token`),
			// which validates the token then redirects to the page in `callbackURL`
			// with `?token=`. We build the path ourselves instead of trusting the
			// `url` better-auth generates: with `ORIGIN` unset (host-based routing)
			// its baseURL loses the `/api/auth` basePath, leaving a bare
			// `/reset-password/:token` that hits no page route (404).
			const callbackURL = encodeURIComponent('/reset-password');
			const path = `/api/auth/reset-password/${token}?callbackURL=${callbackURL}`;
			sendEmailFireAndForget(
				passwordResetEmail({ to: user.email, resetUrl: withRequestOrigin(path) }),
				{ priority: EMAIL_PRIORITY.high }
			);
		}
	},
	trustedOrigins: env.ORIGIN ? [env.ORIGIN] : [],
	// Audit: record successful sign-ins as sessions are created (skip
	// impersonation sessions — those are logged from the admin action instead).
	databaseHooks: {
		session: {
			create: {
				after: async (session) => {
					if (session.impersonatedBy) return;
					void recordAudit({
						type: 'login.success',
						actorId: session.userId,
						targetType: 'user',
						targetId: session.userId,
						ipAddress: session.ipAddress ?? null,
						userAgent: session.userAgent ?? null
					});
				}
			}
		}
	},
	// Audit: record failed email sign-ins. The endpoint returns an APIError on
	// bad credentials; the actor is anonymous (we only know the email tried).
	hooks: {
		after: createAuthMiddleware(async (ctx) => {
			if (ctx.path !== '/sign-in/email') return;
			const returned = ctx.context.returned;
			if (!(returned instanceof APIError)) return;
			const email =
				typeof (ctx.body as { email?: unknown } | undefined)?.email === 'string'
					? (ctx.body as { email: string }).email
					: null;
			void recordAudit({
				type: 'login.fail',
				actorId: null,
				actorLabel: email,
				targetType: 'user',
				targetLabel: email,
				ipAddress: ipFromHeaders(ctx.headers),
				userAgent: ctx.headers?.get('user-agent') ?? null,
				meta: { status: returned.status }
			});
		})
	},
	plugins: [
		// Accept `Authorization: Bearer <signed session token>` as an alternative
		// to the session cookie — the native app's only credential. The plugin
		// also mirrors rotated session cookies into a `set-auth-token` response
		// header, which the app adopts opportunistically. Requests from the app
		// go through tauri-plugin-http (no Origin header, no cookies), so no
		// CORS or trustedOrigins changes are needed for it.
		bearer(),
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
