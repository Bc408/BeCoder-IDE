/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuId, MenuRegistry, isIMenuItem } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { beCoderNotebookType } from '../../common/beCoderNotebook.js';
import '../../../notebook/browser/controller/editActions.js';
import '../../../notebook/browser/controller/executeActions.js';
import '../../../notebook/browser/controller/sectionActions.js';
import { CellEditState, EXECUTE_CELL_COMMAND_ID, QUIT_EDIT_CELL_COMMAND_ID } from '../../../notebook/browser/notebookBrowser.js';
import { CellKind } from '../../../notebook/common/notebookCommon.js';

function matches(expression: ContextKeyExpression | undefined, notebookType: string, cellType: 'code' | 'markup', editing = false): boolean {
	const values: Record<string, unknown> = {
		notebookType, notebookCellType: cellType, notebookCellMarkdownEditMode: editing,
		notebookCellEditable: true, notebookEditable: true, notebookCellExecutable: true,
		notebookCellExecuting: false, notebookKernelCount: 1,
	};
	return expression?.evaluate({ getValue: <T>(key: string) => values[key] as T | undefined }) ?? true;
}

function visibleCommands(menu: MenuId, notebookType: string, cellType: 'code' | 'markup', editing = false): string[] {
	return MenuRegistry.getMenuItems(menu).filter(isIMenuItem)
		.filter(item => matches(item.when, notebookType, cellType, editing))
		.map(item => item.command.id);
}

suite('Notebook Markdown cell toolbar', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('BeCoder Markdown offers edit and finish actions without section execution', () => {
		for (const editing of [false, true]) {
			const commands = visibleCommands(MenuId.NotebookCellTitle, beCoderNotebookType, 'markup', editing);
			assert.ok(!commands.includes('notebook.section.runCells'), 'Markdown must not display a section run button');
			assert.ok(commands.includes(editing ? QUIT_EDIT_CELL_COMMAND_ID : 'notebook.cell.edit'));
			assert.ok(!visibleCommands(MenuId.NotebookCellExecutePrimary, beCoderNotebookType, 'markup', editing).includes(EXECUTE_CELL_COMMAND_ID));
		}
	});

	test('ordinary ipynb and other notebooks retain Markdown section execution', () => {
		for (const notebookType of ['jupyter-notebook', 'other-notebook']) {
			for (const editing of [false, true]) {
				assert.ok(visibleCommands(MenuId.NotebookCellTitle, notebookType, 'markup', editing).includes('notebook.section.runCells'));
			}
		}
	});

	test('executable BeCoder cells retain the primary cell execution action', () => {
		const commands = visibleCommands(MenuId.NotebookCellExecutePrimary, beCoderNotebookType, 'code');
		assert.ok(commands.includes(EXECUTE_CELL_COMMAND_ID));
		assert.ok(!visibleCommands(MenuId.NotebookCellTitle, beCoderNotebookType, 'code').includes('notebook.section.runCells'));
	});

	test('finishing Markdown editing still renders the cell without executing it', async () => {
		const updates: unknown[][] = [], focused: unknown[][] = [];
		const cell = { cellKind: CellKind.Markup, updateEditState: (...args: unknown[]) => updates.push(args) };
		const notebookEditor = {
			focusNotebookCell: async (...args: unknown[]) => { focused.push(args); },
			executeNotebookCells: () => assert.fail('Finishing Markdown editing must not run cells'),
		};
		await CommandsRegistry.getCommand(QUIT_EDIT_CELL_COMMAND_ID)!.handler({ get: () => NullTelemetryService } as unknown as ServicesAccessor, { cell, notebookEditor, ui: true });
		assert.deepStrictEqual(updates, [[CellEditState.Preview, QUIT_EDIT_CELL_COMMAND_ID]]);
		assert.deepStrictEqual(focused, [[cell, 'container', { skipReveal: true }]]);
	});

	test('render all Markdown remains available independently of execution controls', async () => {
		const updates: unknown[][] = [];
		const cells = [
			{ cellKind: CellKind.Markup, updateEditState: (...args: unknown[]) => updates.push(args) },
			{ cellKind: CellKind.Code, updateEditState: () => assert.fail('Rendering Markdown must not modify code cells') },
		];
		const notebookEditor = {
			getLength: () => cells.length,
			cellAt: (index: number) => cells[index],
			executeNotebookCells: () => assert.fail('Rendering Markdown must not run cells'),
		};
		await CommandsRegistry.getCommand('notebook.renderAllMarkdownCells')!.handler({ get: () => NullTelemetryService } as unknown as ServicesAccessor, { notebookEditor });
		assert.deepStrictEqual(updates, [[CellEditState.Preview, 'renderAllMarkdownCells']]);
	});
});
