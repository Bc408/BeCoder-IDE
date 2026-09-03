/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Entry point for all tests.
// Spawns VSCode with our extension, and then runs compiled *.test.js files.

import {runTests} from '@vscode/test-electron';
import {glob} from 'glob';
import Mocha = require('mocha');
import * as path from 'path';

// The entry point under VSCode - find the test files and run them in Mocha.
export async function run(): Promise<void> {
  const mocha = new Mocha({ui: 'tdd', color: true});
  const testsRoot = __dirname;

  const files = await glob('*.test.js', {cwd: testsRoot});
  files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

  await new Promise<void>((resolve, reject) => {
    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}

// The main entry point: its job is to launch VSCode and execute run() under it.
async function main() {
  // The extension to be loaded is in the project root directory.
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  // The run() function to run in vscode is defined in this file.
  const extensionTestsPath = __filename;
  const localTestExecutable = process.env['BECODER_TEST_EXECUTABLE'];
  // Use the matching local BeCoder host when supplied, otherwise download 1.130.
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    ...(localTestExecutable ? {vscodeExecutablePath: localTestExecutable} :
                               {version: '1.130.0'})
  });
}

if (require.main === module) {
  main();
}
