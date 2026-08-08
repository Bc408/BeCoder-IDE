/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';
import { suite, test } from 'node:test';
import * as JSONC from 'jsonc-parser';
import { BooleanPolicy } from '../policies/booleanPolicy.ts';
import { NumberPolicy } from '../policies/numberPolicy.ts';
import { ObjectPolicy } from '../policies/objectPolicy.ts';
import type { CategoryDto, ExportedPolicyDataDto, PolicyDto } from '../policies/policyDto.ts';
import { renderGP, renderJsonPolicies, renderMacOSPolicy } from '../policies/render.ts';
import { StringEnumPolicy } from '../policies/stringEnumPolicy.ts';
import { StringPolicy } from '../policies/stringPolicy.ts';
import type { Policy, ProductJson } from '../policies/types.ts';

const policyTypes = [
	BooleanPolicy,
	NumberPolicy,
	StringEnumPolicy,
	StringPolicy,
	ObjectPolicy
];

function parsePolicies(policyData: ExportedPolicyDataDto): Policy[] {
	const categories = new Map<string, CategoryDto>();
	for (const category of policyData.categories) {
		categories.set(category.key, category);
	}

	const policies: Policy[] = [];
	for (const policy of policyData.policies) {
		const category = categories.get(policy.category);
		if (!category) {
			throw new Error(`Unknown category: ${policy.category}`);
		}

		let result: Policy | undefined;
		for (const policyType of policyTypes) {
			if (result = policyType.from(category, policy)) {
				break;
			}
		}

		if (!result) {
			throw new Error(`Unsupported policy type: ${policy.type} for policy ${policy.name}`);
		}
		policies.push(result);
	}

	policies.sort((a, b) => {
		const categoryCompare = a.category.name.value.localeCompare(b.category.name.value);
		return categoryCompare || a.name.localeCompare(b.name);
	});
	return policies;
}

const mockProduct: ProductJson = {
	nameLong: 'Code - OSS',
	darwinBundleIdentifier: 'com.visualstudio.code.oss',
	darwinProfilePayloadUUID: 'CF808BE7-53F3-46C6-A7E2-7EDB98A5E959',
	darwinProfileUUID: '47827DD9-4734-49A0-AF80-7E19B11495CC',
	win32RegValueName: 'CodeOSS'
};

async function readCheckedInPolicyData(): Promise<ExportedPolicyDataDto> {
	const policyDataPath = path.join(import.meta.dirname, '..', 'policies', 'policyData.jsonc');
	const raw = await fs.readFile(policyDataPath, 'utf8');
	const errors: JSONC.ParseError[] = [];
	const policyData = JSONC.parse(raw, errors) as ExportedPolicyDataDto;
	assert.deepStrictEqual(errors, [], `policyData.jsonc should be valid JSONC: ${JSON.stringify(errors)}`);
	return policyData;
}

suite('Policy E2E conversion', () => {
	test('checked-in policy data contains only generic product policies', async () => {
		const policyData = await readCheckedInPolicyData();
		assert.ok(policyData.policies.length > 0);
		assert.doesNotMatch(JSON.stringify(policyData), /chat|agent|copilot|language.?model|mcp/i);

		const parsed = parsePolicies(policyData);
		assert.strictEqual(parsed.length, policyData.policies.length);
		assert.ok(parsed.some(policy => policy instanceof BooleanPolicy));
		assert.ok(parsed.some(policy => policy instanceof NumberPolicy));
		assert.ok(parsed.some(policy => policy instanceof ObjectPolicy));
		assert.ok(parsed.some(policy => policy instanceof StringEnumPolicy));
		assert.ok(parsed.some(policy => policy instanceof StringPolicy));
	});

	test('renders checked-in generic policies for macOS, Windows, and Linux', async () => {
		const parsed = parsePolicies(await readCheckedInPolicyData());
		const macOS = renderMacOSPolicy(mockProduct, parsed, []);
		const windows = renderGP(mockProduct, parsed, []);
		const linux = renderJsonPolicies(parsed);

		const outputs = [
			macOS.profile,
			...macOS.manifests.map(manifest => manifest.contents),
			windows.admx,
			...windows.adml.map(language => language.contents),
			JSON.stringify(linux)
		];
		for (const output of outputs) {
			assert.match(output, /AllowedExtensions|ExtensionGalleryServiceUrl/);
			assert.doesNotMatch(output, /chat|agent|copilot|language.?model|mcp/i);
		}
		assert.deepStrictEqual(Object.keys(linux).sort(), parsed.map(policy => policy.name).sort());
	});

	test('ObjectPolicy.from accepts a union type such as array or null', () => {
		const category: CategoryDto = { key: 'Extensions', name: { key: 'Extensions', value: 'Extensions' } };
		const policy: PolicyDto = {
			key: 'extensions.additionalSources',
			name: 'ExtensionAdditionalSources',
			category: 'Extensions',
			minimumVersion: '1.0',
			localization: { description: { key: 'desc', value: 'desc' } },
			type: ['array', 'null'],
			default: null
		};
		assert.ok(ObjectPolicy.from(category, policy));
	});

	test('descriptions containing angle brackets are escaped in ADML output', () => {
		const policyData: ExportedPolicyDataDto = {
			categories: [{ key: 'Extensions', name: { key: 'extensionsConfigurationTitle', value: 'Extensions' } }],
			policies: [{
				key: 'extensions.additionalSources',
				name: 'ExtensionAdditionalSources',
				category: 'Extensions',
				minimumVersion: '1.0',
				localization: {
					description: {
						key: 'extensions.additionalSources.policy',
						value: 'Additional sources use `<publisher>.<name>` keys and `<url>` values.'
					}
				},
				type: 'object',
				default: {}
			}]
		};

		const { adml } = renderGP(mockProduct, parsePolicies(policyData), []);
		const enUs = adml.find(language => language.languageId === 'en-us');
		assert.ok(enUs);
		assert.match(enUs.contents, /&lt;publisher&gt;\.&lt;name&gt;/);
		assert.match(enUs.contents, /&lt;url&gt;/);
		assert.doesNotMatch(enUs.contents, /<publisher>|<url>/);
	});
});
