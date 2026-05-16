import { loadWikiTree } from '$lib/server/wiki';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const tree = await loadWikiTree();
	return { tree };
};
