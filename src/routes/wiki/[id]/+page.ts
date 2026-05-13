import { error } from '@sveltejs/kit';
import { WIKI_PAGES } from '$lib/data';

export const load = ({ params }: { params: { id: string } }) => {
	const pg = WIKI_PAGES.find((p) => p.id === params.id);
	if (!pg) throw error(404, 'Page not found');
	return { page: pg };
};
