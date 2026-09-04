import type { RequestHandler } from '@sveltejs/kit';
import { preflight, protectedResourceMetadata } from '../../../mcp-metadata';

// RFC 9728 path-scoped metadata: this is the URL the 401 challenge on
// POST /api/mcp points at (`resource_metadata=`), so it must exist here.
export const GET: RequestHandler = ({ url, request }) =>
	protectedResourceMetadata(url.origin, request.headers);

export const OPTIONS: RequestHandler = () => preflight();
