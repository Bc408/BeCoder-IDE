/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionKind } from '../../../../platform/environment/common/environment.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';

export const enum ExtensionHostKind {
	LocalProcess = 1,
	LocalWebWorker = 2
}

export function extensionHostKindToString(kind: ExtensionHostKind | null): string {
	if (kind === null) {
		return 'None';
	}
	switch (kind) {
		case ExtensionHostKind.LocalProcess: return 'LocalProcess';
		case ExtensionHostKind.LocalWebWorker: return 'LocalWebWorker';
	}
}

export interface IExtensionHostKindPicker {
	pickExtensionHostKind(extensionId: ExtensionIdentifier, extensionKinds: ExtensionKind[], isInstalledLocally: boolean): ExtensionHostKind | null;
}

export function determineExtensionHostKinds(
	_localExtensions: IExtensionDescription[],
	getExtensionKind: (extensionDescription: IExtensionDescription) => ExtensionKind[],
	pickExtensionHostKind: (extensionId: ExtensionIdentifier, extensionKinds: ExtensionKind[], isInstalledLocally: boolean) => ExtensionHostKind | null
): Map<string, ExtensionHostKind | null> {
	const localExtensions = toExtensionWithKind(_localExtensions, getExtensionKind);

	const extensionHostKinds = new Map<string, ExtensionHostKind | null>();
	localExtensions.forEach((ext) => {
		extensionHostKinds.set(ext.key, pickExtensionHostKind(ext.desc.identifier, ext.kind, true));
	});

	return extensionHostKinds;
}

function toExtensionWithKind(
	extensions: IExtensionDescription[],
	getExtensionKind: (extensionDescription: IExtensionDescription) => ExtensionKind[]
): Map<string, ExtensionWithKind> {
	const result = new Map<string, ExtensionWithKind>();
	extensions.forEach((desc) => {
		const ext = new ExtensionWithKind(desc, getExtensionKind(desc));
		result.set(ext.key, ext);
	});
	return result;
}

class ExtensionWithKind {

	constructor(
		public readonly desc: IExtensionDescription,
		public readonly kind: ExtensionKind[]
	) { }

	public get key(): string {
		return ExtensionIdentifier.toKey(this.desc.identifier);
	}
}
