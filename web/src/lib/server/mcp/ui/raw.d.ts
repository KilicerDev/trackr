// `?raw` imports of the built widget HTML (see index.ts).
declare module '*.html?raw' {
	const html: string;
	export default html;
}
