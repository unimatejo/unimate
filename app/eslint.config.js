// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Rules that only say "the React Compiler will skip optimizing this component".
// The app still works the same; they are tracked as warnings and cleaned up gradually.
const compilerAdvice = ['immutability', 'set-state-in-effect', 'purity', 'refs', 'preserve-manual-memoization', 'static-components', 'use-memo'];

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist-web/*', 'dist/*', 'android/*', 'ios/*', 'web/sw.js', 'dev/*'] },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      ...Object.fromEntries(compilerAdvice.map((r) => [`react-hooks/${r}`, 'warn'])),
      // TypeScript already checks these (and allows a type and a value with the same name)
      'import/namespace': 'off',
      '@typescript-eslint/no-redeclare': 'off',
    },
  },
]);
