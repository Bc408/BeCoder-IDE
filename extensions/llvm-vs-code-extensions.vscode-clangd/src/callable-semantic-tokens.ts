/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface SemanticTokenLegend {
  readonly tokenTypes: readonly string[];
  readonly tokenModifiers: readonly string[];
}

function modifierMask(legend: SemanticTokenLegend, modifier: string): number {
  const index = legend.tokenModifiers.indexOf(modifier);
  return index >= 0 ? 2 ** index : 0;
}

function skipTrivia(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    if (/\s/.test(text[index])) {
      index++;
      continue;
    }
    if (text.startsWith('//', index)) {
      const lineEnd = text.indexOf('\n', index + 2);
      return lineEnd < 0 ? text.length : skipTrivia(text, lineEnd + 1);
    }
    if (text.startsWith('/*', index)) {
      const commentEnd = text.indexOf('*/', index + 2);
      return commentEnd < 0 ? text.length : skipTrivia(text, commentEnd + 2);
    }
    break;
  }
  return index;
}

function hasLambdaInitializer(text: string, tokenEnd: number): boolean {
  let index = skipTrivia(text, tokenEnd);
  if (text[index] !== '=') {
    return false;
  }
  index = skipTrivia(text, index + 1);
  return text[index] === '[';
}

function hasFunctionType(text: string, tokenStart: number): boolean {
  const statementStart = Math.max(
      text.lastIndexOf(';', tokenStart - 1),
      text.lastIndexOf('{', tokenStart - 1),
      text.lastIndexOf('}', tokenStart - 1)) + 1;
  const prefix = text.slice(statementStart, tokenStart);
  return /(?:^|[^\w])(?:std\s*::\s*)?function\s*<[\s\S]*>\s*(?:[&*]\s*)*$/.test(
      prefix);
}

function invocationStart(text: string, tokenEnd: number): number | undefined {
  const index = skipTrivia(text, tokenEnd);
  return text[index] === '(' ? index : undefined;
}

function isUnqualified(text: string, tokenStart: number): boolean {
  const prefix = text.slice(0, tokenStart);
  return !/(?:\.|->|::)\s*$/.test(prefix);
}

function lineOffsets(text: string): number[] {
  const result = [0];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\n') {
      result.push(index + 1);
    }
  }
  return result;
}

function findInvocationEnd(text: string, openIndex: number): number | undefined {
  let depth = 0;
  let quote: '"' | "'" | undefined;
  for (let index = openIndex; index < text.length; index++) {
    const character = text[index];
    if (quote) {
      if (character === '\\') {
        index++;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (text.startsWith('//', index)) {
      const lineEnd = text.indexOf('\n', index + 2);
      index = lineEnd < 0 ? text.length : lineEnd;
      continue;
    }
    if (text.startsWith('/*', index)) {
      const commentEnd = text.indexOf('*/', index + 2);
      index = commentEnd < 0 ? text.length : commentEnd + 1;
      continue;
    }
    if (character === '(') {
      depth++;
    } else if (character === ')' && --depth === 0) {
      return index;
    }
  }
  return undefined;
}

export function reclassifyCallableVariables(
    text: string, tokens: Uint32Array,
    legend: SemanticTokenLegend): Uint32Array {
  const variableTypes = new Set<number>();
  legend.tokenTypes.forEach((type, index) => {
    if (type === 'variable') {
      variableTypes.add(index);
    }
  });
  const functionType = legend.tokenTypes.indexOf('function');
  const parameterType = legend.tokenTypes.indexOf('parameter');
  if (variableTypes.size === 0 || functionType < 0) {
    return tokens;
  }

  const declarationMask =
      modifierMask(legend, 'declaration') | modifierMask(legend, 'definition');
  const offsets = lineOffsets(text);
  let line = 0;
  let character = 0;
  const callableNames = new Set<string>();
  const callableDeclarations = new Set<number>();
  const callableInvocationRanges: Array<{
    readonly name: string;
    readonly start: number;
    readonly end: number;
  }> = [];
  const result = tokens.slice();

  for (let index = 0; index + 4 < result.length; index += 5) {
    const deltaLine = result[index];
    line += deltaLine;
    character = deltaLine === 0 ? character + result[index + 1] :
                                 result[index + 1];
    if (!variableTypes.has(result[index + 3]) || line >= offsets.length) {
      continue;
    }

    const tokenStart = offsets[line] + character;
    const tokenEnd = tokenStart + result[index + 2];
    const isDeclaration =
        declarationMask !== 0 && (result[index + 4] & declarationMask) !== 0;
    if (isDeclaration &&
        (hasLambdaInitializer(text, tokenEnd) ||
         hasFunctionType(text, tokenStart))) {
      callableDeclarations.add(index);
      callableNames.add(text.slice(tokenStart, tokenEnd));
    }
  }

  line = 0;
  character = 0;
  let changed = false;
  for (let index = 0; index + 4 < result.length; index += 5) {
    const deltaLine = result[index];
    line += deltaLine;
    character = deltaLine === 0 ? character + result[index + 1] :
                                 result[index + 1];
    if (!variableTypes.has(result[index + 3]) || line >= offsets.length) {
      continue;
    }

    const tokenStart = offsets[line] + character;
    const tokenEnd = tokenStart + result[index + 2];
    const tokenText = text.slice(tokenStart, tokenEnd);
    const openIndex = invocationStart(text, tokenEnd);
    if (callableDeclarations.has(index) ||
        (callableNames.has(tokenText) && openIndex !== undefined &&
         isUnqualified(text, tokenStart))) {
      result[index + 3] = functionType;
      changed = true;
      if (!callableDeclarations.has(index) && openIndex !== undefined) {
        const closeIndex = findInvocationEnd(text, openIndex);
        if (closeIndex !== undefined) {
          callableInvocationRanges.push({
            name: tokenText,
            start: openIndex + 1,
            end: closeIndex
          });
        }
      }
    }
  }

  if (callableInvocationRanges.length > 0) {
    line = 0;
    character = 0;
    for (let index = 0; index + 4 < result.length; index += 5) {
      const deltaLine = result[index];
      line += deltaLine;
      character = deltaLine === 0 ? character + result[index + 1] :
                                   result[index + 1];
      if (!variableTypes.has(result[index + 3]) &&
          result[index + 3] !== parameterType || line >= offsets.length) {
        continue;
      }

      const tokenStart = offsets[line] + character;
      const tokenEnd = tokenStart + result[index + 2];
      const tokenText = text.slice(tokenStart, tokenEnd);
      if (callableInvocationRanges.some(range =>
          tokenStart >= range.start && tokenEnd <= range.end &&
          tokenText === range.name && isUnqualified(text, tokenStart))) {
        result[index + 3] = functionType;
        changed = true;
      }
    }
  }

  return changed ? result : tokens;
}
