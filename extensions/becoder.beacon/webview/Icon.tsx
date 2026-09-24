/* Copyright (c) BeCoder contributors. Licensed under MIT. */
const paths = {
	history: 'M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2',
	back: 'm10 5-7 7 7 7M3 12h18',
	edit: 'm15 4 5 5M4 20l1-6L16 3l5 5L10 19Z',
	trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
	chat: 'M4 4h16v12H9l-5 4Z',
	new: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z',
	settings: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
	up: 'm6 11 6-6 6 6M12 5v14',
	down: 'm6 13 6 6 6-6M12 5v14',
	stop: 'M6 6h12v12H6Z',
	copy: 'M8 8h12v12H8ZM16 8V4H4v12h4',
	retry: 'M3 12a9 9 0 1 0 3-6.7M3 4v6h6',
	check: 'm5 12 4 4L19 6'
};
export function Icon({ name }: { name: keyof typeof paths }) {
	return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
