/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under GPL-3.0-or-later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/

import type { RecordRef } from './domain';

export class OperationError extends Error {
	constructor(readonly stage: 'prepare' | 'send' | 'confirm' | 'track', readonly delivery: 'not-sent' | 'unconfirmed' | 'record', message: string, readonly record?: RecordRef) { super(message); }
}
