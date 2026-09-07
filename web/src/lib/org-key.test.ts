import { describe, expect, test } from 'bun:test';
import { deriveOrgKey, isValidOrgKey, normalizeOrgKey, ORG_KEY_MAX } from './org-key';

describe('normalizeOrgKey', () => {
	test('upper-cases and strips everything but A-Z/0-9', () => {
		expect(normalizeOrgKey('si-web')).toBe('SIWEB');
		expect(normalizeOrgKey(' s g p ')).toBe('SGP');
		expect(normalizeOrgKey('müller')).toBe('MULLER');
	});

	test('caps the length', () => {
		expect(normalizeOrgKey('abcdefghij')).toHaveLength(ORG_KEY_MAX);
	});

	test('empty input stays empty', () => {
		expect(normalizeOrgKey('')).toBe('');
		expect(normalizeOrgKey('---')).toBe('');
	});
});

describe('isValidOrgKey', () => {
	test('accepts 2-6 chars starting with a letter', () => {
		expect(isValidOrgKey('SG')).toBe(true);
		expect(isValidOrgKey('TRACKR')).toBe(true);
		expect(isValidOrgKey('A1')).toBe(true);
	});

	test('rejects too short, too long, lowercase, or digit-first', () => {
		expect(isValidOrgKey('S')).toBe(false);
		expect(isValidOrgKey('TOOLONGX')).toBe(false);
		expect(isValidOrgKey('siweb')).toBe(false);
		expect(isValidOrgKey('1AB')).toBe(false);
		expect(isValidOrgKey('')).toBe(false);
	});
});

describe('deriveOrgKey', () => {
	test('single word → prefix', () => {
		expect(deriveOrgKey('Siweb')).toBe('SIWEB');
		expect(deriveOrgKey('Schneider')).toBe('SCHNE');
	});

	test('multi-word → initials', () => {
		expect(deriveOrgKey('Schneider Group')).toBe('SG');
		expect(deriveOrgKey('Web Im Agency GmbH Berlin Nord')).toBe('WIAGB');
	});

	test('drops leading digits and non-alphanumerics', () => {
		// Initials are taken first ("3C"), then leading digits are dropped.
		expect(deriveOrgKey('3M Co')).toBe('C');
		expect(deriveOrgKey('42 Labs')).toBe('L');
		expect(deriveOrgKey('Ärzte & Co.')).toBe('AC');
	});

	test('nothing usable → empty string', () => {
		expect(deriveOrgKey('')).toBe('');
		expect(deriveOrgKey('!!!')).toBe('');
	});

	test('derived keys validate', () => {
		for (const name of ['Siweb', 'Schneider Group', 'Maja Studio', 'KiloHertz']) {
			expect(isValidOrgKey(deriveOrgKey(name)), name).toBe(true);
		}
	});
});
