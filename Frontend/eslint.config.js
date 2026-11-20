import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// Matches Tailwind utilities that are tied to the left/right side (also behind variants like `md:`).
const PHYSICAL_CLASS = '/(^|[\\s:])(-?(ml|mr|pl|pr|left|right)-|text-(left|right)([\\s]|$)|border-[lr]([-\\s]|$)|rounded-([tb]?[lr])([-\\s]|$))/';

export default defineConfig([
  globalIgnores(['dist', '**/*.test.js']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // React Compiler rules. The app resets modal state in effects and reads
      // scanner refs during render; enforcing these would be a UI rewrite.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-refresh/only-export-components': 'warn',
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // RTL guard: the staff app is bilingual, so spacing and alignment must use
    // logical properties (ms-/me-/ps-/pe-/start-/end-/text-start/border-s ...).
    files: ['src/pages/**/*.{js,jsx}', 'src/components/**/*.{js,jsx}'],
    rules: {
      'no-restricted-syntax': ['warn',
        {
          selector: `JSXAttribute[name.name='className'] Literal[value=${PHYSICAL_CLASS}]`,
          message: 'Physical direction class breaks RTL. Use ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e.',
        },
        {
          selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=${PHYSICAL_CLASS}]`,
          message: 'Physical direction class breaks RTL. Use ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e.',
        },
        {
          selector: 'Property[key.name=/^(marginLeft|marginRight|paddingLeft|paddingRight|borderLeft|borderRight|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius)$/]',
          message: 'Physical inline style breaks RTL. Use marginInlineStart/End, paddingInlineStart/End, borderInlineStart/End, borderStartStartRadius etc.',
        },
        {
          selector: "Property[key.name='textAlign'][value.value=/^(left|right)$/]",
          message: "Use textAlign: 'start' or 'end' so alignment follows the language direction.",
        },
        {
          selector: 'Property[key.name=/^(left|right)$/][value.type=/^(Literal|UnaryExpression)$/]',
          message: 'Use insetInlineStart / insetInlineEnd so positioning follows the language direction.',
        },
      ],
    },
  },
  {
    files: ['vite.config.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
