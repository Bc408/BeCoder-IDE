/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See companion/LICENSE and UPSTREAM.md.
 *--------------------------------------------------------------------------------------------*/
import { CodeforcesProblemParser } from './src/parsers/problem/CodeforcesProblemParser';
import { AtCoderProblemParser } from './src/parsers/problem/AtCoderProblemParser';
import { LuoguProblemParser } from './src/parsers/problem/LuoguProblemParser';
import { LanqiaoProblemParser } from './src/parsers/problem/LanqiaoProblemParser';
import { NowCoderProblemParser } from './src/parsers/problem/NowCoderProblemParser';
import { SPOJProblemParser } from './src/parsers/problem/SPOJProblemParser';
import { CSESProblemParser } from './src/parsers/problem/CSESProblemParser';
import { HDOJProblemParser } from './src/parsers/problem/HDOJProblemParser';
import { AcWingProblemParser } from './src/parsers/problem/AcWingProblemParser';
import { LibreOJProblemParser } from './src/parsers/problem/LibreOJProblemParser';
import { DMOJProblemParser } from './src/parsers/problem/DMOJProblemParser';

const parsers=[new CodeforcesProblemParser(), new AtCoderProblemParser(), new LuoguProblemParser(),
    new LanqiaoProblemParser(), new NowCoderProblemParser(), new SPOJProblemParser(),
    new CSESProblemParser(), new HDOJProblemParser(), new AcWingProblemParser(),
    new LibreOJProblemParser(), new DMOJProblemParser()];

export function getMatchPatterns(): string[] {
  return [...new Set(parsers.flatMap(parser => parser.getMatchPatterns()))];
}

export async function parseCurrentProblem(): Promise<string> {
  const url=location.href;
  const parser=parsers.find(candidate => candidate.getMatchPatterns().some(pattern => {
    const expression=pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${expression}$`).test(url);
  }));
  if (!parser) { throw new Error('This page is not supported by the bundled DOM parsers.'); }
  const html=document.documentElement.outerHTML;
  if (html.length>16*1024*1024) { throw new Error('Problem page exceeds the parsing limit.'); }
  const problem=await parser.parse(url,html);
  if (location.href!==url) { throw new Error('The page changed during parsing.'); }
  const json=JSON.stringify(problem);
  if (json.length>8*1024*1024) { throw new Error('Problem exceeds the import limit.'); }
  return json;
}

/** Fixed raw-document entry for OJ Connect; ordinary browser import remains unchanged. */
export async function parseCodeforcesHtml(url: string, html: string): Promise<string> {
  const target = new URL(url);
  if (target.origin !== 'https://codeforces.com' || target.username || target.password || target.search || target.hash || !/^\/contest\/[1-9]\d*\/problem\/[A-Z][A-Z0-9]*$/.test(target.pathname) || html.length > 8 * 1024 * 1024) { throw new Error('Invalid official Codeforces problem document.'); }
  const problem = await new CodeforcesProblemParser().parse(url, html);
  const json = JSON.stringify(problem);
  if (json.length > 8 * 1024 * 1024) { throw new Error('Problem exceeds the import limit.'); }
  return json;
}
