import { error } from '@sveltejs/kit';
import { TRACKR_PROJECTS } from '$lib/data';
import type { ProjectId } from '$lib/types';

export const load = ({ params }: { params: { id: string } }) => {
	const id = params.id as ProjectId;
	if (!TRACKR_PROJECTS[id]) throw error(404, 'Project not found');
	return { id };
};
