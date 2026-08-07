/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const invisibleOnly = /^[\p{Mark}\p{Default_Ignorable_Code_Point}]+$/u;
const invisibleCharacter = /^[\p{Mark}\p{Default_Ignorable_Code_Point}]$/u;
const emoji = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const keycap = /^[#*0-9]\ufe0f?\u20e3$/u;

export function terminalCellWidth(value: string): number {
	let width = 0;
	for (const { segment } of graphemeSegmenter.segment(value)) {
		if (invisibleOnly.test(segment)) {
			continue;
		}
		if (emoji.test(segment) || keycap.test(segment)) {
			width += 2;
			continue;
		}
		const codePoint = firstVisibleCodePoint(segment);
		if (codePoint === undefined || codePoint < 0x20 || (codePoint >= 0x7F && codePoint <= 0x9F)) {
			continue;
		}
		width += isFullWidthCodePoint(codePoint) ? 2 : 1;
	}
	return width;
}

export function previousGraphemeStart(value: string, cursor: number): number {
	let previous = 0;
	for (const { index, segment } of graphemeSegmenter.segment(value)) {
		if (index >= cursor) {
			break;
		}
		previous = index;
		if (index + segment.length >= cursor) {
			break;
		}
	}
	return previous;
}

export function nextGraphemeEnd(value: string, cursor: number): number {
	for (const { index, segment } of graphemeSegmenter.segment(value)) {
		if (index + segment.length > cursor) {
			return index + segment.length;
		}
	}
	return value.length;
}

function firstVisibleCodePoint(value: string): number | undefined {
	for (const character of value) {
		if (!invisibleCharacter.test(character)) {
			return character.codePointAt(0);
		}
	}
	return undefined;
}

function isFullWidthCodePoint(codePoint: number): boolean {
	return codePoint >= 0x1100 && (
		codePoint <= 0x115F
		|| codePoint === 0x2329
		|| codePoint === 0x232A
		|| (codePoint >= 0x2E80 && codePoint <= 0x3247 && codePoint !== 0x303F)
		|| (codePoint >= 0x3250 && codePoint <= 0x4DBF)
		|| (codePoint >= 0x4E00 && codePoint <= 0xA4C6)
		|| (codePoint >= 0xA960 && codePoint <= 0xA97C)
		|| (codePoint >= 0xAC00 && codePoint <= 0xD7A3)
		|| (codePoint >= 0xF900 && codePoint <= 0xFAFF)
		|| (codePoint >= 0xFE10 && codePoint <= 0xFE19)
		|| (codePoint >= 0xFE30 && codePoint <= 0xFE6B)
		|| (codePoint >= 0xFF01 && codePoint <= 0xFF60)
		|| (codePoint >= 0xFFE0 && codePoint <= 0xFFE6)
		|| (codePoint >= 0x1B000 && codePoint <= 0x1B001)
		|| (codePoint >= 0x1F200 && codePoint <= 0x1F251)
		|| (codePoint >= 0x20000 && codePoint <= 0x3FFFD)
	);
}
