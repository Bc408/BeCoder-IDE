/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOSProperties } from '../../native/common/native.js';
import { IProductService } from '../../product/common/productService.js';

export function createNativeAboutDialogDetails(productService: IProductService, _osProps: IOSProperties): { title: string; details: string; detailsToCopy: string } {
	const details = `version: ${productService.version}\n\nThis is how we begin.\nBe coder, initially.\n\nSource: github.com/Bc408/BeCoder-IDE\nRoots in Code-OSS (MIT) & growth under GPL 3.0\nMade by zBc from hevttc with special thanks to Codex`;

	return {
		title: productService.nameLong,
		details,
		detailsToCopy: details
	};
}
