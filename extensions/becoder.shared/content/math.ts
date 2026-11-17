/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the MIT License. See LICENSE in the component root for license information.
 *--------------------------------------------------------------------------------------------*/

function isEscaped(source: string, index: number): boolean {
	let slashes = 0;
	for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor--) { slashes++; }
	return slashes % 2 === 1;
}

function findUnescaped(source: string, search: string, from: number): number {
	let index = source.indexOf(search, from);
	while (index >= 0 && isEscaped(source, index)) { index = source.indexOf(search, index + search.length); }
	return index;
}

function normalizeMultilineMath(source: string, index: number, isCodeFree: (start: number, end?: number) => boolean): { text: string; next: number } | undefined {
	const end = findUnescaped(source, '$$', index + 2);
	if (end < 0 || !isCodeFree(index, end + 2)) { return undefined; }
	const expression = source.slice(index + 2, end);
	const lineBreak = expression.match(/\r\n|\n|\r/)?.[0];
	if (!lineBreak) { return undefined; }
	const lineStart = Math.max(source.lastIndexOf('\n', index), source.lastIndexOf('\r', index)) + 1;
	let lineEnd = end + 2;
	while (lineEnd < source.length && source[lineEnd] !== '\n' && source[lineEnd] !== '\r') { lineEnd++; }
	if (source.slice(lineStart, index).trim() || source.slice(end + 2, lineEnd).trim()) { return undefined; }
	const normalized = expression.replace(/^[\t ]*(?:\r\n|\n|\r)/, '').replace(/(?:\r\n|\n|\r)[\t ]*$/, '');
	return { text: `$$${lineBreak}${normalized}${lineBreak}$$`, next: end + 2 };
}

/** Normalize TeX delimiters before Markdown consumes their escapes. Code stays verbatim. */
function closeOpenMath(source: string, isCodeFree: (start: number, end?: number) => boolean): string {
	let opening: { marker: string; index: number } | undefined;
	let index = 0;
	while (index < source.length) {
		if ((source[index] === '$' || source[index] === '\\') && !isCodeFree(index)) { index++; continue; }
		if (source[index] === '\\' && !isEscaped(source, index)) {
			const marker = source.slice(index, index + 2);
			if (['\\[', '\\(', '\\]', '\\)'].includes(marker)) {
				if (marker === '\\]' || marker === '\\)') {
					if (opening?.marker === (marker === '\\]' ? '\\[' : '\\(')) { opening = undefined; }
				} else if (!opening) { opening = { marker, index }; }
				index += 2;
				continue;
			}
		}
		if (source[index] === '$' && !isEscaped(source, index)) {
			const marker = source.startsWith('$$', index) ? '$$' : '$';
			if (opening?.marker === marker) { opening = undefined; }
			else if (!opening) { opening = { marker, index }; }
			index += marker.length;
			continue;
		}
		index++;
	}
	if (!opening || !source.slice(opening.index + opening.marker.length).trim() || !isCodeFree(opening.index, source.length)) { return source; }
	switch (opening.marker) {
		case '$$': return `${source}${source.endsWith('\n') || source.endsWith('\r') ? '' : '\n'}$$`;
		case '$': return `${source}$`;
		case '\\[': return `${source}\\]`;
		case '\\(': return `${source}\\)`;
		default: return source;
	}
}

export function normalizeMath(source: string, streaming: boolean, isCodeFree: (start: number, end?: number) => boolean): string {
	if (!source.includes('$') && !source.includes('\\(') && !source.includes('\\[')) { return source; }
	source = streaming ? closeOpenMath(source, isCodeFree) : source;
	let result = '';
	let index = 0;
	while (index < source.length) {
		if ((source[index] === '$' || source[index] === '\\') && !isCodeFree(index)) { result += source[index++]; continue; }
		if (source.startsWith('$$', index) && !isEscaped(source, index)) {
			const normalized = normalizeMultilineMath(source, index, isCodeFree);
			if (normalized) { result += normalized.text; index = normalized.next; continue; }
		}
		if (source[index] === '\\' && source[index + 1] === '\\') { result += '\\\\'; index += 2; continue; }
		if (source[index] === '\\' && (source[index + 1] === '(' || source[index + 1] === '[')) {
			const block = source[index + 1] === '[';
			const closing = block ? '\\]' : '\\)';
			const end = source.indexOf(closing, index + 2);
			if (end >= 0 && isCodeFree(index, end + 2)) {
				const content = source.slice(index + 2, end);
				result += block ? `\n\n$$\n${content.trim()}\n$$\n\n` : `$${content}$`;
				index = end + 2; continue;
			}
			// Preserve an unfinished delimiter visibly while a response is streaming.
			result += '\\\\' + source[index + 1]; index += 2; continue;
		}
		result += source[index++];
	}
	return result;
}
