<script lang="ts">
	import type { Component } from 'svelte';
	import {
		Calendar,
		Ticket,
		Folder,
		Check,
		SquareCheckBig,
		Book,
		File,
		Download,
		Upload,
		Building2,
		Shield,
		Users,
		SlidersVertical,
		List,
		Menu,
		LayoutGrid,
		Kanban,
		ChartGantt,
		Search,
		Bell,
		Plus,
		ChevronDown,
		Ellipsis,
		ChevronRight,
		PanelLeft,
		Funnel,
		Bookmark,
		Logs,
		X,
		Star,
		Settings,
		Link,
		MessageCircle,
		Paperclip,
		Send,
		ArrowUp,
		User,
		House,
		RefreshCw,
		LogOut,
		Trash2,
		Pencil,
		Square,
		Bug,
		Triangle,
		TriangleAlert,
		Sparkles
	} from '@lucide/svelte';

	interface Props {
		name: string;
		size?: number;
		stroke?: number;
		class?: string;
	}
	let { name, size = 17, stroke = 1.6, class: cls = '' }: Props = $props();

	// Local name -> lucide component. Keeps the `<Icon name="..." />` API stable
	// so call sites don't need to know about lucide's export names.
	const icons: Record<string, Component> = {
		calendar: Calendar,
		ticket: Ticket,
		folder: Folder,
		more: Ellipsis,
		check: Check,
		'check-square': SquareCheckBig,
		book: Book,
		file: File,
		download: Download,
		upload: Upload,
		org: Building2,
		shield: Shield,
		users: Users,
		sliders: SlidersVertical,
		list: List,
		menu: Menu,
		grid: LayoutGrid,
		board: Kanban,
		timeline: ChartGantt,
		search: Search,
		bell: Bell,
		plus: Plus,
		chevron: ChevronDown,
		'chevron-r': ChevronRight,
		sidebar: PanelLeft,
		filter: Funnel,
		bookmark: Bookmark,
		logs: Logs,
		x: X,
		star: Star,
		settings: Settings,
		link: Link,
		msg: MessageCircle,
		paperclip: Paperclip,
		send: Send,
		'arrow-up': ArrowUp,
		user: User,
		home: House,
		refresh: RefreshCw,
		logout: LogOut,
		trash: Trash2,
		pencil: Pencil,
		square: Square,
		bug: Bug,
		triangle: Triangle,
		'alert-triangle': TriangleAlert,
		sparkle: Sparkles,
		gear: Settings
	};

	const Cmp = $derived(icons[name]);
</script>

{#if Cmp}
	<Cmp {size} strokeWidth={stroke} class={cls} aria-hidden="true" />
{/if}
