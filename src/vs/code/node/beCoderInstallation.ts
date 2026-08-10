/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdirSync, promises, readFileSync, statSync, type Stats } from 'fs';
import { dirname, join } from '../../base/common/path.js';

const installationMarkerName = '.becoder-installation.json';
const installationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumMarkerSize = 4096;

type BeCoderInstallationMarker = {
	readonly schemaVersion?: unknown;
	readonly product?: unknown;
	readonly installationId?: unknown;
};

export type BeCoderPackagedDataRootOptions = {
	readonly isPackaged: boolean;
	readonly productName: string | undefined;
	readonly applicationName: string | undefined;
	readonly applicationPath: string;
	readonly environment: NodeJS.ProcessEnv;
};

export type BeCoderImportRecoveryPaths = {
	readonly journalPath: string;
	readonly helperPath: string;
};

export function configureBeCoderPackagedDataRoot(options: BeCoderPackagedDataRootOptions): string | undefined {
	if (!options.isPackaged || options.productName !== 'BeCoder' || options.applicationName !== 'becoder') {
		return undefined;
	}

	const dataRoot = join(dirname(dirname(options.applicationPath)), 'data');
	mkdirSync(dataRoot, { recursive: true });
	options.environment['VSCODE_PORTABLE'] = dataRoot;
	delete options.environment['VSCODE_APPDATA'];
	return dataRoot;
}

export async function resolveBeCoderImportRecovery(dataRoot: string, applicationRoot: string): Promise<BeCoderImportRecoveryPaths | undefined> {
	const journalPath = join(dataRoot, '.becoder-import-transaction.json');
	let journal: Stats;
	try {
		journal = await promises.lstat(journalPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return undefined;
		}
		throw error;
	}
	if (!journal.isFile() || journal.isSymbolicLink()) {
		throw new Error(`BeCoder import recovery journal is not an ordinary file: ${journalPath}`);
	}

	const helperPath = join(applicationRoot, 'extensions', 'becoder.setup', 'out', 'userDataImportHelper.js');
	let helper: Stats;
	try {
		helper = await promises.lstat(helperPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new Error(`BeCoder import recovery helper is missing: ${helperPath}`);
		}
		throw error;
	}
	if (!helper.isFile() || helper.isSymbolicLink()) {
		throw new Error(`BeCoder import recovery helper is not an ordinary file: ${helperPath}`);
	}

	return { journalPath, helperPath };
}

export function readBeCoderInstallationId(executablePath: string): string | undefined {
	try {
		const markerPath = join(dirname(executablePath), installationMarkerName);
		if (statSync(markerPath).size > maximumMarkerSize) {
			return undefined;
		}
		const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as BeCoderInstallationMarker;
		if (marker.schemaVersion !== 2 || marker.product !== 'BeCoder' || typeof marker.installationId !== 'string' || !installationIdPattern.test(marker.installationId)) {
			return undefined;
		}
		return marker.installationId.toLowerCase();
	} catch {
		return undefined;
	}
}

export function resolveBeCoderAppUserModelId(baseId: string, executablePath: string): string {
	const installationId = readBeCoderInstallationId(executablePath);
	return installationId ? `${baseId}.${installationId}` : baseId;
}
