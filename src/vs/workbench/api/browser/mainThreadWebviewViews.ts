/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { MainThreadWebviews, reviveWebviewExtension } from './mainThreadWebviews.js';
import * as extHostProtocol from '../common/extHost.protocol.js';
import { IViewBadge } from '../../common/views.js';
import { IWebviewViewService, WebviewView } from '../../contrib/webviewView/browser/webviewViewService.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { addDisposableListener, EventType, getWindow } from '../../../base/browser/dom.js';
import { extractEditorsDropData } from '../../../platform/dnd/browser/dnd.js';
import { WebviewResourceDrag } from '../../contrib/webview/common/webviewResourceDrag.js';


export class MainThreadWebviewsViews extends Disposable implements extHostProtocol.MainThreadWebviewViewsShape {

	private readonly _proxy: extHostProtocol.ExtHostWebviewViewsShape;

	private readonly _webviewViews = this._register(new DisposableMap<string, WebviewView>());
	private readonly _webviewViewProviders = this._register(new DisposableMap<string>());

	constructor(
		context: IExtHostContext,
		private readonly mainThreadWebviews: MainThreadWebviews,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWebviewViewService private readonly _webviewViewService: IWebviewViewService,
	) {
		super();

		this._proxy = context.getProxy(extHostProtocol.ExtHostContext.ExtHostWebviewViews);
	}

	public $setWebviewViewTitle(handle: extHostProtocol.WebviewHandle, value: string | undefined): void {
		const webviewView = this.getWebviewView(handle);
		webviewView.title = value;
	}

	public $setWebviewViewDescription(handle: extHostProtocol.WebviewHandle, value: string | undefined): void {
		const webviewView = this.getWebviewView(handle);
		webviewView.description = value;
	}

	public $setWebviewViewBadge(handle: string, badge: IViewBadge | undefined): void {
		const webviewView = this.getWebviewView(handle);
		webviewView.badge = badge;
	}

	public $show(handle: extHostProtocol.WebviewHandle, preserveFocus: boolean): void {
		const webviewView = this.getWebviewView(handle);
		webviewView.show(preserveFocus);
	}

	public $registerWebviewViewProvider(
		extensionData: extHostProtocol.WebviewExtensionDescription,
		viewType: string,
		options: { retainContextWhenHidden?: boolean; serializeBuffersForPostMessage: boolean }
	): void {
		if (this._webviewViewProviders.has(viewType)) {
			throw new Error(`View provider for ${viewType} already registered`);
		}

		const extension = reviveWebviewExtension(extensionData);

		const registration = this._webviewViewService.register(viewType, {
			resolve: async (webviewView: WebviewView, cancellation: CancellationToken) => {
				const handle = generateUuid();

				this._webviewViews.set(handle, webviewView);
				this.mainThreadWebviews.addWebview(handle, webviewView.webview, { serializeBuffersForPostMessage: options.serializeBuffersForPostMessage });

				let state = undefined;
				if (webviewView.webview.state) {
					try {
						state = JSON.parse(webviewView.webview.state);
					} catch (e) {
						console.error('Could not load webview state', e, webviewView.webview.state);
					}
				}

				webviewView.webview.extension = extension;

				if (options) {
					webviewView.webview.options = options;
				}

				const subscriptions = new DisposableStore();
				// The iframe cannot claim an internal origin. Native workbench gestures
				// arrive through a separate RPC event, restricted to the bundled view.
				if (extension.id.value === 'becoder.beacon' && viewType === 'becoder.beacon.chat') {
					const container = webviewView.webview.container;
					const targetWindow = getWindow(container);
					const drag = new WebviewResourceDrag();
					const resources = (event: DragEvent) => extractEditorsDropData(event).flatMap(item => item.resource?.scheme === 'file' ? [item.resource] : []);
					subscriptions.add(addDisposableListener(targetWindow, EventType.DRAG_START, (event: DragEvent) => drag.start(event.isTrusted, resources(event).map(uri => uri.toString()))));
					subscriptions.add(addDisposableListener(targetWindow, EventType.DRAG_END, () => drag.end()));
					subscriptions.add(addDisposableListener(container, EventType.DRAG_OVER, (event: DragEvent) => {
						event.preventDefault();
						event.stopPropagation();
						if (event.dataTransfer) { event.dataTransfer.dropEffect = 'copy'; }
					}, true));
					subscriptions.add(addDisposableListener(container, EventType.DROP, (event: DragEvent) => {
						event.preventDefault();
						event.stopImmediatePropagation();
						if (event.isTrusted) {
							const uris = resources(event);
							this.mainThreadWebviews.onDidDropResources(handle, uris, drag.source(true, uris.map(uri => uri.toString())));
						}
						drag.end();
						webviewView.webview.windowDidDragEnd();
					}, true));
				}
				subscriptions.add(webviewView.onDidChangeVisibility(visible => {
					this._proxy.$onDidChangeWebviewViewVisibility(handle, visible);
				}));

				subscriptions.add(webviewView.onDispose(() => {
					this._proxy.$disposeWebviewView(handle);
					this._webviewViews.deleteAndDispose(handle);
					subscriptions.dispose();
				}));

				type CreateWebviewViewTelemetry = {
					extensionId: string;
					id: string;
				};
				type Classification = {
					extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Id of the extension' };
					id: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Id of the view' };
					owner: 'digitarald';
					comment: 'Helps to gain insights on what extension contributed views are most popular';
				};
				this._telemetryService.publicLog2<CreateWebviewViewTelemetry, Classification>('webviews:createWebviewView', {
					extensionId: extension.id.value,
					id: viewType,
				});

				try {
					await this._proxy.$resolveWebviewView(handle, viewType, webviewView.title, state, cancellation);
				} catch (error) {
					onUnexpectedError(error);
					webviewView.webview.setHtml(this.mainThreadWebviews.getWebviewResolvedFailedContent(viewType));
				}
			}
		});

		this._webviewViewProviders.set(viewType, registration);
	}

	public $unregisterWebviewViewProvider(viewType: string): void {
		if (!this._webviewViewProviders.has(viewType)) {
			throw new Error(`No view provider for ${viewType} registered`);
		}

		this._webviewViewProviders.deleteAndDispose(viewType);
	}

	private getWebviewView(handle: string): WebviewView {
		const webviewView = this._webviewViews.get(handle);
		if (!webviewView) {
			throw new Error('unknown webview view');
		}
		return webviewView;
	}
}

