import type { RequestHandler } from './$types';

// Liveness/startup probe: proves the process serves HTTP. Deliberately does
// NOT touch the database — a DB outage must fail readiness (stop traffic),
// not liveness (restart loops help nothing there).
export const GET: RequestHandler = () =>
	new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
