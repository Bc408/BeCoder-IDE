/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	BrowserSearchEngineId,
	buildSearchUrl,
	getBrowserSearchEngineLabel,
	resolveAddressBarInputType,
} from '../../common/browserSearch.js';

suite('BrowserSearch - resolveAddressBarInput', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('recognized schemes are URLs', () => {
		const inputs = [
			'https://example.com',
			'http://example.com/path?q=1',
			'file:///etc/passwd',
			'about:blank',
			'data:text/html,<h1>hi</h1>',
			'view-source:https://example.com',
			'ftp://files.example.com',
			'vscode://settings',
			'HTTP://EXAMPLE.COM', // case-insensitive scheme
			'https://münchen.de/pfad?q=wert', // unicode after scheme
		];
		const actual = inputs.map((i) => resolveAddressBarInputType(i));
		assert.deepStrictEqual(actual, inputs.map(() => 'url'));
	});

	test('scheme-less hosts and IPs are URLs', () => {
		const inputs = [
			// Hostnames with a TLD
			'example.com',
			'sub.example.com:8080/path',
			'example.com?q=1',
			// Any 2+ letter last label is accepted as a TLD (covers new/brand
			// gTLDs without maintaining a list).
			'foo.bank',
			'acme.google',
			'foo.zzzznotatld',
			// IPv4 (navigable: first octet != 0, or exactly 0.0.0.0)
			'127.0.0.1',
			'127.0.0.1:8080',
			'192.168.1.1/admin',
			'0.0.0.0',
			'0.0.0.0:8080',
			// IPv6 (bracketed)
			'[::]',
			'[::]:8080',
			'[::1]',
			'[::1]:8080',
			'[0:0:0:0:0:0:0:0]',
			'[0:0:0:0:0:0:0:1]',
			'[2001:db8::1]/path',
			// localhost
			'localhost',
			'localhost:3000',
			'localhost/foo',
			'localhost?q=1',
			// Intranet shortcuts (bare host with a path ending in `/`)
			'go/',
			'intranet/',
			'go/there/',
			'wiki/page/sub/',
			// Absolute paths
			'/',
			'/usr/local/bin',
			'//example.com',
			// Internationalized domain names (IDN)
			'münchen.de',
			'xn--mnchen-3ya.de', // punycode form
			'münchen.de:8080/pfad',
			// Bracketed IPv6 literals (validated/canonicalized by URL parser)
			'[::1]',
			'[2001:0db8::0001]',
			// Subdomains of RFC 6761 special-cased TLDs require >= 1 subdomain
			'foo.test',
			'foo.local',
			'foo.example',
			'foo.internal',
		];
		const actual = inputs.map((i) => resolveAddressBarInputType(i));
		assert.deepStrictEqual(actual, inputs.map(() => 'url'));
	});

	test('queries (whitespace or invalid host chars) return query', () => {
		const inputs = [
			'hello world',
			'what is 2+2',
			'  spaced  query  ',
			'a&b?c=d', // invalid host char `&`
			'0.1.2.3', // IPv4 with first octet 0 (not 0.0.0.0)
			'[:::::::]', // malformed IPv6
		];
		const actual = inputs.map((i) => resolveAddressBarInputType(i));
		assert.deepStrictEqual(actual, inputs.map(() => 'query'));
	});

	test('ambiguous inputs return unknown', () => {
		const inputs = [
			'cats', // single word
			'intranet', // single word
			'wiki/page', // bare host + path, no trailing slash, no TLD
			'c#', // single token with fragment
			'日本語', // single Unicode word, no TLD
			'unknownscheme:foo', // unknown scheme that does not look like userinfo
			'foo.invalid', // RFC 6761 reserved as non-navigable
		];
		const actual = inputs.map((i) => resolveAddressBarInputType(i));
		assert.deepStrictEqual(actual, inputs.map(() => 'unknown'));
	});

	test('input is trimmed before classification', () => {
		assert.deepStrictEqual(
			[
				resolveAddressBarInputType('   example.com'),
				resolveAddressBarInputType('https://example.com   '),
				resolveAddressBarInputType('\tlocalhost:3000\n'),
			],
			['url', 'url', 'url'],
		);
	});

	test('empty / whitespace input returns empty', () => {
		assert.deepStrictEqual(
			[
				resolveAddressBarInputType(''),
				resolveAddressBarInputType('   '),
				resolveAddressBarInputType('\t\n'),
			],
			['empty', 'empty', 'empty'],
		);
	});

	test('unknown scheme that looks like user:password@host is a URL', () => {
		assert.strictEqual(
			resolveAddressBarInputType('user:pass@example.com'),
			'url',
		);
	});

	test('javascript: with non-code body is unknown', () => {
		assert.strictEqual(
			resolveAddressBarInputType('javascript:hello'),
			'unknown',
		);
		assert.strictEqual(
			resolveAddressBarInputType('javascript:alert(1)'),
			'url',
		);
	});
});

