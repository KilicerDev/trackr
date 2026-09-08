import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { getSchema } from '@tiptap/core';
import { collabSchemaExtensions } from '$lib/editor/extensions';
import { flattenTaskItems, fragmentToText } from './clipboard-tasks';

// What Tiptap's TaskItem/TaskList serialize on copy.
const COPIED =
	'<ul data-type="taskList">' +
	'<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>done <strong>bold</strong></p></div></li>' +
	'<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>open</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>nested</p></div></li></ul></div></li>' +
	'</ul>';

describe('flattenTaskItems', () => {
	test('turns each task item into <li><input> inline text', () => {
		const dom = new JSDOM(`<body>${COPIED}</body>`);
		const body = dom.window.document.body;
		expect(flattenTaskItems(body)).toBe(true);
		const items = [...body.querySelectorAll('li[data-type="taskItem"]')];
		expect(items).toHaveLength(3);
		// No wrapper label/div/p left inside the item's own row.
		for (const li of items) {
			expect(li.querySelector(':scope > label')).toBeNull();
			expect(li.querySelector(':scope > div')).toBeNull();
			expect(li.querySelector(':scope > p')).toBeNull();
			expect(li.firstElementChild?.tagName).toBe('INPUT');
		}
		expect(items[0].innerHTML).toBe(
			'<input type="checkbox" checked=""> done <strong>bold</strong>'
		);
		expect(items[0].querySelector('input')?.hasAttribute('checked')).toBe(true);
		expect(items[1].querySelector('input')?.hasAttribute('checked')).toBe(false);
		// The nested list survives as a child of its item.
		expect(items[1].querySelector(':scope > ul[data-type="taskList"] > li')).not.toBeNull();
	});

	test('leaves markup without task items untouched', () => {
		const dom = new JSDOM('<body><ul><li><p>plain</p></li></ul></body>');
		expect(flattenTaskItems(dom.window.document.body)).toBe(false);
		expect(dom.window.document.body.innerHTML).toBe('<ul><li><p>plain</p></li></ul>');
	});
});

describe('fragmentToText', () => {
	const schema = getSchema(collabSchemaExtensions);
	const doc = schema.nodeFromJSON({
		type: 'doc',
		content: [
			{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Todo' }] },
			{
				type: 'taskList',
				content: [
					{
						type: 'taskItem',
						attrs: { checked: true },
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }]
					},
					{
						type: 'taskItem',
						attrs: { checked: false },
						content: [
							{ type: 'paragraph', content: [{ type: 'text', text: 'open' }] },
							{
								type: 'bulletList',
								content: [
									{
										type: 'listItem',
										content: [{ type: 'paragraph', content: [{ type: 'text', text: 'sub' }] }]
									}
								]
							}
						]
					}
				]
			},
			{
				type: 'orderedList',
				content: [
					{
						type: 'listItem',
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }]
					},
					{
						type: 'listItem',
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }]
					}
				]
			}
		]
	});

	test('restores markdown markers for tasks and lists', () => {
		expect(fragmentToText(doc.content)).toBe(
			['Todo', '- [x] done', '- [ ] open', '  - sub', '1. one', '2. two'].join('\n')
		);
	});
});
