/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with Electron after bundling browserViewMainService.ts to tmp/oj-connect-audit/shortcut-main.cjs.
// Uses only an intercepted private fixture session; never contacts an OJ or a user account.
// eslint-disable-next-line local/code-no-new-javascript-files -- Standalone Electron fixture runs directly without TypeScript compilation.
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const assert = require('assert/strict');
const fs = require('fs');
const repoRoot = path.resolve(__dirname, '..');
const testRoot = path.join(repoRoot, 'tmp', 'oj-connect-audit');
app.setPath('userData', path.join(testRoot, 'shortcut-probe-data'));
app.whenReady().then(async () => {
	let window;
	try {
		global._VSCODE_PRODUCT_JSON = require(path.join(repoRoot, 'product.json'));
		global._VSCODE_PACKAGE_JSON = require(path.join(repoRoot, 'package.json'));
		const { BrowserViewMainService } = require(path.join(testRoot, 'shortcut-main.cjs'));
		const { AtCoderBridgeController } = require(path.join(testRoot, 'shortcut-bridge.cjs'));
		const { SubmissionController } = require(path.join(repoRoot, 'extensions/becoder.oj-connect/out/workflowController.js'));
		const { AtCoderAdapter } = require(path.join(repoRoot, 'extensions/becoder.oj-connect/out/adapters/atcoder/adapter.js'));
		const { defaultDirectories } = require(path.join(repoRoot, 'extensions/becoder.oj-connect/out/settings.js'));
		let posts = 0, ambiguous = false, captcha = false, externalRecord = false, japanese = false, rawVerdict = 'AC', sourceVisible = true;
		const source = '#include <iostream>\nint main() { std::cout << "\u5feb\u6377\u952e \u05d4X123"; }\n' + '// literal $& $$ $` $\' const detailHTML = null;\n';
		const escape = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
		const row = id => `<tr><td><a href="/contests/abc086/tasks/abc086_a">A</a></td><td><a href="/users/test-user">user</a></td><td><a href="/contests/abc086/submissions/me?f.Language=6017">C++23</a></td><td><a href="/contests/abc086/submissions/${id}">Detail</a></td></tr>`;
		const fixture = fs.readFileSync(path.join(repoRoot, 'src/vs/platform/browserView/test/common/atcoderForm.fixture.html'),'utf8').replace('value="abc086_a"','name="task" value="abc086_a"');
		const partition = 'shortcut-fixture';
		session.fromPartition(partition).protocol.handle('https', request => {
			const url = new URL(request.url);
			let html;
			if (url.pathname.endsWith('/tasks/abc086_a')) {
				// eslint-disable-next-line local/code-no-unexternalized-strings -- Executed fixture script, not product UI.
				html = fixture + (captcha ? '<input form="unused" name="cf-turnstile-response" value="">' : '') + `<script>document.querySelector('form').id='codeform';${captcha ? "document.querySelector('[name=cf-turnstile-response]').setAttribute('form','codeform');" : ''}document.querySelector('#input-open-file').addEventListener('change',e=>{const r=new FileReader();r.onload=()=>document.querySelector('#plain-textarea').value=r.result;r.readAsText(e.target.files[0]);});document.querySelector('button').id='submit';</script>`;
			} else if (url.pathname.endsWith('/submit') && request.method === 'POST') {
				posts++;
				html = '<script>location.replace("/contests/abc086/submissions/me")</script>';
			} else if (url.pathname.endsWith('/submissions/me')) {
				html = '<table><tr><th>Submission Time</th><th>Code Size</th></tr>' + (posts || externalRecord ? row('11') : '') + (posts && ambiguous ? row('12') : '') + row('10') + '</table>';
			} else if (/\/submissions\/\d+$/.test(url.pathname)) {
				html = `<pre id="submission-code">${sourceVisible ? escape(source) : ''}</pre><table><tr><th>Task</th><td><a href="/contests/abc086/tasks/abc086_a">A</a></td></tr><tr><th>User</th><td><a href="/users/test-user">user</a></td></tr><tr><th>Score</th><td>100</td></tr><tr><th>Status</th><td id="judge-status">${rawVerdict}</td></tr></table>`;
				if (rawVerdict === 'CE') { html += '<h4>' + (japanese ? '\u30b3\u30f3\u30d1\u30a4\u30eb\u30a8\u30e9\u30fc' : 'Compile Error') + '</h4><pre>./Main.cpp:4: error: &lt;cin&gt; was not declared\n  ^~~\n</pre>'; }
				const caseHeaders=japanese ? '<th>\u30c6\u30b9\u30c8\u30b1\u30fc\u30b9</th><th>\u7d50\u679c</th><th>\u5b9f\u884c\u6642\u9593</th><th>\u30e1\u30e2\u30ea</th>' : '<th>Case Name</th><th>Status</th><th>Exec Time</th><th>Memory</th>';
				html += '<table><thead><tr><th>Test Set</th><th>Status</th></tr></thead><tbody><tr><td>All</td><td>AC</td></tr></tbody></table><table><thead><tr>' + caseHeaders + '</tr></thead><tbody><tr><td>sample_01</td><td>AC</td><td>1 ms</td><td>2048 KB</td></tr></tbody></table>';
			} else { return new Response('unsupported', { status:404 }); }
			return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
		});
		window = new BrowserWindow({show:false,webPreferences:{partition,sandbox:true,contextIsolation:true}});
		const task = 'https://atcoder.jp/contests/abc086/tasks/abc086_a';
		const load = async url => {await window.loadURL(url);if(window.webContents.isLoading()){await new Promise(resolve=>window.webContents.once('did-stop-loading',resolve));}};
		const view = { owner:{mainWindowId:1}, getWebContentsView:()=>({webContents:window.webContents}), session:{storageScope:'ephemeral'}, loadURL:load,
			onDidClose:listener=>{window.on('closed',listener);return{dispose:()=>window.removeListener('closed',listener)};},
			onDidNavigate:listener=>{const fn=(_event,url)=>listener({url});window.webContents.on('did-navigate',fn);return{dispose:()=>window.webContents.removeListener('did-navigate',fn)};} };
		const interactionRequests=[];
		const service = {_onDidRequireOjInteraction:{fire:value=>interactionRequests.push(value)},_getBrowserView:()=>view,atCoderRequests:new Map(),atCoderAttempts:new Map(),ojReads:new Map()};
		for(const name of ['prepareAtCoderTask','readAtCoderSubmission','readAtCoderRecord','sendAndConfirmAtCoderTask','cancelAtCoderTask']) {service[name]=BrowserViewMainService.prototype[name];}

		const execute=window.webContents.executeJavaScriptInIsolatedWorld.bind(window.webContents);
		const consoleListeners=window.webContents.listenerCount('console-message');
		const payload={source,fileName:'abc086_a.cpp',languageId:'6017',replaceDraft:false};
		const approve='document.querySelector(\'[name=cf-turnstile-response]\').value=\'fixture-approved\'';
		const send=()=>service.sendAndConfirmAtCoderTask('fixture',1,task,payload);
		const failed=[], passed=[];
		const check=async(name,operation)=>{
			try { await operation(); assert.equal(window.webContents.listenerCount('console-message'),consoleListeners); assert.equal(service.atCoderRequests.size,0); passed.push(name); }
			catch(error) { failed.push(new Error(name+': '+error.stack)); }
			finally { await service.cancelAtCoderTask('fixture',1); window.webContents.executeJavaScriptInIsolatedWorld=execute; view.loadURL=load; }
		};
		const reset=async(needsCaptcha=false)=>{posts=0;ambiguous=false;externalRecord=false;japanese=false;rawVerdict='AC';sourceVisible=true;captcha=needsCaptcha;await load(task);};
		await check('preparation distinguishes signed-out pages from missing native controls',async()=>{
			await reset();
			await window.webContents.executeJavaScript('document.querySelector("#input-open-file").remove(); document.body.insertAdjacentHTML("beforeend", \'<a href="/login?continue=fixture">Sign In</a>\')');
			await assert.rejects(service.prepareAtCoderTask('fixture',1,task), /atcoder-login-required/);
			await window.webContents.executeJavaScript('document.querySelector(\'a[href^="/login"]\').remove()');
			await assert.rejects(service.prepareAtCoderTask('fixture',1,task), /atcoder-form-missing/);
			assert.equal(posts,0);
		});
		const arm=()=>{
			let ready;
			const waiting=new Promise(resolve=>ready=resolve);
			window.webContents.executeJavaScriptInIsolatedWorld=(world,scripts,...rest)=>{
				const result=execute(world,scripts,...rest);
				if(scripts[0].code.includes('form.requestSubmit(button)')){result.then(ready,()=>{});}
				return result;
			};
			return waiting;
		};
		await check('verified receipt does not wait for navigation or final result',async()=>{
			await reset();
			let detailReads=0, navigations=0;
			service.readAtCoderSubmission=async()=>{detailReads++;throw new Error('unexpected final-result read');};
			view.loadURL=async()=>{navigations++;throw new Error('unexpected receipt navigation');};
			const receipt=await send();
			assert.equal(receipt.kind,'record');assert.equal(receipt.record.id,'11');assert.equal(posts,1);
			assert.equal(detailReads,0);assert.equal(navigations,0);
			service.readAtCoderSubmission=BrowserViewMainService.prototype.readAtCoderSubmission;
		});
		await check('CAPTCHA cancellation has no sent attempt or later resend',async()=>{
			await reset(true);const ready=arm();const pending=send();
			assert.equal(await ready,false);
			await service.cancelAtCoderTask('fixture',1);
			assert.equal((await pending).kind,'not-sent');assert.equal(posts,0);
			await window.webContents.executeJavaScript(approve);
			await new Promise(resolve=>setTimeout(resolve,400));
			assert.equal(posts,0);
			assert.equal(await execute(1005,[{code:'globalThis.__becoderAtCoderSubmission === undefined'}]),true);
		});
		await check('own-list navigation without Submit cannot adopt another matching record',async()=>{
			await reset(true);const ready=arm();const pending=send();
			assert.equal(await ready,false);externalRecord=true;
			await load('https://atcoder.jp/contests/abc086/submissions/me');
			assert.equal((await pending).kind,'not-sent');assert.equal(posts,0);
		});
		await check('verification completing later automatically submits exactly once',async()=>{
			await reset(true);const interactions=interactionRequests.length;const ready=arm();const pending=send();
			assert.equal(await ready,false);assert.equal(posts,0);
			await window.webContents.executeJavaScript(approve);
			assert.deepEqual(interactionRequests.slice(interactions),[{id:'fixture',windowId:1}]);
			const receipt=await pending;
			assert.equal(receipt.kind,'record');assert.equal(receipt.record.id,'11');assert.equal(posts,1);
		});
		await check('manual Submit survives immediate native navigation with one send',async()=>{
			await reset(true);const ready=arm();const pending=send();
			assert.equal(await ready,false);
			await window.webContents.executeJavaScript(approve + '; document.querySelector(\'form\').requestSubmit(document.querySelector(\'#submit\'))');
			const receipt=await pending;
			assert.equal(receipt.kind,'record');assert.equal(receipt.record.id,'11');assert.equal(posts,1);
		});
		await check('prevented manual Submit retains an uncertain attempt without automatic resend',async()=>{
			await reset(true);const ready=arm();const pending=send();
			assert.equal(await ready,false);
			await window.webContents.executeJavaScript('document.querySelector(\'form\').addEventListener(\'submit\',e=>e.preventDefault(),{once:true}); ' + approve + '; document.querySelector(\'form\').requestSubmit(document.querySelector(\'#submit\'))');
			await new Promise(resolve=>setTimeout(resolve,600));
			assert.equal(posts,0);await service.cancelAtCoderTask('fixture',1);
			assert.equal((await pending).kind,'unconfirmed');assert.equal(posts,0);
		});
		await check('ambiguous send remains recoverable without resending',async()=>{
			await reset();ambiguous=true;
			const receipt=await send();assert.equal(receipt.kind,'unconfirmed');assert.equal(posts,1);
			ambiguous=false;let navigations=0;
			view.loadURL=async()=>{navigations++;throw new Error('unexpected reconciliation navigation');};
			const reconciled=await BrowserViewMainService.prototype.reconcileAtCoderAttempt.call(service,receipt.attemptId,1);
			assert.equal(reconciled.kind,'record');assert.equal(reconciled.record.id,'11');assert.equal(posts,1);assert.equal(navigations,0);
		});
		await check('editing a waiting webpage draft stops before sending',async()=>{
			await reset(true);const ready=arm();const pending=send();
			assert.equal(await ready,false);
			await window.webContents.executeJavaScript('document.querySelector(\'#plain-textarea\').value=\'changed\'; ' + approve);
			assert.equal((await pending).kind,'not-sent');assert.equal(posts,0);
		});
		await check('an interrupted dispatch retains uncertainty without resending',async()=>{
			await reset(true);
			window.webContents.executeJavaScriptInIsolatedWorld=async(world,scripts,...rest)=>{
				const value=await execute(world,scripts,...rest);
				if(scripts[0].code.includes('form.requestSubmit(button)')){throw new Error('fixture reply lost');}
				return value;
			};
			assert.equal((await send()).kind,'unconfirmed');assert.equal(posts,0);
		});
		// Compose the actual compiled extension controller, opaque bridge and native transaction.
		await check('extension controller confirms a receipt and reads the result separately',async()=>{
			await reset();let revealed, handle=0;
			service.readAtCoderSubmission=BrowserViewMainService.prototype.readAtCoderSubmission;
			const bridge=new AtCoderBridgeController({
				newHandle:()=>String(++handle),isPageCurrent:page=>window.webContents.getURL()===page.url&&!window.webContents.isLoading(),
				openTask:async url=>{await load(url);return{viewId:'fixture',url};},
				inspectTask:page=>service.prepareAtCoderTask(page.viewId,1,page.url),
				sendAndConfirm:(page,value)=>service.sendAndConfirmAtCoderTask(page.viewId,1,page.url,value),
				// The real feature opens the independent result view only when reading a confirmed record.
				readRecord:async record=>{await load(record.url);return service.readAtCoderRecord('fixture',1,record);},
				cancel:page=>service.cancelAtCoderTask(page.viewId,1)
			});
			const adapter=new AtCoderAdapter(Object.assign(bridge,{readProblem:async()=>{throw new Error('unused');},loginSummary:async()=>({site:'atcoder',state:'unknown'})}));
			const controller=new SubmissionController({adapters:[adapter],directories:()=>defaultDirectories,requestProblem:async()=>undefined,chooseLanguage:async()=> '6017',confirmDraft:async()=>true,runWithProgress:async(_file,operation)=>operation(()=>{}),openRecord:async record=>{revealed=record;}});
			try {
				const snapshot={uri:'file:///C:/practice/atcoder/abc086_a.cpp',fileName:'abc086_a.cpp',version:7,family:'cpp',source};
				const receipt=await controller.submit(snapshot);
				assert.equal(receipt.kind,'record');assert.equal(receipt.record.id,'11');
				const record=await adapter.readRecord(receipt.record,new AbortController().signal);
				assert.equal(record.rawStatus,'AC');
				assert.deepEqual(record.groups,[{name:'Test Cases',rows:[['sample_01','AC','1 ms','2048 KB']]}]);
				japanese=true;
				assert.deepEqual((await adapter.readRecord(receipt.record,new AbortController().signal)).groups,[{name:'Test Cases',rows:[['sample_01','AC','1 ms','2048 KB']]}]);
				rawVerdict='WA';
				assert.equal((await service.readAtCoderRecord('fixture',1,receipt.record)).rawStatus,'WA','a fresh response updates the verdict without relying on the old carrier DOM');
				rawVerdict='CE';sourceVisible=false;
				const ce=await service.readAtCoderRecord('fixture',1,receipt.record);
				assert.equal(ce.compileMessage,'./Main.cpp:4: error: <cin> was not declared\n  ^~~\n');
				assert.equal(ce.compileSucceeded,false);assert.equal(ce.source,undefined);
				assert.equal(revealed.id,'11');assert.equal(posts,1);
				await reset(true);const ready=arm();const pending=controller.submit(snapshot);
				assert.equal(await ready,false);const rejected=assert.rejects(pending,/stopped/);
				await bridge.dispose();await rejected;assert.equal(posts,0);
			} finally { await controller.dispose();await bridge.dispose(); }
		});
		console.log(JSON.stringify({passed,failed:failed.map(error=>error.message)}));
		if(failed.length){throw new AggregateError(failed,'AtCoder transaction regression failures');}
	} catch(error){console.error(error.stack);process.exitCode=1;}
	finally{window?.destroy();app.exit(process.exitCode||0);}
});
