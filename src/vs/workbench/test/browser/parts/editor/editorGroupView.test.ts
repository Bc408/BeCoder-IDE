/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IMenuCreateOptions, IMenuService, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { createEditorPart, workbenchInstantiationService } from '../../workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isEditorMoveAcrossWindows } from '../../../../browser/parts/editor/editorGroupView.js';

suite('EditorGroupView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('distinguishes editor parts from native windows', () => {
		const mainPart = { windowId: 1 };
		const modalPart = { windowId: 1 };
		const auxiliaryPart = { windowId: 2 };

		assert.strictEqual(isEditorMoveAcrossWindows(mainPart, modalPart), false);
		assert.strictEqual(isEditorMoveAcrossWindows(mainPart, auxiliaryPart), true);
	});

	test('layout toolbar refreshes without resubscribing to an unchanged menu context', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const contextKeyService = store.add(instantiationService.createInstance(ContextKeyService));
		instantiationService.stub(IContextKeyService, contextKeyService);
		let layoutMenusCreated = 0;
		const menuService = store.add(instantiationService.createInstance(class extends MenuService {
			override createMenu(id: MenuId, context: IContextKeyService, options?: IMenuCreateOptions) {
				if (id === MenuId.LayoutControlMenu) {
					layoutMenusCreated++;
				}
				return super.createMenu(id, context, options);
			}
		}));
		instantiationService.stub(IMenuService, menuService);
		const key = 'test.editorLayoutToolbar.visible';
		const enabled = contextKeyService.createKey<boolean>(key, false);
		store.add(MenuRegistry.appendMenuItem(MenuId.LayoutControlMenu, {
			command: { id: 'test.editorLayoutToolbar.action', title: 'Test Layout Action' },
			group: 'navigation',
			when: ContextKeyExpr.has(key),
		}));
		const part = await createEditorPart(instantiationService, store.add(new DisposableStore()));
		const toolbar = part.getContainer()!.querySelector('.editor-layout-actions');
		assert.ok(toolbar);
		await timeout(10);
		const initialMenusCreated = layoutMenusCreated;
		assert.ok(initialMenusCreated > 0);
		const hasTestAction = () => !!toolbar.querySelector('[aria-label="Test Layout Action"]');
		assert.strictEqual(hasTestAction(), false);

		for (let i = 0; i < 20; i++) {
			const visible = i % 2 === 0;
			enabled.set(visible);
			await timeout(10);
			assert.strictEqual(hasTestAction(), visible);
		}
		assert.strictEqual(layoutMenusCreated, initialMenusCreated);

		const registrationCountBeforeHiding = layoutMenusCreated;
		const disableTabs = store.add(part.enforcePartOptions({ showTabs: 'none' }));
		enabled.set(true);
		await timeout(10);
		assert.strictEqual(layoutMenusCreated, registrationCountBeforeHiding);
		assert.ok(!part.getContainer()!.querySelector('.editor-layout-actions'));

		disableTabs.dispose();
		await timeout(10);
		assert.ok(part.getContainer()!.querySelector('.editor-layout-actions [aria-label="Test Layout Action"]'));
	}));
});
