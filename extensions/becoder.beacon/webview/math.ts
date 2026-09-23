/* Copyright (c) BeCoder contributors. Licensed under MIT. */

/** Normalize TeX delimiters before Markdown consumes their escapes. Code stays verbatim. */
export function normalizeMath(source: string): string {
	let result = '';
	let index = 0;
	let fence: string | undefined;
	while (index < source.length) {
		if (index === 0 || source[index - 1] === '\n') {
			const line = source.slice(index).match(/^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/);
			if (line) {
				if (!fence) { fence = line[1]; }
				else if (line[1][0] === fence[0] && line[1].length >= fence.length && /^ {0,3}(?:`+|~+)\s*$/.test(line[0])) { fence = undefined; }
				result += line[0]; index += line[0].length; continue;
			}
			if (/^( {4}|\t)/.test(source.slice(index))) {
				const end = source.indexOf('\n', index);
				const next = end < 0 ? source.length : end + 1;
				result += source.slice(index, next); index = next; continue;
			}
		}
		if (fence) { result += source[index++]; continue; }
		if (source[index] === '`') {
			const run = source.slice(index).match(/^`+/)![0];
			let end = source.indexOf(run, index + run.length);
			while (end >= 0 && (source[end - 1] === '`' || source[end + run.length] === '`')) { end = source.indexOf(run, end + run.length); }
			const next = end < 0 ? source.length : end + run.length;
			result += source.slice(index, next); index = next; continue;
		}
		if (source[index] === '\\' && source[index + 1] === '\\') { result += '\\\\'; index += 2; continue; }
		if (source[index] === '\\' && (source[index + 1] === '(' || source[index + 1] === '[')) {
			const block = source[index + 1] === '[';
			const closing = block ? '\\]' : '\\)';
			const end = source.indexOf(closing, index + 2);
			if (end >= 0) {
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
