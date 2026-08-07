/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class DiagnosticStore<T> {
	private readonly owners = new Map<string, Map<string, readonly T[]>>();

	replace(owner: string, diagnostics: ReadonlyMap<string, readonly T[]>): Set<string> {
		const affected = new Set(this.owners.get(owner)?.keys() ?? []);
		for (const uri of diagnostics.keys()) {
			affected.add(uri);
		}
		this.owners.set(owner, new Map(diagnostics));
		return affected;
	}

	remove(owner: string): Set<string> {
		const affected = new Set(this.owners.get(owner)?.keys() ?? []);
		this.owners.delete(owner);
		return affected;
	}

	removeUri(uri: string): Set<string> {
		let removed = false;
		for (const diagnostics of this.owners.values()) {
			removed = diagnostics.delete(uri) || removed;
		}
		return removed ? new Set([uri]) : new Set();
	}

	merged(uri: string): readonly T[] {
		const merged: T[] = [];
		for (const diagnostics of this.owners.values()) {
			merged.push(...(diagnostics.get(uri) ?? []));
		}
		return merged;
	}

	clear(): Set<string> {
		const affected = new Set<string>();
		for (const diagnostics of this.owners.values()) {
			for (const uri of diagnostics.keys()) {
				affected.add(uri);
			}
		}
		this.owners.clear();
		return affected;
	}
}
