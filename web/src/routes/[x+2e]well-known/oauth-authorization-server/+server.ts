import type { RequestHandler } from '@sveltejs/kit';
import { authorizationServerMetadata, preflight } from '../mcp-metadata';

// RFC 8414 discovery for the MCP OAuth server (issuer = this origin).
export const GET: RequestHandler = ({ url, request }) =>
	authorizationServerMetadata(url.origin, request.headers);

export const OPTIONS: RequestHandler = () => preflight();
