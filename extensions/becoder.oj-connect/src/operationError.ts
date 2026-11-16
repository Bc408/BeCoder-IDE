/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RecordRef } from './domain';

export class OperationError extends Error {
	constructor(readonly stage: 'prepare' | 'send' | 'confirm' | 'track', readonly delivery: 'not-sent' | 'unconfirmed' | 'record', message: string, readonly record?: RecordRef) { super(message); }
}
