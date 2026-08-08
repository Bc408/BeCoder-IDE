/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { canLog, ILoggerService, LogLevel } from '../../../../../platform/log/common/log.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';

export interface ITextModelChangeRecorderMetadata {
	source?: string;
	extensionId?: string;
	nes?: boolean;
	type?: 'word' | 'line';
}

export class TextModelChangeRecorder extends Disposable {
	constructor(
		private readonly _editor: ICodeEditor,
		@ILoggerService private readonly _loggerService: ILoggerService,
	) {
		super();

		const logger = this._loggerService?.createLogger('textModelChanges', { hidden: false, name: 'Text Model Changes Reason' });

		const loggingLevel = observableFromEvent(this, logger.onDidChangeLogLevel, () => logger.getLevel());

		this._register(autorun(reader => {
			if (!canLog(loggingLevel.read(reader), LogLevel.Trace)) {
				return;
			}

			reader.store.add(this._editor.onDidChangeModelContent((e) => {
				if (this._editor.getModel()?.uri.scheme === 'output') {
					return;
				}
				logger.trace('onDidChangeModelContent: ' + e.detailedReasons.map(r => r.toKey(Number.MAX_VALUE)).join(', '));
			}));
		}));
	}
}
