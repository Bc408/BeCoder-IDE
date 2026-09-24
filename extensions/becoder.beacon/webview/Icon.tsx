/* Copyright (c) BeCoder contributors. Licensed under MIT. */
const paths = {
	history: 'M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2',
	back: 'm10 5-7 7 7 7M3 12h18',
	edit: 'm15 4 5 5M4 20l1-6L16 3l5 5L10 19Z',
	trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
	chat: 'M4 4h16v12H9l-5 4Z',
	new: 'M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7M16 3l5 5M10 14l-1 4 4-1L22 8l-5-5Z',
	settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
	up: 'm6 11 6-6 6 6M12 5v14',
	down: 'm6 13 6 6 6-6M12 5v14',
	stop: 'M6 6h12v12H6Z',
	copy: 'M8 8h12v12H8ZM16 8V4H4v12h4',
	check: 'm5 12 4 4L19 6'
};
export function Icon({ name }: { name: keyof typeof paths }) {
	return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
