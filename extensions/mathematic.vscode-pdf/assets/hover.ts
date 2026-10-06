/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See ../../becoder.shared/LICENSE.
 *--------------------------------------------------------------------------------------------*/

import { installHovers } from '../../becoder.shared/browser/hover';

// The PDF document's annotation popups belong to PDF.js and remain untouched.
installHovers({ nativeTitles: '#toolbarContainer [title], #sidebarContainer [title], #secondaryToolbar [title], #findbar [title], dialog button[title]' });
