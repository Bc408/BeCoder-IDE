/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { createSyntaxRegistry, IncrementalSyntax } from './syntax';
import { languages } from 'beacon-syntax-assets';

let registry: ReturnType<typeof createSyntaxRegistry> | undefined;
const sessions = new Map<number, { language: string; tokenizer: IncrementalSyntax }>();
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<{ wasm: ArrayBuffer } | { id: number; version: number; language: string; text: string; release?: boolean }>) => {
	const request = event.data;
	if ('wasm' in request) {
		registry = createSyntaxRegistry(request.wasm);
		// Initialization can fail before the first snapshot arrives. Keep it handled
		// here; awaiting the same promise below falls back to readable plain text.
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
				if (!scope) { throw new Error('syntax-grammar-unavailable'); }
				const grammar = await owner.loadGrammar(scope);
				if (!grammar) { throw new Error('syntax-grammar-unavailable'); }
				session = { language: request.language, tokenizer: new IncrementalSyntax(grammar, owner.getColorMap()) };
				sessions.set(request.id, session);
				if (sessions.size > 32) { sessions.delete(sessions.keys().next().value!); }
			}
			self.postMessage({ id: request.id, version: request.version, result: session.tokenizer.update(request.text) });
		} catch {
			sessions.delete(request.id);
			self.postMessage({ id: request.id, version: request.version, result: { text: request.text, lines: null } });
		}
	});
};
