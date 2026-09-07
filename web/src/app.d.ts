import type { User, Session } from 'better-auth/minimal';
import type { Memberships } from '$lib/permissions';
import type { ResolvedPreferences } from '$lib/server/preferences';

// The columns the admin plugin and our `isRoot` field add to the user row.
// Present on both auth paths (session.user and the api-key row).
type AppUser = User & {
	role?: string | null;
	banned?: boolean | null;
	isRoot?: boolean | null;
};

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: AppUser;
			session?: Session;
			memberships?: Memberships;
			isAdmin?: boolean;
			preferences?: ResolvedPreferences;
			// How `user` was authenticated. 'api_key' requests carry no session
			// and are confined to /api/v1 (see hooks.server.ts).
			authKind?: 'session' | 'api_key' | 'oauth';
			apiKeyId?: string;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
