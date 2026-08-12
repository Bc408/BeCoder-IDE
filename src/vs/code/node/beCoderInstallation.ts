/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { dirname, join } from '../../base/common/path.js';

const installationMarkerName = '.becoder-installation.json';
const onboardingMarkerName = '.becoder-open-hello-coder';
const onboardingMarkerContents = 'BeCoder onboarding v1\n';
const onboardingFolderName = 'coding';
const onboardingFileName = 'helloCoder.cpp';
const onboardingFileSha256 = '0d47c180bbb64866f3a805b958306c268597c64f21d10458dc919740714cf1d9';
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

export type BeCoderOnboarding = {
	readonly folderPath: string;
	readonly filePath: string;
	readonly markerPath: string;
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

export function resolveBeCoderOnboarding(executablePath: string): BeCoderOnboarding | undefined {
	if (!readBeCoderInstallationId(executablePath)) {
		return undefined;
	}

	try {
		const installationRoot = dirname(executablePath);
		const folderPath = join(installationRoot, onboardingFolderName);
		const filePath = join(folderPath, onboardingFileName);
		const markerPath = join(installationRoot, 'data', onboardingMarkerName);
		const folderStat = lstatSync(folderPath);
		const fileStat = lstatSync(filePath);
		const markerStat = lstatSync(markerPath);
		if (!folderStat.isDirectory() || folderStat.isSymbolicLink() || !fileStat.isFile() || fileStat.isSymbolicLink() || !markerStat.isFile() || markerStat.isSymbolicLink()) {
			return undefined;
		}

		const entries = readdirSync(folderPath);
		if (entries.length !== 1 || entries[0] !== onboardingFileName) {
			return undefined;
		}

		const contents = readFileSync(filePath);
		if (createHash('sha256').update(contents).digest('hex') !== onboardingFileSha256 || readFileSync(markerPath, 'utf8') !== onboardingMarkerContents) {
			return undefined;
		}

		return { folderPath, filePath, markerPath };
	} catch {
		return undefined;
	}
}

export function consumeBeCoderOnboarding(onboarding: BeCoderOnboarding): boolean {
	try {
		const markerStat = lstatSync(onboarding.markerPath);
		if (!markerStat.isFile() || markerStat.isSymbolicLink() || readFileSync(onboarding.markerPath, 'utf8') !== onboardingMarkerContents) {
			return false;
		}

		unlinkSync(onboarding.markerPath);
		return true;
	} catch {
		return false;
	}
}
