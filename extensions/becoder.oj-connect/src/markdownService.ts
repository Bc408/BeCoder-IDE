/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2018 引领天下. MIT License.
 *  Adapted from yltx/vscode-luogu v4.20.0 (987ca974b5419230a07b59a195ec44026e16f6f4).
 *  BeCoder changes: shared OJ integration and localization. See ThirdPartyNotices.txt.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import type { Root } from 'hast';

type Renderer = Pick<
	typeof import('./markdown'),
	'renderMarkdownTree' | 'renderHtmlTree'
>;

type Content = Root;
type Format = 'tree' | 'lanqiao-tree' | 'html-tree';

/** One lazy parser with bounded content caching and in-flight request sharing. */
export class MarkdownService {
	private renderer: Promise<Renderer> | undefined;
	private readonly pending = new Map<string, Promise<Content>>();
	private readonly cache = new Map<string, { content: Content; bytes: number }>();
	private cacheBytes = 0;
	private generation = 0;

	constructor(
		// The shipped extension and renderer are separate CommonJS bundles.
		private readonly load: () => Promise<Renderer> = async () => require('./markdown') as Renderer,
		private readonly maxEntries = 32,
		private readonly maxBytes = 8 * 1024 * 1024
	) { }

	renderTree(markdown: string, lanqiao = false): Promise<Root> {
		return this.renderCached(markdown, lanqiao ? 'lanqiao-tree' : 'tree') as Promise<Root>;
	}

	renderHtmlTree(html: string, baseURL: string): Promise<Root> {
		return this.renderCached(html, 'html-tree', baseURL) as Promise<Root>;
	}

	private renderCached(markdown: string, format: Format, baseURL = ''): Promise<Content> {
		if (!markdown) { return Promise.resolve({ type: 'root', children: [] }); }
		const key = createHash('sha256')
			.update(format + '\0' + baseURL + '\0')
			.update(markdown)
			.digest('hex');
		const cached = this.cache.get(key);
		if (cached) {
			this.cache.delete(key);
			this.cache.set(key, cached);
			return Promise.resolve(cached.content);
		}
		const pending = this.pending.get(key);
		if (pending) { return pending; }

		const generation = this.generation;
		this.renderer ??= this.load().catch(error => {
			this.renderer = undefined;
			throw error;
		});
		const task = this.renderer
			.then(renderer => {
				return format === 'html-tree' ? renderer.renderHtmlTree(markdown, baseURL) : renderer.renderMarkdownTree(markdown, format === 'lanqiao-tree');
			})
			.then(content => {
				if (generation === this.generation) { this.remember(key, content); }
				return content;
			})
			.finally(() => {
				if (this.pending.get(key) === task) { this.pending.delete(key); }
			});
		this.pending.set(key, task);
		return task;
	}

	clear() {
		this.generation++;
		this.cache.clear();
		this.pending.clear();
		this.cacheBytes = 0;
	}

	private remember(key: string, content: Content) {
		// Budget UTF-16 text storage, including the hashed key; object overhead is extra.
		const bytes = (key.length + JSON.stringify(content).length) * 2;
		if (this.maxEntries < 1 || bytes > this.maxBytes) { return; }
		while (
			this.cache.size >= this.maxEntries ||
			this.cacheBytes + bytes > this.maxBytes
		) {
			const oldest = this.cache.entries().next().value;
			if (!oldest) { break; }
			this.cache.delete(oldest[0]);
			this.cacheBytes -= oldest[1].bytes;
		}
		this.cache.set(key, { content, bytes });
		this.cacheBytes += bytes;
	}
}

const markdownService = new MarkdownService();
export default markdownService;
