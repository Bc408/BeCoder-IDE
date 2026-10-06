/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import tseslint from 'typescript-eslint';

export default [
	...tseslint.configs.recommended,
	{ rules: { curly: 'error', eqeqeq: 'error', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } }
];
