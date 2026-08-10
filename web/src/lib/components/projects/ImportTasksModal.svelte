<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { showToast } from '$lib/stores/toast.svelte';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		onclose: () => void;
		projectId: string;
	}

	let { open, onclose, projectId }: Props = $props();

	let fileInput = $state<HTMLInputElement>();
	let fileName = $state('');
	let tasks = $state<unknown[]>([]);
	let parseError = $state('');
	let dragging = $state(false);
	let importing = $state(false);
	let failures = $state<{ index: number; message: string }[]>([]);

	// Reset each time the modal opens.
	$effect(() => {
		if (open) {
			fileName = '';
			tasks = [];
			parseError = '';
			dragging = false;
			importing = false;
			failures = [];
		}
	});

	// Strip `//` and `/* */` comments so the downloadable .jsonc example (and
	// users' own commented files) round-trip through JSON.parse. String
	// contents are preserved.
	function stripJsonComments(src: string): string {
		let out = '';
		let inString = false;
		for (let i = 0; i < src.length; i++) {
			const c = src[i];
			if (inString) {
				out += c;
				if (c === '\\') {
					out += src[++i] ?? '';
					continue;
				}
				if (c === '"') inString = false;
				continue;
			}
			if (c === '"') {
				inString = true;
				out += c;
				continue;
			}
			if (c === '/' && src[i + 1] === '/') {
				while (i < src.length && src[i] !== '\n') i++;
				out += '\n';
				continue;
			}
			if (c === '/' && src[i + 1] === '*') {
				i += 2;
				while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
				i++;
				continue;
			}
			out += c;
		}
		return out;
	}

	async function readFile(file: File) {
		parseError = '';
		tasks = [];
		failures = [];
		fileName = file.name;
		let parsed: unknown;
		try {
			parsed = JSON.parse(stripJsonComments(await file.text()));
		} catch {
			parseError = m.import_tasks_file_invalid();
			return;
		}
		const list = (parsed as { tasks?: unknown } | null)?.tasks;
		if (!Array.isArray(list) || list.length === 0) {
			parseError = m.import_tasks_wrong_shape();
			return;
		}
		tasks = list;
	}

	function onPick(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (file) void readFile(file);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) void readFile(file);
	}

	async function doImport() {
		if (tasks.length === 0 || importing) return;
		importing = true;
		failures = [];
		try {
			const res = await fetch(`/projects/${projectId}/tasks/import`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ tasks })
			});
			const data = (await res.json()) as {
				message?: string;
				created?: { index: number }[];
				failed?: { index: number; message: string }[];
			};
			if (!res.ok) {
				showToast('err', data.message ?? m.import_err_failed());
				return;
			}
			const ok = data.created?.length ?? 0;
			failures = data.failed ?? [];
			if (ok > 0) await invalidateAll();
			if (failures.length === 0) {
				showToast('ok', m.import_tasks_success({ n: ok }));
				onclose();
			} else {
				showToast(ok > 0 ? 'ok' : 'err', m.import_tasks_partial({ ok, failed: failures.length }));
			}
		} catch {
			showToast('err', m.import_err_failed());
		} finally {
			importing = false;
		}
	}

	// A commented .jsonc starter file. The header documents every accepted
	// field and its allowed values; comments are stripped on upload, so the
	// file imports as-is. Keep the enums in sync with the ALLOWED_TASK_* sets
	// in $lib/server/tasks.ts.
	const EXAMPLE = `{
	// Trackr task import — upload this file on the project you want the tasks in.
	// The project is taken from where you upload, so no project id is needed here.
	// Only "title" is required per task. Comments are allowed. Max 500 tasks.
	//
	// Allowed values:
	//   type:      "task" | "bug" | "improvement" | "feature" | "chore"                  (default "task")
	//   status:    "backlog" | "todo" | "in_progress" | "paused" | "in_review" | "done"  (default "todo")
	//   priority:  "none" | "low" | "medium" | "high" | "urgent"                         (default "medium")
	//
	// Other fields:
	//   description:     string
	//   dueDate:         ISO date, e.g. "2026-09-01"
	//   estimateMinutes: positive number
	//   tags:            array of strings (lowercased, max 24 chars each)
	//   checklist:       array of { "text": string, "done": boolean }
	//   assignees:       array of user emails or user ids. Omit or leave empty
	//                    to assign the task to yourself. If given, exactly those
	//                    users are assigned — and if none of them match an
	//                    assignable user, that task is rejected with an error.
	"tasks": [
		{
			"title": "Set up staging environment",
			"description": "Optional longer text.",
			"type": "task",
			"status": "todo",
			"priority": "medium",
			"dueDate": "2026-09-01",
			"estimateMinutes": 90,
			"tags": ["infra"],
			"checklist": [{ "text": "Provision server", "done": false }],
			"assignees": ["user@example.com"]
		},
		{ "title": "Only a title is required" }
	]
}
`;

	function downloadExample() {
		const blob = new Blob([EXAMPLE], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'tasks-import-example.jsonc';
		a.click();
		URL.revokeObjectURL(a.href);
	}

	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={onKey} />

<Modal {open} {onclose} maxWidth={520}>
	<div class="flex items-center border-b border-border px-5 pt-4 pb-3">
		<div>
			<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">
				{m.import_tasks_eyebrow()}
			</div>
			<div class="text-[15px] font-semibold">{m.import_tasks_title()}</div>
		</div>
		<button
			type="button"
			onclick={onclose}
			aria-label={m.common_close()}
			class="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
		>
			<Icon name="x" size={15} />
		</button>
	</div>

	<div class="px-5 pt-5 pb-3">
		<input
			bind:this={fileInput}
			type="file"
			accept=".json,.jsonc,application/json"
			class="hidden"
			onchange={onPick}
		/>
		<button
			type="button"
			onclick={() => fileInput?.click()}
			ondragover={(e) => {
				e.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={onDrop}
			class="grid w-full place-items-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-center transition-colors {dragging
				? 'border-accent bg-accent-soft'
				: 'border-border hover:border-border-strong'}"
		>
			<Icon name="download" size={20} class="text-text-3" />
			<span class="text-[14px] text-text-2">{m.import_tasks_drop_hint()}</span>
		</button>

		{#if parseError}
			<p class="mt-3 text-[13px] text-accent">{parseError}</p>
		{:else if tasks.length > 0}
			<p class="mt-3 text-[13px] text-text-2">
				{m.import_tasks_found({ n: tasks.length, file: fileName })}
			</p>
		{/if}

		{#if failures.length > 0}
			<div class="mt-3 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface p-2.5">
				{#each failures as f (f.index)}
					<div class="py-0.5 text-[13px] text-text-2">
						<span class="font-mono text-text-3">{m.import_tasks_row({ n: f.index + 1 })}</span>
						· {f.message}
					</div>
				{/each}
			</div>
		{/if}

		<button
			type="button"
			onclick={downloadExample}
			class="mt-3 text-[13px] text-text-3 underline-offset-2 hover:text-text hover:underline"
		>
			{m.import_tasks_example()}
		</button>
	</div>

	<div class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3">
		<div class="ml-auto flex items-center gap-2">
			<Button variant="default" onclick={onclose}>{m.common_cancel()}</Button>
			<button
				type="button"
				onclick={doImport}
				disabled={importing || tasks.length === 0}
				class="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-[12px] py-[8px] text-[14px] font-medium text-white shadow-btn transition-[background,border-color,transform] duration-150 hover:bg-accent-strong active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
			>
				{importing ? m.import_tasks_importing() : m.import_tasks_button({ n: tasks.length })}
			</button>
		</div>
	</div>
</Modal>
