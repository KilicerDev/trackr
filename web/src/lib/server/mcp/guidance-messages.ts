// Localised messages for `GuidanceError` codes (Settings → MCP forms).
// Kept out of guidance.ts so the MCP request path never imports paraglide.

import { m } from '$lib/paraglide/messages';
import type { GuidanceError } from './guidance';

export function guidanceErrorMessage(err: GuidanceError): string {
	switch (err.code) {
		case 'too_long':
			return m.mcp_guide_err_too_long();
		case 'invalid_slug':
			return m.mcp_guide_err_invalid_slug();
		case 'slug_taken':
			return m.mcp_guide_err_slug_taken();
		case 'title_required':
			return m.mcp_guide_err_title_required();
		case 'invalid_url':
			return m.mcp_guide_err_invalid_url();
		case 'fetch_failed':
			return m.mcp_guide_err_fetch_failed({ reason: err.message });
		case 'not_found':
			return m.mcp_guide_err_not_found();
		case 'limit':
			return m.mcp_guide_err_limit({ max: err.message });
	}
}
