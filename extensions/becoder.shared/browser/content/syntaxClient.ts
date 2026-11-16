/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the MIT License. See LICENSE in the component root for license information.
 *--------------------------------------------------------------------------------------------*/

import { grammarFiles, languages } from 'becoder-syntax-assets';
import type { SyntaxPatch, SyntaxResult } from './syntax';

type GrammarReply = { scope: string };
type PatchReply = { id: number; version: number; patch: SyntaxPatch | null };
function isGrammarReply(reply: GrammarReply | PatchReply): reply is GrammarReply { return 'scope' in reply; }

interface Request { id: number; version: number; language: string; text: string }
interface Session { notify: (text: string, lines: SyntaxResult['lines'] | null) => void; lines: SyntaxResult['lines']; language?: string; latest?: Request }
let worker: Worker | undefined;
let starting: Promise<void> | undefined;
let sequence = 0;
let active: Request | undefined;
const pending = new Map<number, Request>();
const sessions = new Map<number, Session>();

function dispatch() {
	if (active || !pending.size || !worker) { return; }
	const request = pending.values().next().value!;
	pending.delete(request.id);
	active = request;
	worker.postMessage(request);
}

async function getWorker() {
	if (worker) { return; }
	if (starting) { return starting; }
	starting = (async () => {
		const script = document.querySelector<HTMLScriptElement>('script[src]')!;
		const signal = AbortSignal.timeout(10000);
		const [response, wasmResponse] = await Promise.all([fetch(new URL('syntax-worker.js', script.src), { signal }), fetch(new URL('onig.wasm', script.src), { signal })]);
		if (!response.ok || !wasmResponse.ok) { throw new Error('syntax-assets-unavailable'); }
		const [source, wasm] = await Promise.all([response.text(), wasmResponse.arrayBuffer()]);
		if (!sessions.size) { return; }
		const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
		let owner: Worker;
		try { owner = new Worker(url); worker = owner; } finally { URL.revokeObjectURL(url); }
		owner.onmessage = (event: MessageEvent<GrammarReply | PatchReply>) => {
			const reply = event.data;
			if (isGrammarReply(reply)) {
				// Only the bundled manifest can name resources. The blob Worker cannot
				// route Webview resource requests, so its window fetches local grammars.
				const file = Object.hasOwn(grammarFiles, reply.scope) ? grammarFiles[reply.scope] : undefined;
				void (async () => {
					try {
						const response = file && await fetch(new URL(file, script.src), { signal: AbortSignal.timeout(10000) });
						const grammar = response && response.ok ? await response.json() : null;
						if (worker === owner) { owner.postMessage({ scope: reply.scope, grammar }); }
					} catch { if (worker === owner) { owner.postMessage({ scope: reply.scope, grammar: null }); } }
				})();
				return;
			}
			const request = active;
			if (!request || request.id !== reply.id || request.version !== reply.version) { return; }
			active = undefined;
			const session = sessions.get(request.id);
			if (session) {
				const patch = reply.patch;
				if (!patch || patch.start > session.lines.length || patch.start && session.language !== request.language) { session.lines = []; if (session.latest?.language === request.language && session.latest.text.startsWith(request.text)) { session.notify(request.text, null); } }
				else {
					session.lines.length = patch.start;
					for (const line of patch.lines) { session.lines.push(line); }
					session.lines.length = patch.lineCount;
					session.language = request.language;
					if (session.latest?.language === request.language && session.latest.text.startsWith(request.text)) { session.notify(request.text, session.lines); }
				}
			}
			dispatch();
		};
		owner.onerror = () => {
			if (active) { sessions.get(active.id)?.notify(active.text, null); }
			for (const request of pending.values()) { sessions.get(request.id)?.notify(request.text, null); }
			pending.clear(); active = undefined;
			owner.terminate(); if (worker === owner) { worker = undefined; }
		};
		owner.postMessage({ wasm }, [wasm]);
	})().finally(() => { starting = undefined; });
	return starting;
}

/** One Worker owned by this document; only the latest pending revision per block. */
export function createSyntaxClient(notify: Session['notify']) {
	const id = ++sequence;
	let version = 0;
	sessions.set(id, { notify, lines: [] });
	return {
		update(text: string, language: string) {
			const session = sessions.get(id);
			if (!session) { return; }
			const request = { id, version: ++version, text, language };
			session.latest = request;
			if (!languages[language]) { pending.delete(id); notify(text, null); return; }
			pending.set(id, request);
			void getWorker().then(dispatch).catch(() => { if (pending.get(id) === request) { pending.delete(id); notify(text, null); } });
		},
		dispose() { sessions.delete(id); pending.delete(id); worker?.postMessage({ id, release: true }); }
	};
}

if (typeof window !== 'undefined') { window.addEventListener('pagehide', () => { worker?.terminate(); worker = undefined; active = undefined; pending.clear(); sessions.clear(); }); }
