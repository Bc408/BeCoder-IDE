/*---------------------------------------------------------------------------------------------
 *  Derived from Competitive Companion. Copyright (c) 2017 Jasper van Merle.
 *  Licensed under the MIT License. See companion/LICENSE and UPSTREAM.md.
 *--------------------------------------------------------------------------------------------*/
// BeCoder adaptation: parsers return data only; no extension messaging or send().
export interface Sendable {
  readonly name: string;
  readonly url: string;
}
