/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Action } from '../../../../../base/common/actions.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AccountsActivityActionViewItem, GlobalCompositeBar, isAccountsActionVisible } from '../../../../browser/parts/globalCompositeBar.js';

suite('BeCoder accounts visibility', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('fresh profiles hide Accounts and the native menu can show and hide it', async () => {
		const storage = store.add(new InMemoryStorageService());
		const key = AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY;
		assert.strictEqual(storage.get(key, StorageScope.PROFILE), undefined);
		assert.strictEqual(isAccountsActionVisible(storage), false);
		const instantiation = {
			createInstance: () => new ActionViewItem(undefined, store.add(new Action('test.globalActivity')), {}),
		} as unknown as IInstantiationService;
		const bar = store.add(new GlobalCompositeBar(() => [], () => ({}), { position: () => HoverPosition.RIGHT }, new TestConfigurationService(), instantiation, storage, {
			whenInstalledExtensionsRegistered: async () => { },
		} as never));
		await Promise.resolve();
		assert.strictEqual(bar.element.querySelectorAll('.action-item').length, 1, 'Only Manage is visible by default');
		assert.strictEqual(bar.getContextMenuActions()[0].checked, false);
		await bar.getContextMenuActions()[0].run();
		assert.strictEqual(isAccountsActionVisible(storage), true);
		assert.strictEqual(bar.element.querySelectorAll('.action-item').length, 2);
		assert.strictEqual(bar.getContextMenuActions()[0].checked, true);
		await bar.getContextMenuActions()[0].run();
		assert.strictEqual(isAccountsActionVisible(storage), false);
		assert.strictEqual(bar.element.querySelectorAll('.action-item').length, 1);
	});

	test('an explicit profile preference remains authoritative', () => {
		const storage = store.add(new InMemoryStorageService());
		const key = AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY;
		for (const visible of [true, false]) {
			storage.store(key, visible, StorageScope.PROFILE, StorageTarget.USER);
			assert.strictEqual(isAccountsActionVisible(storage), visible);
		}
		storage.remove(key, StorageScope.PROFILE);
		assert.strictEqual(isAccountsActionVisible(storage), false);
	});
});
