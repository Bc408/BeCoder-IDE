/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 BeCoder contributors.
 *  Licensed under the GPL-3.0-or-later license. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2018 引领天下. MIT License.
 *  Adapted from yltx/vscode-luogu v4.18.2 (dbced7c2cd0aca345cfa6f91de64b59c02806341).
 *  BeCoder changes: shared OJ data/commands, localization, removed peripheral features.
 *  See ThirdPartyNotices.txt for the original license.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';

const formatTime = (
	date: Date | number,
	fmt: string = 'yyyy-MM-dd hh:mm:ss'
) => {
	if (typeof date === 'number') { date = new Date(date); }
	const o: Record<string, number> = {
		'y+': date.getFullYear(),
		'M+': date.getMonth() + 1,
		'd+': date.getDate(),
		'h+': date.getHours(),
		'm+': date.getMinutes(),
		's+': date.getSeconds(),
		'q+': Math.floor((date.getMonth() + 3) / 3),
		'S+': date.getMilliseconds()
	};
	for (const k in o) {
		const match = new RegExp('(' + k + ')').exec(fmt);
		if (match) {
			const matched = match[1];
			if (k === 'y+') {
				fmt = fmt.replace(matched, ('' + o[k]).slice(4 - matched.length));
			} else if (k === 'S+') {
				const lens = matched.length === 1 ? 3 : matched.length;
				fmt = fmt.replace(
					matched,
					('00' + o[k]).slice(
						('' + o[k]).length - 1,
						('' + o[k]).length - 1 + lens
					)
				);
			} else {
				fmt = fmt.replace(
					matched,
					matched.length === 1
						? String(o[k])
						: ('00' + o[k]).slice(('' + o[k]).length)
				);
			}
		}
	}
	return fmt;
};

// Upstream Time component + formatTime; preserve an unparseable website display verbatim.
export default function Time({ value }: { value: string }) {
	const time = new Date(value);
	return Number.isNaN(time.getTime()) ? <>{value}</> : <time dateTime={time.toISOString()}>{formatTime(time)}</time>;
}
