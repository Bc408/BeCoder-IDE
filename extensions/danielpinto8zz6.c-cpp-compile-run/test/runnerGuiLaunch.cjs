/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '../../..');
const evidence = path.join(root, '.build/runner-validation');
const executable = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(root, '../VSCode-win32-x64/BeCoder.exe');
(async () => {
	if (!fs.statSync(executable).isFile()) { throw new Error('Staged executable missing'); }
	const project = fs.mkdtempSync(path.join(evidence, 'gui-project-'));
	const snippets = {
		'withInput.cpp': '#include<bits/stdc++.h>\nusing namespace std;\nint main() {\n  cin.tie(0)->sync_with_stdio(0);\n  int x;\n  while (cin>>x) {\n    cout<<"OUT="<<x<<\'\\n\';\n    debug(x);\n    cout<<"AFTER="<<x*2<<\'\\n\';\n  }\n  cout<<"EOF_DONE\\n";\n  return 0;\n}\n',
		'exit.cpp': '#include<bits/stdc++.h>\nusing namespace std;\nint main() {\n  return 7;\n}\n',
		'streams.cpp': '#include<bits/stdc++.h>\nusing namespace std;\nint main() {\n  cin.tie(0)->sync_with_stdio(0);\n  for (int i=0;i<5;i++) {\n    cout<<"OUT"<<i<<\'\\n\';\n    debug(i);\n  }\n  return 0;\n}\n',
		'interactive.cpp': '#include<bits/stdc++.h>\nusing namespace std;\nint main() {\n  int x;\n  cout<<"INPUT_READY\\n";\n  if (!(cin>>x)) return 3;\n  debug(x);\n  cout<<"ANSWER="<<x*2<<\'\\n\';\n  return 0;\n}\n',
		'silent.cpp': '#include<bits/stdc++.h>\nusing namespace std;\nint main() {\n  for (;;) this_thread::sleep_for(chrono::milliseconds(100));\n  return 0;\n}\n',
		'input': '21\n'
	};
	for (const [name, text] of Object.entries(snippets)) {
		fs.writeFileSync(path.join(project, name), text);
	}
	const server = net.createServer();
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const port = server.address().port;
	await new Promise(resolve => server.close(resolve));
	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	const log = fs.openSync(path.join(evidence, 'gui.log'), 'w');
	const child = spawn(executable, [project, path.join(project, 'streams.cpp'), '--new-window', '--locale=en', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', `--remote-debugging-port=${port}`], { cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
	fs.closeSync(log);
	child.unref();
	const result = { pid: child.pid, port, project, executable };
	fs.writeFileSync(path.join(evidence, 'gui.json'), JSON.stringify(result, null, 2));
	for (let i = 0; i < 60; i++) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) });
			if (response.ok) { console.log(JSON.stringify(result)); return; }
		} catch { /* Startup is still in progress. */ }
		await new Promise(resolve => setTimeout(resolve, 1000));
	}
	throw new Error(`CDP startup timed out; inspect ${path.join(evidence, 'gui.log')}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
