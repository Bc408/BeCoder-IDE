/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { beaconContextCommand } from '../../../../../platform/beacon/common/beaconContext.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import '../../electron-browser/beaconContext.contribution.js';

suite('Beacon product metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('version command reads only the product version, never compatibility or workspace services', () => {
		for (const version of ['2.1.1', '2.2.0-dev']) {
			const services: unknown[] = [];
			const accessor = { get: (id: unknown) => { services.push(id); assert.strictEqual(id, IProductService); return { version, extensionApiVersion: '1.140.0' }; } } as ServicesAccessor;
			const handler = CommandsRegistry.getCommand(beaconContextCommand)!.handler;
			assert.strictEqual(handler(accessor, 'productVersion', undefined), version);
			assert.deepStrictEqual(services, [IProductService]);
		}
	});
});
