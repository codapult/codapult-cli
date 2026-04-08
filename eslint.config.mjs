import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...tseslint.configs.recommended,
  prettier,
  globalIgnores(['node_modules/**', 'dist/**']),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]);

export default eslintConfig;
