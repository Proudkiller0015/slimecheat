import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

/** Style and safety rules for all of the code. */
const rules = {
	curly: ['error', 'all'],
	eqeqeq: ['error', 'always', { null: 'ignore' }],
	'no-var': 'error',
	'prefer-const': 'error',
	'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
	'no-shadow': 'error',
	'no-implied-eval': 'error',
	'no-new-func': 'error',
	'no-eval': 'error',
	'object-shorthand': 'error',
	'prefer-template': 'error',
	'no-else-return': 'error',
	'no-nested-ternary': 'error',
};

export default [
	js.configs.recommended,
	prettier,
	{ files: ['slimecheat.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: globals.browser }, rules },
	{ files: ['worker/src/index.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.serviceworker }, rules },
	{
		files: ['test.js'],
		languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
		// page.evaluate callbacks run inside the test page, so reusing a name there is not shadowing.
		rules: { ...rules, 'no-shadow': 'off' },
	},
];
