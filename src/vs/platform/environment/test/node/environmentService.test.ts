/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OPTIONS, parseArgs } from '../../node/argv.js';
import { NativeEnvironmentService } from '../../node/environmentService.js';
import product from '../../../product/common/product.js';

suite('EnvironmentService', () => {
	// https://github.com/microsoft/vscode/issues/78440
	test('careful with boolean file names', function () {
		let actual = parseArgs(['-r', 'arg.txt'], OPTIONS);
		assert(actual['reuse-window']);
		assert.deepStrictEqual(actual._, ['arg.txt']);

		actual = parseArgs(['-r', 'true.txt'], OPTIONS);
		assert(actual['reuse-window']);
		assert.deepStrictEqual(actual._, ['true.txt']);
	});

	test('userDataDir', () => {
		const service1 = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), { _serviceBrand: undefined, ...product });
		assert.ok(service1.userDataPath.length > 0);

		const args = parseArgs(process.argv, OPTIONS);
		args['user-data-dir'] = '/userDataDir/folder';

		const service2 = new NativeEnvironmentService(args, { _serviceBrand: undefined, ...product });
		assert.notStrictEqual(service1.userDataPath, service2.userDataPath);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
