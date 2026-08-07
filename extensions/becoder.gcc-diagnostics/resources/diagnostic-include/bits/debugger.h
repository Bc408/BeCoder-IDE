/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#ifndef BECODER_DIAGNOSTIC_DEBUGGER_H
#define BECODER_DIAGNOSTIC_DEBUGGER_H

#ifdef DEBUGER_H
#undef DEBUGER_H
#endif

#ifdef DEBUG
#ifndef DEBUGER_H
#define DEBUGER_H

#include <algorithm>
#include <array>
#include <deque>
#include <iostream>
#include <list>
#include <map>
#include <queue>
#include <set>
#include <sstream>
#include <stack>
#include <string>
#include <tuple>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#define COLOR_START "\033[35m"
#define COLOR_END "\033[0m"

class __Debugger {
	public:
	template <typename T>
	__Debugger& operator<<(const T&) {
		return *this;
	}

	void sp(const std::string& = "") {}
};

inline __Debugger dout;

#define debug(x) ((void)(x))

#endif  // DEBUGER_H
#endif  // DEBUG

#endif  // BECODER_DIAGNOSTIC_DEBUGGER_H
