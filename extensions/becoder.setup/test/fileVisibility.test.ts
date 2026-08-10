/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';

import { beCoderHiddenFiles, hideBeCoderFiles, isBeCoderHideActive, isBeCoderHideActiveInAllScopes, migrateLegacyBeCoderExcludes, showBeCoderFiles } from '../src/fileVisibility';

suite('BeCoder file visibility', () => {
	test('keeps a clean profile unchanged until hide is requested', () => {
		assert.deepStrictEqual(migrateLegacyBeCoderExcludes({}, false), {});
		assert.strictEqual(isBeCoderHideActive({}, undefined), false);
	});

	test('hides the complete managed set and restores only changed values', () => {
		const initial = {
			'**/*.exe': false,
			'**/*.bin': { when: '$(basename).cpp' },
			'**/node_modules': true
		};
		const hidden = hideBeCoderFiles(initial, undefined);
		assert.deepStrictEqual(hidden.excludes, { ...initial, ...beCoderHiddenFiles });
		assert.strictEqual(isBeCoderHideActive(hidden.excludes, hidden.state), true);
		assert.deepStrictEqual(showBeCoderFiles(hidden.excludes, hidden.state), initial);
	});

	test('preserves user edits made while files are hidden', () => {
		const hidden = hideBeCoderFiles({ '**/keep': true }, undefined);
		const userEdited = {
			...hidden.excludes,
			'**/*.exe': false,
			'**/*.bin': { when: '$(basename).cpp' },
			'**/keep': false
		};
		assert.strictEqual(isBeCoderHideActive(userEdited, hidden.state), false);
		assert.deepStrictEqual(showBeCoderFiles(userEdited, hidden.state), {
			'**/*.exe': false,
			'**/*.bin': { when: '$(basename).cpp' },
			'**/keep': false
		});
	});

	test('does not claim ownership of manually hidden patterns', () => {
		assert.strictEqual(isBeCoderHideActive({ ...beCoderHiddenFiles }, undefined), false);
		assert.deepStrictEqual(showBeCoderFiles({ ...beCoderHiddenFiles }, undefined), beCoderHiddenFiles);
	});

	test('reports an effective workspace override as not fully hidden', () => {
		const hidden = hideBeCoderFiles({}, undefined);
		assert.strictEqual(isBeCoderHideActive(hidden.excludes, hidden.state, {
			...hidden.excludes,
			'**/*.exe': false
		}), false);
	});

	test('requires every multi-root folder scope to be fully hidden', () => {
		const hidden = hideBeCoderFiles({}, undefined);
		assert.strictEqual(isBeCoderHideActiveInAllScopes(hidden.excludes, hidden.state, [
			hidden.excludes,
			{ ...hidden.excludes, '**/*.exe': false }
		]), false);
		assert.strictEqual(isBeCoderHideActiveInAllScopes(hidden.excludes, hidden.state, [hidden.excludes, hidden.excludes]), true);
	});

	test('rehiding after a user edit makes the edit the new restoration value', () => {
		const first = hideBeCoderFiles({}, undefined);
		const edited = { ...first.excludes, '**/*.exe': false };
		const second = hideBeCoderFiles(edited, first.state);
		assert.deepStrictEqual(showBeCoderFiles(second.excludes, second.state), { '**/*.exe': false });
	});

	test('legacy migration removes only the complete v4 fingerprint', () => {
		const legacy = {
			'**/.*': true,
			'**/*.exe': true,
			'**/*.bin': true,
			'**/*.bin.dSYM': true,
			'**/*.dSYM': true,
			'**/build': true
		};
		assert.deepStrictEqual(migrateLegacyBeCoderExcludes(legacy, true), {
			'**/.*': true,
			'**/build': true
		});
	});

	test('legacy migration preserves a user-modified partial fingerprint', () => {
		const legacy = {
			'**/.*': true,
			'**/*.exe': true,
			'**/*.bin': false,
			'**/*.bin.dSYM': true,
			'**/*.dSYM': true
		};
		assert.deepStrictEqual(migrateLegacyBeCoderExcludes(legacy, true), legacy);
	});
});
