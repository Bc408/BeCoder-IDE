/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IProblemStatementCacheService, isStatementLanguage, statementCacheChannel, statementCacheCommand } from '../../../../platform/browserView/common/ojStatementCache.js';
// eslint-disable-next-line local/code-import-patterns -- Internal statement transport types.
import type { ProblemRef, StatementContent, StatementRead, StatementVersion } from 'becoder-oj-connect';

CommandsRegistry.registerCommand(statementCacheCommand, (accessor, operation: unknown, input: unknown) => {
	const service = ProxyChannel.toService<IProblemStatementCacheService>(accessor.get(IMainProcessService).getChannel(statementCacheChannel));
	const windowId = mainWindow.vscodeWindowId;
	const value = input as { ref?: ProblemRef; language?: unknown; document?: StatementContent; source?: StatementRead; target?: unknown; ticketId?: string; version?: StatementVersion } | undefined;
	switch (operation) {
		case 'read': if (value?.ref && isStatementLanguage(value.language)) { return service.read(windowId, value.ref, value.language); } break;
		case 'merge': if (value?.document) { return service.merge(windowId, value.document); } break;
		case 'publishAcquired': if (value?.document) { return service.publishAcquired(windowId, value.document); } break;
		case 'acquireTranslation': if (value?.source && isStatementLanguage(value.target)) { return service.acquireTranslation(windowId, value.source, value.target); } break;
		case 'publishTranslation': if (typeof value?.ticketId === 'string' && value.version) { return service.publishTranslation(windowId, value.ticketId, value.version); } break;
		case 'releaseTranslation': if (typeof value?.ticketId === 'string') { return service.releaseTranslation(windowId, value.ticketId); } break;
	}
	throw new Error('statement-invalid-command');
});
