/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger) {
	describe('Accessibility', function () {

		this.timeout(2 * 60 * 1000);
		this.retries(2);
		installAllHandlers(logger);

		let app: Application;

		before(async function () {
			app = this.app as Application;
		});

		describe('Workbench', function () {

			it('workbench has no accessibility violations', async function () {
				await app.code.waitForElement('.monaco-workbench');

				await app.code.driver.assertNoAccessibilityViolations({
					selector: '.monaco-workbench',
					excludeRules: {
						'aria-allowed-attr': ['monaco-list', 'monaco-list-row'],
						'aria-required-children': ['monaco-list']
					}
				});
			});

			it('activity bar has no accessibility violations', async function () {
				await app.code.waitForElement('.activitybar');
				await app.code.driver.assertNoAccessibilityViolations({ selector: '.activitybar' });
			});

			it('sidebar has no accessibility violations', async function () {
				await app.code.waitForElement('.sidebar');
				await app.code.driver.assertNoAccessibilityViolations({ selector: '.sidebar' });
			});

			it('status bar has no accessibility violations', async function () {
				await app.code.waitForElement('.statusbar');
				await app.code.driver.assertNoAccessibilityViolations({ selector: '.statusbar' });
			});
		});
	});
}
