/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useRef, useState } from 'react';
import type { SyntaxResult } from './syntax';
import { languages } from 'beacon-syntax-assets';

type Result = Omit<SyntaxResult, 'lines'> & { lines: SyntaxResult['lines'] | null };
interface Request { id: number; version: number; language: string; text: string }
let worker: Worker | undefined;
let starting: Promise<void> | undefined;
let sequence = 0;
let active: Request | undefined;
const pending = new Map<number, Request>();
const listeners = new Map<number, (request: Request, result: Result) => void>();

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
		// Webview resource requests must originate in the window: a blob worker's
		// client has no Webview id for the resource proxy to route its WASM request.
		const signal = AbortSignal.timeout(10000);
		const [response, wasmResponse] = await Promise.all([
			fetch(new URL('syntax-worker.js', script.src), { signal }), fetch(new URL('onig.wasm', script.src), { signal })
		]);
		if (!response.ok || !wasmResponse.ok) { throw new Error('syntax-assets-unavailable'); }
		const [source, wasm] = await Promise.all([response.text(), wasmResponse.arrayBuffer()]);
		if (!listeners.size) { return; }
		// VS Code Webviews support blob workers, not workers loaded directly from resource URIs.
		const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
		try { worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
		worker.onmessage = (event: MessageEvent<{ id: number; version: number; result: Result }>) => {
			const request = active;
			if (!request || request.id !== event.data.id || request.version !== event.data.version) { return; }
			active = undefined;
			listeners.get(request.id)?.(request, event.data.result);
			dispatch();
		};
		worker.onerror = () => {
			if (active) { listeners.get(active.id)?.(active, { text: active.text, lines: null }); }
			for (const request of pending.values()) { listeners.get(request.id)?.(request, { text: request.text, lines: null }); }
			pending.clear(); active = undefined;
			worker?.terminate(); worker = undefined;
		};
		worker.postMessage({ wasm }, [wasm]);
	})().finally(() => { starting = undefined; });
	return starting;
}

/** One shared worker, one in-flight snapshot, latest pending revision per code block. */
export function useCodeSyntax(text: string, language: string) {
	const [id] = useState(() => ++sequence);
	const version = useRef(0);
	const latest = useRef({ text, language });
	latest.current = { text, language };
	const [snapshot, setSnapshot] = useState<(Result & { language: string })>();
	const supported = !!languages[language];
	useEffect(() => {
		if (!supported) { return; }
		listeners.set(id, (request, result) => {
			if (latest.current.language === request.language && latest.current.text.startsWith(result.text)) { setSnapshot({ ...result, language: request.language }); }
		});
		return () => {
			listeners.delete(id); pending.delete(id);
			worker?.postMessage({ id, release: true });
			if (!listeners.size) { worker?.terminate(); worker = undefined; active = undefined; pending.clear(); }
		};
	}, [id, supported]);
	useEffect(() => {
		if (!supported) { return; }
		const request = { id, version: ++version.current, text, language };
		pending.set(id, request);
		void getWorker().then(dispatch).catch(() => {
			if (pending.get(id) === request) { pending.delete(id); setSnapshot({ text, lines: null, language }); }
		});
	}, [id, text, language, supported]);
	return snapshot?.language === language && text.startsWith(snapshot.text) ? snapshot : undefined;
}
