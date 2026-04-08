import common from '@js-toolkit/eslint-config/common';
import { getFilesGlob, getTSExtensions } from '@js-toolkit/config-utils/extensions';
import { defineConfig, globalIgnores } from 'eslint/config';

const eslintConfig = defineConfig([
  ...common,
  globalIgnores(['node_modules/**', 'dist/**']),
  {
    files: [getFilesGlob(getTSExtensions())],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]);

export default eslintConfig;
