import type { RequestHandler } from '@sveltejs/kit';
import { preflight, protectedResourceMetadata } from '../mcp-metadata';

// RFC 9728 metadata for the MCP endpoint. Served at the origin root for
// clients that only try the host-level document.
export const GET: RequestHandler = ({ url, request }) =>
	protectedResourceMetadata(url.origin, request.headers);

export const OPTIONS: RequestHandler = () => preflight();
