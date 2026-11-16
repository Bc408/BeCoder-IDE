/* Copyright (c) BeCoder contributors. MIT License. See ../../LICENSE. */
import { createSyntaxRegistry, IncrementalSyntax } from './syntax';
import { languages } from 'becoder-syntax-assets';
import type { IRawGrammar } from 'vscode-textmate';

type GrammarRequest = { scope: string; grammar: IRawGrammar | null };
type Initialization = { wasm: ArrayBuffer };
type SyntaxRequest = { id: number; version: number; language: string; text: string; release?: boolean };
type WorkerRequest = GrammarRequest | Initialization | SyntaxRequest;
function isGrammarRequest(value: WorkerRequest): value is GrammarRequest { return 'scope' in value; }
function isInitialization(value: WorkerRequest): value is Initialization { return 'wasm' in value; }

let registry: ReturnType<typeof createSyntaxRegistry> | undefined;
const loading = new Map<string, (grammar: IRawGrammar | null) => void>();
const sessions = new Map<number, { language: string; tokenizer: IncrementalSyntax }>();
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
	const request = event.data;
	if (isGrammarRequest(request)) { loading.get(request.scope)?.(request.grammar); loading.delete(request.scope); return; }
	if (isInitialization(request)) {
		registry = createSyntaxRegistry(request.wasm, scope => new Promise(resolve => {
			loading.set(scope, resolve);
			self.postMessage({ scope });
		}));
		void registry.catch(() => { });
		return;
	}
	queue = queue.then(async () => {
		if (request.release) { sessions.delete(request.id); return; }
		try {
			if (request.text.length > 512000 || request.text.split('\n').some(line => line.length > 20000)) { throw new Error('syntax-size-budget'); }
			if (!registry) { throw new Error('syntax-not-initialized'); }
			const owner = await registry;
			let session = sessions.get(request.id);
			if (!session || session.language !== request.language) {
				const scope = languages[request.language]?.scope;
				const grammar = scope && await owner.loadGrammar(scope);
				if (!grammar) { throw new Error('syntax-grammar-unavailable'); }
				session = { language: request.language, tokenizer: new IncrementalSyntax(grammar, owner.getColorMap()) };
				sessions.set(request.id, session);
				if (sessions.size > 32) { sessions.delete(sessions.keys().next().value!); }
			}
			self.postMessage({ id: request.id, version: request.version, patch: await session.tokenizer.patch(request.text) });
		} catch {
			sessions.delete(request.id);
			self.postMessage({ id: request.id, version: request.version, patch: null });
		}
	});
};
