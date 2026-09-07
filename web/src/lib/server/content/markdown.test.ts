import { describe, expect, test } from 'bun:test';
import { docHtmlToMarkdown, markdownToDocHtml } from './markdown';

describe('markdownToDocHtml', () => {
	test('renders GFM', () => {
		const html = markdownToDocHtml(
			'# Title\n\nSome **bold** and ~~gone~~.\n\n| a | b |\n|---|---|\n| 1 | 2 |'
		);
		expect(html).toContain('<h1>Title</h1>');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<del>gone</del>');
		expect(html).toContain('<table>');
	});

	test('task lists become Tiptap taskList markup', () => {
		const html = markdownToDocHtml('- [x] done\n- [ ] open');
		expect(html).toContain('data-type="taskList"');
		expect(html).toContain('data-type="taskItem" data-checked="true"');
		expect(html).toContain('data-type="taskItem" data-checked="false"');
		expect(html).not.toContain('<input');
		expect(html).toContain('<p>done</p>');
	});

	test('strips scripts, event handlers and javascript: urls', () => {
		const html = markdownToDocHtml(
			'<script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">x</a>\n\n<img src="data:image/png;base64,AAAA">'
		);
		expect(html).not.toContain('<script');
		expect(html).not.toContain('onclick');
		expect(html).not.toContain('javascript:');
		// data:image/ sources are allowed (pasted images).
		expect(html).toContain('data:image/png');
	});

	test('empty / nullish input → empty string', () => {
		expect(markdownToDocHtml('')).toBe('');
		expect(markdownToDocHtml(undefined as unknown as string)).toBe('');
	});
});

describe('docHtmlToMarkdown', () => {
	test('round-trips headings, emphasis and lists', () => {
		const md = docHtmlToMarkdown(markdownToDocHtml('## Hello\n\nA *b* **c**\n\n- one\n- two'));
		expect(md).toContain('## Hello');
		expect(md).toContain('**c**');
		expect(md).toMatch(/[-*] {1,3}one/);
	});

	test('task items come back as - [x] / - [ ]', () => {
		const md = docHtmlToMarkdown(markdownToDocHtml('- [x] done\n- [ ] open'));
		expect(md).toContain('- [x] done');
		expect(md).toContain('- [ ] open');
	});

	test('tables survive the round trip', () => {
		const md = docHtmlToMarkdown(markdownToDocHtml('| a | b |\n|---|---|\n| 1 | 2 |'));
		expect(md).toContain('| a | b |');
		expect(md).toContain('| 1 | 2 |');
	});
});
