/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import { createHash } from 'crypto';

/** Windows kernel occupancy: a conversation lease is distinct from a short write lease. */
export async function acquireBeaconLease(identity: string, resource: string): Promise<() => Promise<void>> {
	if (process.platform !== 'win32') { throw new Error('beacon-windows-required'); }
	const key = createHash('sha256').update(identity.toLowerCase()).update('\0').update(resource).digest('hex');
	const server = net.createServer(socket => socket.destroy());
	try {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(`\\\\.\\pipe\\becoder-beacon-${key}`, resolve);
		});
	} catch (error) {
		server.close(() => { });
		if (['EADDRINUSE', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) { throw new Error(resource.startsWith('conversation:') ? 'conversation-open' : 'beacon-write-busy'); }
		throw error;
	}
	let released = false;
	return async () => {
		if (released) { return; }
		released = true;
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	};
}
