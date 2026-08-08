/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-globals */
/* eslint-disable no-restricted-syntax */

/**
 * Preload script for pages loaded in Integrated Browser.
 *
 * It forwards workbench keybindings while leaving native editing shortcuts to
 * the page, and exposes selected text inside Electron's isolated world for the
 * browser find widget. It does not expose helpers to the page's main world.
 */
function init() {
	const { contextBridge, ipcRenderer } = require('electron');

	const nativeCtrlCmdKeybindings = {
		mac: {
			always: new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'backspace', 'delete']),
			noShift: new Set(['a', 'c', 'v', 'x', 'z']),
			withShift: new Set(['v', 'z']),
		},
		nonMac: {
			always: new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'home', 'end', 'backspace', 'delete']),
			noShift: new Set(['a', 'c', 'v', 'x', 'z', 'y']),
			withShift: new Set(['v', 'z']),
		}
	};

	window.addEventListener('keydown', event => {
		if (!(event instanceof KeyboardEvent) || !event.isTrusted || event.defaultPrevented) {
			return;
		}

		const isNonEditingKey =
			event.key === 'Escape' ||
			/^F\d+$/.test(event.key) ||
			event.key.startsWith('Audio') ||
			event.key.startsWith('Media') ||
			event.key.startsWith('Browser');

		if (!(event.ctrlKey || event.altKey || event.metaKey) && !isNonEditingKey) {
			return;
		}

		if (event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') {
			return;
		}

		const isMac = navigator.platform.indexOf('Mac') >= 0;
		if (event.altKey && !event.ctrlKey && !event.metaKey) {
			if (isMac || /^Numpad\d+$/.test(event.code)) {
				return;
			}
		}

		if (event.key === 'F10' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
			return;
		}

		const ctrlCmd = isMac ? event.metaKey : event.ctrlKey;
		if (ctrlCmd && !event.altKey) {
			const key = event.key.toLowerCase();
			const keySetsToCheck = [
				nativeCtrlCmdKeybindings[isMac ? 'mac' : 'nonMac'].always,
				nativeCtrlCmdKeybindings[isMac ? 'mac' : 'nonMac'][event.shiftKey ? 'withShift' : 'noShift'],
			];
			if (keySetsToCheck.some(set => set.has(key))) {
				return;
			}

			if (isMac && event.ctrlKey && !event.shiftKey && key === ' ') {
				return;
			}
		}

		event.preventDefault();
		event.stopPropagation();
		ipcRenderer.send('vscode:browserView:keydown', {
			key: event.key,
			keyCode: event.keyCode,
			code: event.code,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			metaKey: event.metaKey,
			repeat: event.repeat
		});
	});

	const isolatedHelpers = {
		getSelectedText(): string {
			try {
				return window.getSelection()?.toString() ?? '';
			} catch {
				return '';
			}
		}
	};

	try {
		contextBridge.exposeInIsolatedWorld(999, 'browserViewAPI', isolatedHelpers);
	} catch (error) {
		console.error(error);
	}
}

init();
