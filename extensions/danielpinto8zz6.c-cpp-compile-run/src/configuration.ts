import { workspace } from 'vscode';

export class Configuration {
	static cleanupExecutable(): boolean {
		return workspace.getConfiguration('becoder.runner').get<boolean>('cleanupExecutable', true);
	}
}