suite('BrowserSearch - buildSearchUrl', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('encodes queries for each engine', () => {
		const query = 'hello world';
		const actual = [
			BrowserSearchEngineId.Bing,
			BrowserSearchEngineId.Yahoo,
			BrowserSearchEngineId.Google,
			BrowserSearchEngineId.DuckDuckGo,
		].map((engine) => buildSearchUrl(query, engine));
		assert.deepStrictEqual(actual, [
			'https://www.bing.com/search?q=hello+world',
			'https://search.yahoo.com/search?p=hello+world',
			'https://www.google.com/search?q=hello+world',
			'https://duckduckgo.com/?q=hello+world',
		]);
	});

	test('trims and collapses internal whitespace', () => {
		assert.strictEqual(
			buildSearchUrl('  spaced  query  ', BrowserSearchEngineId.Bing),
			'https://www.bing.com/search?q=spaced+query',
		);
	});

	test('encodes special characters', () => {
		assert.deepStrictEqual(
			[
				buildSearchUrl('wiki/page', BrowserSearchEngineId.Bing),
				buildSearchUrl('what is 2+2', BrowserSearchEngineId.Bing),
				buildSearchUrl('c#', BrowserSearchEngineId.Bing),
				buildSearchUrl('日本語', BrowserSearchEngineId.Bing),
				buildSearchUrl('a&b?c=d', BrowserSearchEngineId.Bing),
				buildSearchUrl('unknownscheme:foo', BrowserSearchEngineId.Bing),
			],
			[
				'https://www.bing.com/search?q=wiki%2Fpage',
				'https://www.bing.com/search?q=what+is+2%2B2',
				'https://www.bing.com/search?q=c%23',
				'https://www.bing.com/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E',
				'https://www.bing.com/search?q=a%26b%3Fc%3Dd',
				'https://www.bing.com/search?q=unknownscheme%3Afoo',
			],
		);
	});

	test('unknown engine id falls back to default (Bing)', () => {
		assert.strictEqual(
			buildSearchUrl('cats', 'nonexistent' as BrowserSearchEngineId),
			'https://www.bing.com/search?q=cats',
		);
	});
});

suite('BrowserSearch - getBrowserSearchEngineLabel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns the engine label, falling back to default for unknown ids', () => {
		assert.deepStrictEqual(
			[
				getBrowserSearchEngineLabel(BrowserSearchEngineId.Bing),
				getBrowserSearchEngineLabel(BrowserSearchEngineId.Google),
				getBrowserSearchEngineLabel(BrowserSearchEngineId.DuckDuckGo),
				getBrowserSearchEngineLabel('nonexistent' as BrowserSearchEngineId),
			],
			['Bing', 'Google', 'DuckDuckGo', 'Bing'],
		);
	});
});

suite('BrowserSearch - custom engines', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves spaces and literal plus signs in path and fragment templates', () => {
		const engines = { Path: 'https://example.com/search/{query}', Fragment: 'https://example.com/#/search/{query}' };
		const query = 'a b+c/中文';
		assert.strictEqual(decodeURIComponent(new URL(buildSearchUrl(query, 'Path', engines)).pathname), `/search/${query}`);
		assert.strictEqual(decodeURIComponent(new URL(buildSearchUrl(query, 'Fragment', engines)).hash), `#/search/${query}`);
	});

	test('uses configured names and safely encodes every query placeholder', () => {
		const engines = { 'My Search': 'https://search.example.com/?q={query}&again={query}' };
		assert.strictEqual(getBrowserSearchEngineLabel('My Search', engines), 'My Search');
		assert.strictEqual(
			buildSearchUrl('  中文 C++ & x  ', 'My Search', engines),
			'https://search.example.com/?q=%E4%B8%AD%E6%96%87%20C%2B%2B%20%26%20x&again=%E4%B8%AD%E6%96%87%20C%2B%2B%20%26%20x',
		);
	});

	test('ignores malformed custom engines and protects built-in and disabled names', () => {
		const engines = {
			'': 'https://example.com/?q={query}',
			' spaced ': 'https://example.com/?q={query}',
			bing: 'https://unrelated.example/?q={query}',
			none: 'https://unrelated.example/?q={query}',
			missing: 'https://example.com/',
			script: 'javascript:alert("{query}")',
			file: 'file:///{query}',
			broken: 'https://[invalid/?q={query}',
			host: 'https://{query}.example.com/',
			credentials: 'https://user:password@example.com/?q={query}',
			number: 42,
			valid: 'https://example.com/search/{query}',
		};
		for (const id of Object.keys(engines).filter(id => id !== 'bing' && id !== 'valid')) {
			assert.strictEqual(getBrowserSearchEngineLabel(id, engines), 'Bing');
		}
		assert.strictEqual(getBrowserSearchEngineLabel('valid', engines), 'valid');
		assert.strictEqual(buildSearchUrl('cats', 'bing', engines), 'https://www.bing.com/search?q=cats');
		assert.strictEqual(buildSearchUrl('cats', 'script', engines), 'https://www.bing.com/search?q=cats');
	});

	test('falls back without throwing for manually malformed configuration', () => {
		for (const engines of [undefined, null, [], 'engine', 1, { custom: null }]) {
			assert.strictEqual(buildSearchUrl('cats', 'custom', engines), 'https://www.bing.com/search?q=cats');
			assert.strictEqual(getBrowserSearchEngineLabel('custom', engines), 'Bing');
		}
	});
});

