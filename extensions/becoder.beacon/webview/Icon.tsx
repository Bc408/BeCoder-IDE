/* Copyright (c) BeCoder contributors. Licensed under MIT. */
const paths = {
	new: 'M12 5v14M5 12h14',
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
