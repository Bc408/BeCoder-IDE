/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const lanqiaoFixtureProblem = { site: 'lanqiao' as const, nativeId: '254', url: 'https://www.lanqiao.cn/problems/254/learning/' };
// Synthetic minimal prose and values in the observed official schema, not website responses.
export const lanqiaoFixtureData = { id: 254, question_id: 43756, name: 'A+B', type: 'contest_oj', in_contest: false, contest_id: null, vm_config: null, question_stem: '### 输入描述\nTwo integers.\n### 输出描述\nTheir sum.\n### 输入输出样例\n> 输入\n```txt\n1 2\n```\n> 输出\n```txt\n3\n```', limit_details: [{ language: 'C++', max_runtime_seconds: 1, max_runtime_memory_mb: 256 }, { language: 'C', max_runtime_seconds: 2, max_runtime_memory_mb: 128 }] };
export const lanqiaoFixtureLanguages = '({computed:{availableLanguages:function(){return [{label:"C++（g++17）",value:"cpp",default:!0},{label:"C（gcc8.3.0）",value:"c"}]}}})';
export const lanqiaoFixtureBase = 'https://assets.lanqiao.cn/lanqiao-fe/v7.52.21/dist/';
export const lanqiaoFixtureHTML = ['1111111', '2222222', '3333333'].map(hash => '<script src="' + lanqiaoFixtureBase + hash + '.js"></script>').join('');
export const lanqiaoFixtureRuntime = 'function x(e){return o.p+""+{85:"4444444"}[e]+".js"}';
export const lanqiaoFixtureApplication = '({path:"/problems/:id/learning",name:"problems-id-learning",component:function(){return n.e(85)}})';
