/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { AbstractPolicyService, PolicyDefinition } from '../../common/policy.js';

class TestPolicyService extends AbstractPolicyService {
	protected async _updatePolicyDefinitions(_policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		// no-op: the OS/file watcher is irrelevant for serialization tests
	}
}

suite('AbstractPolicyService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('serialize() preserves policy definitions', async () => {
		const service = new TestPolicyService();

		await service.updatePolicyDefinitions({
			'BooleanDefinition': {
				type: 'boolean',
			},
			'PlainDefinition': {
				type: 'string',
			}
		});

		const serialized = service.serialize();

		assert.strictEqual(serialized['BooleanDefinition'].definition.type, 'boolean');
		assert.strictEqual(serialized['PlainDefinition'].definition.type, 'string');

		// The whole payload must be structured-clone-safe (this is how it is delivered to the
		// renderer as part of the window configuration's policiesData).
		assert.doesNotThrow(() => structuredClone(serialized));

		service.dispose();
	});
});
