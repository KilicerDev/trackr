import { describe, expect, test } from 'bun:test';
import {
	absoluteLogoUrl,
	BRAND_NAME_MAX_CHARS,
	DEFAULT_BRAND_NAME,
	logoUrlFor,
	normalizeBrandName,
	svgLooksSafe
} from './branding-rules';

describe('branding rules', () => {
	test('normalizeBrandName trims, collapses and defaults', () => {
		expect(normalizeBrandName('  Acme   Corp ')).toEqual({ ok: true, name: 'Acme Corp' });
		expect(normalizeBrandName('')).toEqual({ ok: true, name: DEFAULT_BRAND_NAME });
		expect(normalizeBrandName(null)).toEqual({ ok: true, name: DEFAULT_BRAND_NAME });
		expect(normalizeBrandName('x'.repeat(BRAND_NAME_MAX_CHARS + 1))).toEqual({
			ok: false,
			code: 'too_long'
		});
	});

	test('logoUrlFor carries the version', () => {
		expect(logoUrlFor(null)).toBeNull();
		expect(logoUrlFor('ab/c')).toBe('/brand/logo?v=ab%2Fc');
	});

	test('absoluteLogoUrl uses the reference origin', () => {
		const brand = { name: 'Acme', logoUrl: '/brand/logo?v=1' };
		expect(absoluteLogoUrl(brand, 'https://acme.example/tickets/1?x=y')).toBe(
			'https://acme.example/brand/logo?v=1'
		);
		expect(absoluteLogoUrl(brand, '/tickets/1')).toBeNull();
		expect(absoluteLogoUrl({ ...brand, logoUrl: null }, 'https://acme.example')).toBeNull();
	});

	test('svgLooksSafe refuses executable or remote content', () => {
		expect(svgLooksSafe('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')).toBe(true);
		expect(svgLooksSafe('<?xml version="1.0"?>\n<svg viewBox="0 0 1 1"/>')).toBe(true);
		expect(svgLooksSafe('<svg><script>1</script></svg>')).toBe(false);
		expect(svgLooksSafe('<svg onload="x()"/>')).toBe(false);
		expect(svgLooksSafe('<svg><image href="https://evil.example/a.png"/></svg>')).toBe(false);
		expect(svgLooksSafe('<svg><a href="javascript:1"/></svg>')).toBe(false);
		expect(svgLooksSafe('not svg')).toBe(false);
	});
});
