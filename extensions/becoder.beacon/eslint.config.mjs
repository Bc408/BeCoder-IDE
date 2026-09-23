/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import tseslint from 'typescript-eslint';

export default [
	{ ignores: ['node_modules/**', 'dist/**', 'dist-test/**'] },
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.ts', 'webview/**/*.tsx', 'test/**/*.ts'],
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'curly': 'error',
			'eqeqeq': 'error'
		}
	}
];
