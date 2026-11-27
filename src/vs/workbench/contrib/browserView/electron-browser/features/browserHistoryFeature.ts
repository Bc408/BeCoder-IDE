/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { BrowserHistoryStore, IBrowserHistoryEntry } from '../../../../../platform/browserView/common/browserHistory.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserMaxHistoryEntriesSettingId } from '../browserViewWorkbenchService.js';
import {
	BrowserEditor,
	BrowserEditorContribution,
	IBrowserUrlSuggestion,
	IBrowserUrlSuggestionAction,
	IBrowserUrlSuggestionProvider,
} from '../browserEditor.js';

const MAX_RECENTS = 3;
const MAX_HISTORY = 6;

/**
 * Surfaces history from the active model's {@link BrowserHistoryStore} as
 * URL bar suggestions (deduped by host+path).
 */
export class BrowserHistoryFeature extends BrowserEditorContribution {

	private readonly _modelDisposables = this._register(new DisposableStore());
	private readonly _onDidChange = this._register(new Emitter<void>());

	private _model: IBrowserViewModel | undefined;
	private _history: BrowserHistoryStore | undefined;

	private readonly _recentsProvider: IBrowserUrlSuggestionProvider = {
		label: localize('browser.recents', "Recents"),
		order: 5,
		onDidChange: this._onDidChange.event,
		getSuggestions: async ({ input, text }) => this._buildRecents(input.url, text),
	};

	private readonly _historyProvider: IBrowserUrlSuggestionProvider = {
		label: localize('browser.history', "History"),
		order: 10,
		onDidChange: this._onDidChange.event,
		getSuggestions: async ({ input, text }) => this._buildHistory(input.url, text),
	};

	override get urlSuggestionProviders(): readonly IBrowserUrlSuggestionProvider[] {
		return [this._recentsProvider, this._historyProvider];
	}

	protected override onModelAttached(): void {
		this._modelDisposables.clear();
		this._model = this.editor.model!;
		this._history = this._model.history;
		this._modelDisposables.add(this._history.onDidChange(() => this._onDidChange.fire()));
		this._onDidChange.fire();
	}

	override onModelDetached(): void {
		this._modelDisposables.clear();
		this._model = undefined;
		this._history = undefined;
		this._onDidChange.fire();
	}

	private _buildRecents(currentUrl: string | undefined, text: string): IBrowserUrlSuggestion[] {
		if (text.trim().length > 0) {
			return [];
		}
		return this._buildList(currentUrl, '', /* onlyUserInitiated */ true, MAX_RECENTS);
	}

	private _buildHistory(currentUrl: string | undefined, text: string): IBrowserUrlSuggestion[] {
		const needle = text.trim().toLowerCase();
		if (needle.length === 0) {
			return [];
		}
		return this._buildList(currentUrl, needle, /* onlyUserInitiated */ false, MAX_HISTORY);
	}

	private _buildList(currentUrl: string | undefined, needle: string, onlyUserInitiated: boolean, max: number): IBrowserUrlSuggestion[] {
		const history = this._history;
		const model = this._model;
		if (!history || !model) {
			return [];
		}
		const entries = history.entries.items;
		if (entries.length === 0) {
			return [];
		}

		const seen = new Set<string>();
		if (currentUrl) {
			seen.add(dedupKey(currentUrl));
		}

		// Walk newest-first; the persisted list is append-ordered. Dedup by
		// host+path so e.g. ?foo=1 and ?foo=2 collapse into a single entry
		// (newest wins because we walk in reverse).
		const out: IBrowserUrlSuggestion[] = [];
		for (let i = entries.length - 1; i >= 0 && out.length < max; i--) {
			const entry = entries[i];
			if (onlyUserInitiated && !entry.explicit) {
				continue;
			}
			const key = dedupKey(entry.url);
			if (seen.has(key)) {
				continue;
			}
			if (needle && !matches(entry, needle)) {
				continue;
			}
			seen.add(key);
			out.push(toSuggestion(model, history, entry));
		}
		return out;
	}
}

BrowserEditor.registerContribution(BrowserHistoryFeature);

// -- Suggestion helpers ----------------------------------------------

function toSuggestion(model: IBrowserViewModel, history: BrowserHistoryStore, entry: IBrowserHistoryEntry): IBrowserUrlSuggestion {
	const label = entry.title || entry.url;
	const description = entry.title ? entry.url : undefined;
	const faviconUri = entry.icon ? resolveFavicon(history, entry.icon) : undefined;
	const deleteAction: IBrowserUrlSuggestionAction = {
		id: 'browser.history.delete',
		iconClass: ThemeIcon.asClassName(Codicon.close),
		tooltip: localize('browser.removeFromHistory', "Remove from History"),
		run: () => model.deleteHistory([entry.id]),
	};
	return {
		id: 'history:' + entry.id,
		label,
		description,
		icon: faviconUri ? undefined : Codicon.globe,
		iconPath: faviconUri ? { dark: faviconUri } : undefined,
		apply: input => input.navigate(entry.url),
		actions: [deleteAction],
	};
}

function dedupKey(url: string): string {
	const parsed = URL.parse(url);
	if (!parsed) {
		return url;
	}
	return parsed.host + parsed.pathname;
}

function matches(entry: IBrowserHistoryEntry, needle: string): boolean {
	return entry.url.toLowerCase().includes(needle)
		|| entry.title.toLowerCase().includes(needle);
}

function resolveFavicon(history: BrowserHistoryStore, hash: string): URI | undefined {
	const dataUri = history.favicons.get(hash);
	if (!dataUri) {
		return undefined;
	}
	try {
		return URI.parse(dataUri);
	} catch {
		return undefined;
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[BrowserMaxHistoryEntriesSettingId]: {
			type: 'integer',
			default: 200,
			minimum: 0,
			maximum: 10000,
			scope: ConfigurationScope.APPLICATION,
			description: localize('browser.maxHistoryEntries', "Maximum number of history items kept per session scope. Older entries are evicted first."),
			order: 110
		}
	}
});
