import type { User, Session } from 'better-auth/minimal';
import type { Memberships } from '$lib/permissions';
import type { ResolvedPreferences } from '$lib/server/preferences';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: User;
			session?: Session;
			memberships?: Memberships;
			isAdmin?: boolean;
			preferences?: ResolvedPreferences;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
