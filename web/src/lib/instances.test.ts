import { describe, expect, test } from 'bun:test';
import {
	INSTANCE_NAME_MAX_CHARS,
	instanceHost,
	normalizeInstanceUrl,
	parseHandoffHash,
	parseInstanceProbe,
	sameInstance,
	sanitizeLogoUrl,
	switchUrl
} from './instances';

describe('instance rules', () => {
	test('normalizeInstanceUrl canonicalises typed hosts', () => {
		expect(normalizeInstanceUrl(' dk.trackr.dev ')).toBe('https://dk.trackr.dev');
		expect(normalizeInstanceUrl('https://dk.trackr.dev/')).toBe('https://dk.trackr.dev');
		expect(normalizeInstanceUrl('http://192.168.1.10:5173')).toBe('http://192.168.1.10:5173');
		expect(normalizeInstanceUrl('https://HOST.example/base/')).toBe('https://host.example/base');
		expect(normalizeInstanceUrl('')).toBeNull();
		expect(normalizeInstanceUrl(null)).toBeNull();
		expect(normalizeInstanceUrl('ftp://x.example')).toBeNull();
		expect(normalizeInstanceUrl('javascript:alert(1)')).toBeNull();
		expect(normalizeInstanceUrl('https://user:pw@x.example')).toBeNull();
		expect(normalizeInstanceUrl('https://x.example/?next=1')).toBeNull();
		expect(normalizeInstanceUrl('https://x.example/#frag')).toBeNull();
		expect(normalizeInstanceUrl('not a url')).toBeNull();
	});

	test('instanceHost shows host, port and base path', () => {
		expect(instanceHost('https://dk.trackr.dev')).toBe('dk.trackr.dev');
		expect(instanceHost('http://192.168.1.10:5173/base')).toBe('192.168.1.10:5173/base');
	});

	test('sameInstance ignores cosmetic differences', () => {
		expect(sameInstance('dk.trackr.dev', 'https://dk.trackr.dev/')).toBe(true);
		expect(sameInstance('https://a.example', 'https://b.example')).toBe(false);
		expect(sameInstance('', 'https://b.example')).toBe(false);
	});

	test('sanitizeLogoUrl only keeps same-origin http(s) URLs', () => {
		const at = 'https://dk.trackr.dev';
		expect(sanitizeLogoUrl('https://dk.trackr.dev/brand/logo?v=abc', at)).toBe(
			'https://dk.trackr.dev/brand/logo?v=abc'
		);
		expect(sanitizeLogoUrl('https://evil.example/logo.png', at)).toBeNull();
		expect(sanitizeLogoUrl('javascript:alert(1)', at)).toBeNull();
		expect(sanitizeLogoUrl('/brand/logo', at)).toBeNull();
		expect(sanitizeLogoUrl(null, at)).toBeNull();
	});

	test('parseInstanceProbe requires the trackr handshake and takes branding from it', () => {
		const at = 'https://dk.trackr.dev';
		expect(parseInstanceProbe({ name: 'other' }, at)).toBeNull();
		expect(parseInstanceProbe(null, at)).toBeNull();
		expect(parseInstanceProbe({ name: 'trackr', version: '1', api: 1 }, at)).toEqual({
			name: 'dk.trackr.dev',
			logoUrl: null
		});
		expect(
			parseInstanceProbe(
				{
					name: 'trackr',
					branding: { name: '  DK  Agency ', logoUrl: 'https://dk.trackr.dev/brand/logo?v=1' }
				},
				at
			)
		).toEqual({ name: 'DK Agency', logoUrl: 'https://dk.trackr.dev/brand/logo?v=1' });
		const long = parseInstanceProbe({ name: 'trackr', branding: { name: 'x'.repeat(100) } }, at);
		expect(long?.name.length).toBe(INSTANCE_NAME_MAX_CHARS);
	});

	test('handoff round-trips through the fragment', () => {
		const link = switchUrl('https://dk.trackr.dev', 'https://siweb.trackr.dev');
		expect(link).toBe('https://dk.trackr.dev/#from=https%3A%2F%2Fsiweb.trackr.dev');
		expect(parseHandoffHash(new URL(link).hash)).toBe('https://siweb.trackr.dev');
		expect(parseHandoffHash('')).toBeNull();
		expect(parseHandoffHash('#from=javascript:alert(1)')).toBeNull();
		expect(parseHandoffHash('#other=1')).toBeNull();
	});
});
