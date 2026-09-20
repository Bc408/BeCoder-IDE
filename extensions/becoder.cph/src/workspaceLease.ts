/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import { createHash } from 'crypto';

/** Windows kernel-owned occupancy only: no protocol, TCP port or filesystem lock. */
export async function acquireWorkspaceLease(canonicalRoot: string): Promise<() => Promise<void>> {
	if (process.platform !== 'win32') { throw new Error('BeCoder workspace leases require Windows.'); }
	const identity = createHash('sha256').update(canonicalRoot.toLowerCase()).digest('hex');
	const server = net.createServer(socket => socket.destroy());
	try {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(`\\\\.\\pipe\\becoder-cph-workspace-${identity}`, resolve);
		});
	} catch (error) {
		server.close();
		if (['EADDRINUSE', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) {
			throw Object.assign(new Error('Another import or sample save is active in this workspace.'), { code: 'busy' });
		}
		throw error;
	}
	let released = false;
	return async () => {
		if (released) { return; }
		released = true;
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	};
}
