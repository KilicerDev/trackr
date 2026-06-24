<script lang="ts">
	interface Props {
		name: string;
		size?: number;
		stroke?: number;
		class?: string;
	}
	let { name, size = 16, stroke = 1.6, class: cls = '' }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={cls}
	aria-hidden="true"
>
	{#if name === 'calendar'}
		<rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" />
	{:else if name === 'ticket'}
		<path
			d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"
		/><path d="M13 6v12" />
	{:else if name === 'folder'}
		<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
	{:else if name === 'check'}
		<path d="M5 12.5 10 17l9-10" />
	{:else if name === 'check-square'}
		<rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12 2.5 2.5L16 9.5" />
	{:else if name === 'book'}
		<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zM4 17a2 2 0 0 1 2-2h13" />
	{:else if name === 'file'}
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
	{:else if name === 'download'}
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
	{:else if name === 'org'}
		<path d="M3 21V8l9-5 9 5v13" /><path d="M9 21v-7h6v7M9 11h.01M15 11h.01" />
	{:else if name === 'shield'}
		<path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" />
	{:else if name === 'users'}
		<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path
			d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
		/>
	{:else if name === 'sliders'}
		<path d="M4 21V14M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
	{:else if name === 'list'}
		<path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" /><circle
			cx="4"
			cy="12"
			r="1"
		/><circle cx="4" cy="18" r="1" />
	{:else if name === 'grid'}
		<rect x="3" y="3" width="7" height="7" rx="1.5" /><rect
			x="14"
			y="3"
			width="7"
			height="7"
			rx="1.5"
		/><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect
			x="14"
			y="14"
			width="7"
			height="7"
			rx="1.5"
		/>
	{:else if name === 'board'}
		<rect x="3" y="4" width="6" height="16" rx="2" /><rect
			x="13"
			y="4"
			width="6"
			height="10"
			rx="2"
		/>
	{:else if name === 'timeline'}
		<path d="M3 6h12M3 12h18M3 18h8" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
	{:else if name === 'bell'}
		<path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'chevron'}
		<path d="m6 9 6 6 6-6" />
	{:else if name === 'chevron-r'}
		<path d="m9 6 6 6-6 6" />
	{:else if name === 'sidebar'}
		<rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />
	{:else if name === 'filter'}
		<path d="M4 5h16l-6 8v6l-4-2v-4z" />
	{:else if name === 'bookmark'}
		<path d="M6 4h12v17l-6-4-6 4z" />
	{:else if name === 'logs'}
		<path d="M4 4h16M4 9h10M4 14h16M4 19h10" />
	{:else if name === 'x'}
		<path d="M6 6l12 12M18 6 6 18" />
	{:else if name === 'star'}
		<path d="m12 3 2.9 6 6.6.6-5 4.6 1.5 6.5L12 17.8 5.9 20.7 7.4 14.2 2.5 9.6 9 9z" />
	{:else if name === 'settings'}
		<circle cx="12" cy="12" r="3" /><path
			d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.1 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9 1.7 1.7 0 0 0 4.2 7L4.1 7A2 2 0 1 1 7 4.1l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.9 7l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
		/>
	{:else if name === 'link'}
		<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1 1" /><path
			d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1-1"
		/>
	{:else if name === 'msg'}
		<path d="M21 12a8 8 0 1 1-3.2-6.4L21 4l-1.4 3.2A8 8 0 0 1 21 12z" />
	{:else if name === 'paperclip'}
		<path d="m21 11-8.5 8.5a5 5 0 1 1-7-7L13 4.5a3.5 3.5 0 1 1 5 5L9.5 18" />
	{:else if name === 'send'}
		<path d="m22 2-7 20-4-9-9-4z" /><path d="m22 2-11 11" />
	{:else if name === 'arrow-up'}
		<path d="M12 19V5M5 12l7-7 7 7" />
	{:else if name === 'user'}
		<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
	{:else if name === 'home'}
		<path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" />
	{:else if name === 'refresh'}
		<path d="M3 12a9 9 0 0 1 15.5-6.4L21 8" /><path d="M21 3v5h-5" /><path
			d="M21 12a9 9 0 0 1-15.5 6.4L3 16"
		/><path d="M3 21v-5h5" />
	{:else if name === 'logout'}
		<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path
			d="M21 12H9"
		/>
	{:else if name === 'trash'}
		<path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path
			d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
		/><path d="M10 11v6" /><path d="M14 11v6" />
	{/if}
</svg>
