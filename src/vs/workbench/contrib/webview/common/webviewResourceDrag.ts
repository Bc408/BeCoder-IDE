/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Only a native drag started in this workbench can authorize an internal drop. */
export class WebviewResourceDrag {
	private resources = new Set<string>();

	start(trusted: boolean, resources: readonly string[]): void {
		this.resources = new Set(trusted ? resources : []);
	}

	end(): void {
		this.resources.clear();
	}

	source(trusted: boolean, resources: readonly string[]): 'internal' | 'external' {
		return trusted && resources.length > 0 && resources.every(resource => this.resources.has(resource)) ? 'internal' : 'external';
	}
}
