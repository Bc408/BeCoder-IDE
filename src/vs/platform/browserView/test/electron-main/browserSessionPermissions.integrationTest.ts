/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { BrowserWindow, session } from 'electron';
import type { AddressInfo } from 'net';
import { gzipSync } from 'zlib';
import { FileAccess } from '../../../../base/common/network.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserViewStorageScope } from '../../common/browserView.js';
import type { BrowserSession } from '../../electron-main/browserSession.js';
import { BrowserSessionPermissions } from '../../electron-main/browserSessionPermissions.js';

// Run in Electron's main process: this fixture creates a real session and window.
suite('BrowserSessionPermissions - passkeys', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('advertises unsupported passkeys before page scripts and preserves compressed login navigation and downloads', async () => {
		const { createServer } = await import('http');
		let loginBody = '';
		let loginCookie = '';
		const server = createServer(async (request, response) => {
			if (request.url === '/download') {
				response.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Disposition': 'attachment; filename="intentional.gz"' });
				response.end(gzipSync('intentional download'));
				return;
			}
			if (request.url === '/login') {
				for await (const chunk of request) {
					loginBody += chunk;
				}
				loginCookie = request.headers.cookie ?? '';
				response.writeHead(302, { Location: '/done' });
				response.end();
				return;
			}
			if (request.url === '/cached' && request.headers['if-none-match'] === '"fixture"') {
				response.writeHead(304, { ETag: '"fixture"' }); response.end(); return;
			}
			response.writeHead(200, {
				'Content-Type': 'text/html',
				'Content-Encoding': 'gzip',
				'Cache-Control': 'no-cache', ETag: '"fixture"',
				...(request.url === '/no-policy' ? {} : {
					[request.url === '/lowercase' ? 'permissions-policy' : 'Permissions-Policy']: ['geolocation=()', 'publickey-credentials-get=*, publickey-credentials-create=*']
				}),
				'Set-Cookie': 'login-fixture=preserved; SameSite=Lax'
			});
			response.end(gzipSync(request.url === '/frame' ? '<script>window.initialPasskeySupport = typeof PublicKeyCredential;</script>' : `<script>
				window.initialPasskeySupport = typeof PublicKeyCredential;
				window.loginProbe = (async () => {
					if (typeof PublicKeyCredential === 'function' && await PublicKeyCredential.isConditionalMediationAvailable()) {
						try { await navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32) }, mediation: 'conditional' }); }
						catch (error) { return error.message; }
					}
					return '';
				})();
			</script><form action="/login" method="post"><input name="username"><input name="password" type="password"><button>Login</button></form><iframe src="/frame"></iframe>`));
		});
		let window: BrowserWindow | undefined;
		try {
			await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
			const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
			const electronSession = session.fromPartition(generateUuid());
			const owner: Pick<BrowserSession, 'id' | 'storageScope'> = { id: generateUuid(), storageScope: BrowserViewStorageScope.Ephemeral };
			const permissions = disposables.add(new BrowserSessionPermissions(owner as BrowserSession));
			permissions.configure(electronSession);
			electronSession.registerPreloadScript({ type: 'frame', filePath: FileAccess.asFileUri('vs/platform/browserView/electron-browser/preload-browserView.js').fsPath });
			const downloads: string[] = [];
			electronSession.on('will-download', (event, item) => { event.preventDefault(); downloads.push(item.getFilename()); });
			window = new BrowserWindow({ show: false, webPreferences: { session: electronSession, sandbox: true, contextIsolation: true, nodeIntegrationInSubFrames: true } });
			for (const route of ['/no-policy', '/lowercase', '/', '/cached', '/cached']) {
				await window.loadURL(url + route);
				assert.deepStrictEqual(await window.webContents.executeJavaScript(`({
					initial: window.initialPasskeySupport,
					frameInitial: document.querySelector('iframe').contentWindow.initialPasskeySupport,
					password: !!document.querySelector('input[type=password]')
				})`), { initial: 'undefined', frameInitial: 'undefined', password: true }, route);
				assert.strictEqual(await window.webContents.executeJavaScript('window.loginProbe'), '', 'automatic sign-in must not produce a page error');
			}
			assert.strictEqual(await window.webContents.executeJavaScript(`document.featurePolicy.allowsFeature('geolocation')`), false);
			assert.strictEqual(await window.webContents.executeJavaScript(`fetch('/asset').then(response => response.headers.get('permissions-policy'))`), 'geolocation=(), publickey-credentials-get=*, publickey-credentials-create=*');
			assert.deepStrictEqual(await window.webContents.executeJavaScript(`(async () => {
				const rejected = async operation => { try { await operation(); return 'unexpected success'; } catch (error) { return error.name; } };
				return {
					get: await rejected(() => navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32) } })),
					create: await rejected(() => navigator.credentials.create({ publicKey: {
						challenge: new Uint8Array(32), rp: { name: 'Fixture' },
						user: { id: new Uint8Array([1]), name: 'fixture', displayName: 'Fixture' },
						pubKeyCredParams: [{ type: 'public-key', alg: -7 }]
					} }))
				};
			})()`), { get: 'NotSupportedError', create: 'NotSupportedError' });
			const loaded = new Promise<void>(resolve => window!.webContents.once('did-finish-load', () => resolve()));
			await window.webContents.executeJavaScript(`document.querySelector('[name=username]').value='fixture'; document.querySelector('[name=password]').value='fixture-password'; document.querySelector('form').requestSubmit();`);
			await loaded;
			assert.strictEqual(loginBody, 'username=fixture&password=fixture-password');
			assert.strictEqual(loginCookie, 'login-fixture=preserved');
			assert.strictEqual(await window.webContents.executeJavaScript('window.loginProbe'), '');
			assert.deepStrictEqual(downloads, [], 'HTML, gzip and redirects must stay navigations');
			const downloaded = new Promise<void>(resolve => electronSession.once('will-download', () => resolve()));
			window.webContents.downloadURL(url + '/download');
			await downloaded;
			assert.deepStrictEqual(downloads, ['intentional.gz'], 'explicit file downloads remain available');
		} finally {
			window?.destroy();
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	});
});
