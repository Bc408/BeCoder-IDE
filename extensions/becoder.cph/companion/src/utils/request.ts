/*---------------------------------------------------------------------------------------------
 *  Derived from Competitive Companion. Copyright (c) 2017 Jasper van Merle.
 *  Licensed under the MIT License. See companion/LICENSE and UPSTREAM.md.
 *--------------------------------------------------------------------------------------------*/
// Additional-resource parsing has not been enabled in the DOM-only checkpoint.
// In particular, never run privileged fetch or localhost POST from the OJ page.
export async function request(_url: string): Promise<string> {
  throw new Error('This problem requires an additional resource parser.');
}
