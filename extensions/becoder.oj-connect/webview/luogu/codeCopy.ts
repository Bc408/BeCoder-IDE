/*---------------------------------------------------------------------------------------------
*  Copyright (c) 2018 引领天下. MIT License.
*  Adapted from yltx/vscode-luogu v4.20.0 (987ca974b5419230a07b59a195ec44026e16f6f4).
*  BeCoder changes: shared OJ integration and localization. See ThirdPartyNotices.txt.
*--------------------------------------------------------------------------------------------*/

// Overlapping sheets: a filled front page and an outlined back page.
export const copyIconPath = 'M8 1h5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2ZM4 5H3a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2h-1.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V7a.5.5 0 0 1 .5-.5h1V5Z';

/** Add native copy controls after React inserts the rendered HTML. */
export function installCodeCopyButtons(article: HTMLElement, labels: Record<string, string>) {
	let disposed = false;
	const cleanups: Array<() => void> = [];
	article.querySelectorAll('pre').forEach(pre => {
		const code = pre.querySelector('code');
		if (!code) { return; }

		pre.classList.add('markdown-code');
		const controls = document.createElement('div');
		controls.className = 'copyButton';
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'vscode-button vscode-button-icon';
		button.setAttribute('aria-label', labels.copy);
		button.title = labels.copy;
		const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		icon.setAttribute('viewBox', '0 0 16 16');
		icon.setAttribute('aria-hidden', 'true');
		icon.setAttribute('fill', 'currentColor');
		const path = document.createElementNS(icon.namespaceURI, 'path');
		path.setAttribute('d', copyIconPath);
		icon.append(path);
		button.append(icon);
		controls.append(button);
		const error = document.createElement('span');
		error.setAttribute('role', 'alert');
		error.className = 'markdown-copy-error';

		const reset = () => {
			delete button.dataset.copied;
			button.setAttribute('aria-label', labels.copy);
			button.title = labels.copy;
		};
		const copy = async () => {
			try {
				await navigator.clipboard.writeText(code.textContent ?? '');
				if (disposed) { return; }
				error.remove();
				button.dataset.copied = 'true';
				button.setAttribute('aria-label', labels.copied);
				button.title = labels.copied;
			} catch {
				if (disposed) { return; }
				error.textContent = labels.copyFailed;
				controls.append(error);
			}
		};
		button.addEventListener('click', copy);
		button.addEventListener('animationend', reset);
		pre.append(controls);
		cleanups.push(() => {
			button.removeEventListener('click', copy);
			button.removeEventListener('animationend', reset);
			controls.remove();
		});
	});
	return () => {
		disposed = true;
		cleanups.forEach(cleanup => cleanup());
	};
}
