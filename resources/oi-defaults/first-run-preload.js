const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('becoderSetup', {
	complete: request => ipcRenderer.send('becoder:onboarding-complete', request),
	getScript: () => ipcRenderer.invoke('becoder:onboarding-script'),
	getLocale: () => ipcRenderer.invoke('becoder:onboarding-locale'),
	pickWorkspaceFolder: () => ipcRenderer.invoke('becoder:onboarding-pick-workspace'),
	installToolchain: (sourceId, stage) => ipcRenderer.invoke('becoder:onboarding-install-toolchain', sourceId, stage),
	onProgress: listener => ipcRenderer.on('becoder:onboarding-progress', (_event, message) => listener(message))
});
