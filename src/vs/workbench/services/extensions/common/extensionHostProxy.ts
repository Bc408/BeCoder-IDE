/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IExtensionDescriptionDelta } from './extensionHostProtocol.js';
import { ActivationKind, ExtensionActivationReason } from './extensions.js';

export interface IExtensionHostProxy {
	startExtensionHost(extensionsDelta: IExtensionDescriptionDelta): Promise<void>;
	extensionTestsExecute(): Promise<number>;
	activateByEvent(activationEvent: string, activationKind: ActivationKind): Promise<void>;
	activate(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<boolean>;
	deltaExtensions(extensionsDelta: IExtensionDescriptionDelta): Promise<void>;
	test_latency(n: number): Promise<number>;
	test_up(b: VSBuffer): Promise<number>;
	test_down(size: number): Promise<VSBuffer>;
}
