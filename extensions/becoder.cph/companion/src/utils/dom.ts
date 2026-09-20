/*---------------------------------------------------------------------------------------------
 *  Derived from Competitive Companion. Copyright (c) 2017 Jasper van Merle.
 *  Licensed under the MIT License. See companion/LICENSE and UPSTREAM.md.
 *--------------------------------------------------------------------------------------------*/
// Adapted from Competitive Companion, MIT. No Markdown dependency is needed.
export function htmlToElement(html: string): Element {
  return new DOMParser().parseFromString(html, 'text/html').documentElement;
}
export function decodeHtml(html: string): string {
  return html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
