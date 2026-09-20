/*---------------------------------------------------------------------------------------------
 *  Derived from Competitive Companion. Copyright (c) 2017 Jasper van Merle.
 *  Licensed under the MIT License. See companion/LICENSE and UPSTREAM.md.
 *--------------------------------------------------------------------------------------------*/
import { Sendable } from '../models/Sendable';
// BeCoder dispatches only these bundled problem parsers; no contest auto-fetch.
export abstract class Parser {
  abstract getMatchPatterns(): string[];
  abstract parse(url: string, html: string): Promise<Sendable>;
}
