/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';

export interface BytePoint {
	readonly filePath: string;
	readonly line: number;
	readonly byteColumn: number;
}

export interface ByteRange {
	readonly start: BytePoint;
	readonly end: BytePoint;
}

export interface RelatedDiagnostic {
	readonly message: string;
	readonly range: ByteRange;
}

export interface ParsedGccError {
	readonly message: string;
	readonly range: ByteRange;
	readonly related: readonly RelatedDiagnostic[];
}

interface RawPoint {
	readonly file?: unknown;
	readonly line?: unknown;
	readonly column?: unknown;
	readonly 'byte-column'?: unknown;
}

interface RawLocation {
	readonly caret?: unknown;
	readonly start?: unknown;
	readonly finish?: unknown;
}

interface RawDiagnostic {
	readonly kind?: unknown;
	readonly message?: unknown;
	readonly locations?: unknown;
	readonly children?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function normalizeForComparison(filePath: string): string {
	return path.resolve(filePath).replace(/\\/g, '/').toLowerCase();
}

function mapReportedPath(filePath: string, mirrorPath: string, sourcePath: string): string {
	const resolved = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(path.dirname(sourcePath), filePath);
	return normalizeForComparison(resolved) === normalizeForComparison(mirrorPath) ? sourcePath : resolved;
}

function parsePoint(value: unknown, mirrorPath: string, sourcePath: string): BytePoint | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const raw = value as RawPoint;
	const line = positiveInteger(raw.line);
	const byteColumn = positiveInteger(raw['byte-column']) ?? positiveInteger(raw.column);
	if (typeof raw.file !== 'string' || !line || !byteColumn) {
		return undefined;
	}
	return {
		filePath: mapReportedPath(raw.file, mirrorPath, sourcePath),
		line,
		byteColumn
	};
}

function parseLocation(value: unknown, mirrorPath: string, sourcePath: string): ByteRange | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const raw = value as RawLocation;
	const caret = parsePoint(raw.caret, mirrorPath, sourcePath);
	const start = parsePoint(raw.start, mirrorPath, sourcePath) ?? caret;
	let end = parsePoint(raw.finish, mirrorPath, sourcePath) ?? caret;
	if (!start || !end) {
		return undefined;
	}
	if (normalizeForComparison(start.filePath) !== normalizeForComparison(end.filePath)
		|| end.line < start.line
		|| (end.line === start.line && end.byteColumn < start.byteColumn)) {
		end = start;
	}
	return { start, end };
}

function locations(value: unknown, mirrorPath: string, sourcePath: string): ByteRange[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.map(location => parseLocation(location, mirrorPath, sourcePath))
		.filter((location): location is ByteRange => Boolean(location));
}

function relatedInformation(raw: RawDiagnostic, mirrorPath: string, sourcePath: string): RelatedDiagnostic[] {
	const related: RelatedDiagnostic[] = [];
	for (const range of locations(raw.locations, mirrorPath, sourcePath).slice(1)) {
		related.push({ message: typeof raw.message === 'string' ? raw.message : 'Additional GCC location', range });
	}
	if (!Array.isArray(raw.children)) {
		return related;
	}
	for (const child of raw.children) {
		if (!isRecord(child)) {
			continue;
		}
		const childDiagnostic = child as RawDiagnostic;
		if (childDiagnostic.kind !== 'note' || typeof childDiagnostic.message !== 'string') {
			continue;
		}
		const range = locations(childDiagnostic.locations, mirrorPath, sourcePath)[0];
		if (range) {
			related.push({ message: childDiagnostic.message, range });
		}
	}
	return related;
}

export function parseGccDiagnostics(output: string, mirrorPath: string, sourcePath: string): ParsedGccError[] {
	const trimmed = output.trim();
	if (!trimmed) {
		throw new Error('GCC produced no structured diagnostic output.');
	}
	let decoded: unknown;
	try {
		decoded = JSON.parse(trimmed);
	} catch (error) {
		throw new Error(`GCC diagnostic JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!Array.isArray(decoded)) {
		throw new Error('GCC diagnostic JSON must be a top-level array.');
	}

	const errors: ParsedGccError[] = [];
	const seen = new Set<string>();
	for (const entry of decoded) {
		if (!isRecord(entry)) {
			continue;
		}
		const raw = entry as RawDiagnostic;
		if ((raw.kind !== 'error' && raw.kind !== 'fatal error') || typeof raw.message !== 'string') {
			continue;
		}
		const range = locations(raw.locations, mirrorPath, sourcePath)[0];
		if (!range) {
			continue;
		}
		const key = [range.start.filePath, range.start.line, range.start.byteColumn,
		range.end.line, range.end.byteColumn, raw.message].join('\0');
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		errors.push({
			message: raw.message,
			range,
			related: relatedInformation(raw, mirrorPath, sourcePath)
		});
	}
	return errors;
}

export interface Utf16Range {
	readonly startLine: number;
	readonly startCharacter: number;
	readonly endLine: number;
	readonly endCharacter: number;
}

function lineText(text: string, oneBasedLine: number): string {
	return text.split(/\r?\n/)[Math.max(0, oneBasedLine - 1)] ?? '';
}

function utf16ColumnFromByteColumn(line: string, oneBasedByteColumn: number): number {
	const byteOffset = Math.max(0, oneBasedByteColumn - 1);
	let consumedBytes = 0;
	let utf16Column = 0;
	for (const character of line) {
		const characterBytes = Buffer.byteLength(character, 'utf8');
		if (consumedBytes + characterBytes > byteOffset) {
			break;
		}
		consumedBytes += characterBytes;
		utf16Column += character.length;
	}
	return utf16Column;
}

function inclusiveEndCharacter(line: string, oneBasedByteColumn: number): number {
	const start = utf16ColumnFromByteColumn(line, oneBasedByteColumn);
	if (start >= line.length) {
		return start;
	}
	const codePoint = line.codePointAt(start);
	return start + (codePoint !== undefined && codePoint > 0xFFFF ? 2 : 1);
}

export function byteRangeToUtf16(text: string, range: ByteRange): Utf16Range {
	const startLineText = lineText(text, range.start.line);
	const endLineText = lineText(text, range.end.line);
	return {
		startLine: Math.max(0, range.start.line - 1),
		startCharacter: utf16ColumnFromByteColumn(startLineText, range.start.byteColumn),
		endLine: Math.max(0, range.end.line - 1),
		endCharacter: inclusiveEndCharacter(endLineText, range.end.byteColumn)
	};
}
