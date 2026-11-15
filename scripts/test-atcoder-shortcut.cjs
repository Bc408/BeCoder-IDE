/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with Electron after bundling browserViewMainService.ts to tmp/oj-connect-audit/shortcut-main.cjs.
// Uses only an intercepted private fixture session; never contacts an OJ or a user account.
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
		let posts = 0, ambiguous = false, captcha = false;
		const source = '#include <iostream>\nint main() { std::cout << "快捷键 הX123"; }\n';
		const escape = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
		const row = id => `<tr><td><a href="/contests/abc086/tasks/abc086_a">A</a></td><td><a href="/users/test-user">user</a></td><td><a href="/contests/abc086/submissions/me?f.Language=6017">C++23</a></td><td><a href="/contests/abc086/submissions/${id}">Detail</a></td></tr>`;
		const fixture = fs.readFileSync(path.join(repoRoot, 'src/vs/platform/browserView/test/common/atcoderForm.fixture.html'),'utf8').replace('value="abc086_a"','name="task" value="abc086_a"');
		const partition = 'shortcut-fixture';
		session.fromPartition(partition).protocol.handle('https', request => {
			const url = new URL(request.url);
			let html;
			if (url.pathname.endsWith('/tasks/abc086_a')) {
				html = fixture + (captcha ? '<input form="unused" name="cf-turnstile-response" value="">' : '') + `<script>document.querySelector('form').id='codeform';${captcha ? "document.querySelector('[name=cf-turnstile-response]').setAttribute('form','codeform');" : ''}document.querySelector('#input-open-file').addEventListener('change',e=>{const r=new FileReader();r.onload=()=>document.querySelector('#plain-textarea').value=r.result;r.readAsText(e.target.files[0]);});document.querySelector('button').id='submit';</script>`;
			} else if (url.pathname.endsWith('/submit') && request.method === 'POST') {
				posts++;
				html = '<script>location.replace("/contests/abc086/submissions/me")</script>';
			} else if (url.pathname.endsWith('/submissions/me')) {
				html = '<table><tr><th>Submission Time</th><th>Code Size</th></tr>' + (posts ? row('11') : '') + (posts && ambiguous ? row('12') : '') + row('10') + '</table>';
			} else if (/\/submissions\/\d+$/.test(url.pathname)) {
				html = `<pre id="submission-code">${escape(source)}</pre><table><tr><th>Task</th><td><a href="/contests/abc086/tasks/abc086_a">A</a></td></tr><tr><th>User</th><td><a href="/users/test-user">user</a></td></tr><tr><th>Score</th><td>100</td></tr><tr><th>Status</th><td id="judge-status">AC</td></tr></table>`;
			} else { return new Response('unsupported', { status:404 }); }
			return new Response(html,{headers:{'Content-Type':'text/html'}});
		});
		window = new BrowserWindow({show:false,webPreferences:{partition,sandbox:true,contextIsolation:true}});
		const task = 'https://atcoder.jp/contests/abc086/tasks/abc086_a';
		const load = async url => {await window.loadURL(url);if(window.webContents.isLoading())await new Promise(resolve=>window.webContents.once('did-stop-loading',resolve));};
		const view = { owner:{mainWindowId:1}, getWebContentsView:()=>({webContents:window.webContents}), session:{storageScope:'ephemeral'}, loadURL:load,
			onDidClose:listener=>{window.on('closed',listener);return{dispose:()=>window.removeListener('closed',listener)};},
			onDidNavigate:listener=>{const fn=(_event,url)=>listener({url});window.webContents.on('did-navigate',fn);return{dispose:()=>window.webContents.removeListener('did-navigate',fn)};} };
		const interactionRequests=[];
		const service = {_onDidRequireOjInteraction:{fire:value=>interactionRequests.push(value)},_getBrowserView:()=>view,atCoderRequests:new Map(),atCoderAttempts:new Map(),ojReads:new Map()};
		for(const name of ['prepareAtCoderTask','submitAtCoderTask','readAtCoderSubmission','readAtCoderRecord','sendAndConfirmAtCoderTask','cancelAtCoderTask']) service[name]=BrowserViewMainService.prototype[name];
		await load(task);
		const result=await service.submitAtCoderTask('fixture',1,task,{source,fileName:'abc086_a.cpp',languageId:'6017',replaceDraft:false});
		assert.equal(result.id,'11');assert.equal(result.status,'AC');assert.equal(result.score,'100');assert.equal(result.verified,true);assert.equal(posts,1);
		// New workflow must receive a confirmed ID before final-result polling.
		posts=0;await load(task);
		let detailReads=0;
		const readDetail=service.readAtCoderSubmission.bind(service);
		service.readAtCoderSubmission=async(...args)=>{detailReads++;return readDetail(...args);};
		const early=await BrowserViewMainService.prototype.sendAndConfirmAtCoderTask.call(service,'fixture',1,task,{source,fileName:'abc086_a.cpp',languageId:'6017',replaceDraft:false});
		assert.equal(early.kind,'record');assert.equal(early.record.id,'11');assert.equal(detailReads,0);assert.equal(posts,1);
		service.readAtCoderSubmission=BrowserViewMainService.prototype.readAtCoderSubmission;
		posts=0;ambiguous=true;await load(task);
		const uncertain=await BrowserViewMainService.prototype.sendAndConfirmAtCoderTask.call(service,'fixture',1,task,{source,fileName:'abc086_a.cpp',languageId:'6017',replaceDraft:false});
		assert.equal(uncertain.kind,'unconfirmed');assert.equal(posts,1);
		ambiguous=false;
		const reconciled=await BrowserViewMainService.prototype.reconcileAtCoderAttempt.call(service,uncertain.attemptId,1);
		assert.equal(reconciled.kind,'record');assert.equal(reconciled.record.id,'11');assert.equal(posts,1);
		posts=0;ambiguous=true;await load(task);
		const unclear=await service.submitAtCoderTask('fixture',1,task,{source,fileName:'abc086_a.cpp',languageId:'6017',replaceDraft:false});
		assert.equal(unclear.status,'ambiguous');assert.equal(unclear.verified,false);assert.equal(posts,1);
		posts=0;ambiguous=false;captcha=true;await load(task);
		const execute=window.webContents.executeJavaScriptInIsolatedWorld.bind(window.webContents);
		let sentResolve;
		const sentResult=new Promise(resolve=>sentResolve=resolve);
		window.webContents.executeJavaScriptInIsolatedWorld=(world,scripts,...rest)=>{const result=execute(world,scripts,...rest);if(scripts[0].code.includes('form.requestSubmit(button)'))result.then(sentResolve);return result;};
		const waiting=service.submitAtCoderTask('fixture',1,task,{source,fileName:'abc086_a.cpp',languageId:'6017',replaceDraft:false});
		assert.equal(await sentResult,false);
		await new Promise(resolve=>setTimeout(resolve,25));
		assert.deepEqual(interactionRequests,[{id:'fixture',windowId:1}]);
		assert.equal(posts,0);
		// Verification completing later must continue the user's original shortcut, with no manual Submit.
		await window.webContents.executeJavaScript("document.querySelector('[name=cf-turnstile-response]').value='fixture-approved'");
		let deadline;
		const resumed=await Promise.race([waiting,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Verification completed but shortcut did not submit')),7000);})]).finally(()=>clearTimeout(deadline));
		assert.equal(resumed.id,'11');assert.equal(resumed.status,'AC');assert.equal(posts,1);
		posts=0;await load(task);
		let pendingResolve;
		const pendingResult=new Promise(resolve=>pendingResolve=resolve);
		window.webContents.executeJavaScriptInIsolatedWorld=(world,scripts,...rest)=>{const result=execute(world,scripts,...rest);if(scripts[0].code.includes('form.requestSubmit(button)'))result.then(pendingResolve);return result;};
		const cancelled=service.submitAtCoderTask('fixture',1,task,{source,fileName:'abc086_a.cpp',languageId:'6017',replaceDraft:false});
		assert.equal(await pendingResult,false);
		await service.cancelAtCoderTask('fixture',1);
		const stopped=await cancelled;
		assert.equal(stopped.verified,false);assert.equal(stopped.stopped,true);assert.equal(posts,0);
		await window.webContents.executeJavaScript("document.querySelector('[name=cf-turnstile-response]').value='fixture-approved'");
		await new Promise(resolve=>setTimeout(resolve,400));
		assert.equal(posts,0);
		assert.equal(await window.webContents.executeJavaScriptInIsolatedWorld(1005,[{code:'globalThis.__becoderAtCoderSubmission === undefined'}]),true);

		// A manual native submit while waiting is observed even if the website temporarily prevents navigation.
		posts=0;await load(task);
		let manualResolve;
		const manualReady=new Promise(resolve=>manualResolve=resolve);
		window.webContents.executeJavaScriptInIsolatedWorld=(world,scripts,...rest)=>{const result=execute(world,scripts,...rest);if(scripts[0].code.includes('form.requestSubmit(button)'))result.then(manualResolve);return result;};
		const manual=service.submitAtCoderTask('fixture',1,task,{source,fileName:'abc086_a.cpp',languageId:'6017',replaceDraft:false});
		assert.equal(await manualReady,false);
		await window.webContents.executeJavaScript(`document.querySelector('form').addEventListener('submit',e=>e.preventDefault(),{once:true}); document.querySelector('[name=cf-turnstile-response]').value='fixture-approved'; document.querySelector('form').requestSubmit(document.querySelector('#submit'));`);
		await new Promise(resolve=>setTimeout(resolve,600));
		assert.equal(posts,0);
		await service.cancelAtCoderTask('fixture',1);
		await manual;

		// Editing the prepared webpage draft during verification cancels automatic sending.
		posts=0;await load(task);
		let changedResolve;
		const changedReady=new Promise(resolve=>changedResolve=resolve);
		window.webContents.executeJavaScriptInIsolatedWorld=(world,scripts,...rest)=>{const result=execute(world,scripts,...rest);if(scripts[0].code.includes('form.requestSubmit(button)'))result.then(changedResolve,()=>{});return result;};
		const changed=service.submitAtCoderTask('fixture',1,task,{source,fileName:'abc086_a.cpp',languageId:'6017',replaceDraft:false});
		assert.equal(await changedReady,false);
		await window.webContents.executeJavaScript("document.querySelector('#plain-textarea').value='changed'; document.querySelector('[name=cf-turnstile-response]').value='fixture-approved'");
		const rejected=await changed;
		assert.equal(rejected.verified,false);assert.equal(rejected.stopped,true);assert.equal(posts,0);
		// Compose the actual compiled extension controller, opaque bridge and native transaction.
		window.webContents.executeJavaScriptInIsolatedWorld=execute;
		posts=0;captcha=false;
		let revealed;
		let handle=0;
		const bridge=new AtCoderBridgeController({
			newHandle:()=>String(++handle),isPageCurrent:page=>window.webContents.getURL()===page.url&&!window.webContents.isLoading(),
			openTask:async url=>{await load(url);return{viewId:'fixture',url};},
			inspectTask:page=>service.prepareAtCoderTask(page.viewId,1,page.url),
			submit:(page,payload)=>service.submitAtCoderTask(page.viewId,1,page.url,payload),
			sendAndConfirm:(page,payload)=>service.sendAndConfirmAtCoderTask(page.viewId,1,page.url,payload),
			readRecord:record=>service.readAtCoderRecord('fixture',1,record),
			cancel:page=>service.cancelAtCoderTask(page.viewId,1),
			revealResult:async(_page,receipt)=>{revealed=receipt;}
		});
		const adapter = new AtCoderAdapter(Object.assign(bridge, { readProblem:async()=>{throw new Error('unused');},loginSummary:async()=>({site:'atcoder',state:'unknown'}) }));
		const controller=new SubmissionController({adapters:[adapter],directories:()=>defaultDirectories,requestProblem:async()=>undefined,chooseLanguage:async()=> '6017',confirmDraft:async()=>true,runWithProgress:async(_file,operation)=>operation(()=>{}),openRecord:async record=>{revealed=record;}});
		const snapshot={uri:'file:///C:/practice/atcoder/abc086_a.cpp',fileName:'abc086_a.cpp',version:7,family:'cpp',source};
		const composed=await controller.submit(snapshot);
		assert.equal(composed.kind,'record');assert.equal(composed.record.id,'11');assert.equal((await adapter.readRecord(composed.record,new AbortController().signal)).rawStatus,'AC');assert.equal(revealed.id,'11');assert.equal(posts,1);
		posts=0;captcha=true;
		let armedResolve;
		const armed=new Promise(resolve=>armedResolve=resolve);
		window.webContents.executeJavaScriptInIsolatedWorld=(world,scripts,...rest)=>{const result=execute(world,scripts,...rest);if(scripts[0].code.includes('form.requestSubmit(button)'))result.then(armedResolve,()=>{});return result;};
		const interrupted=controller.submit(snapshot);
		assert.equal(await armed,false);
		const interruptedCheck=assert.rejects(interrupted,/stopped/);
		await bridge.dispose();
		await window.webContents.executeJavaScript("document.querySelector('[name=cf-turnstile-response]').value='fixture-approved'");
		await interruptedCheck;
		assert.equal(posts,0);
		await controller.dispose();
		console.log(JSON.stringify({passed:true,realMainService:true,postsPerInvocation:1,newRecord:'11',oldRecordExcluded:'10',sourceVerified:true,result:'AC',ambiguousRejected:true,captchaWaitNoPost:true,verificationResumesWithoutClick:true,cancelNoResend:true,manualSubmitNotRepeated:true,changedDraftNoPost:true,observerCleanup:true,extensionBridgeComposed:true,extensionHostStopNoPost:true}));
	} catch(error){console.error(error.stack);process.exitCode=1;}
	finally{window?.destroy();app.exit(process.exitCode||0);}
});
