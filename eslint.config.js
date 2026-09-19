import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      'packages/rules/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The rules package is pure: no I/O, no ambient randomness. Dice take an
    // injected RNG so the golden session is deterministic (task 1.4, 10.4).
    files: ['packages/rules/src/**/*.ts'],
    ignores: ['packages/rules/src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'The rules package is pure: no I/O.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Dice take an injected RNG so tests and the golden session are deterministic.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'crypto'],
              message: 'The rules package is pure: no I/O.',
            },
          ],
        },
      ],
    },
  },
  {
    // Projection is a pure fold over the log: no RNG, no clock, no I/O, and
    // no reads of versioned rules content (docs/design-event-log.md section 2).
    //
    // The content ban is the subtle one. Pure *functions* from  are
    // fine — applyMomentumDelta, momentumMax — but STARFORGED is versioned
    // *data*, and reading it during projection would let a Datasworn
    // regeneration change what an old campaign's numbers were. Which effects
    // an outcome produces is resolved once, at write time, and stored.
    files: ['packages/server/src/projection/**/*.ts'],
    ignores: ['packages/server/src/projection/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'Projection is pure: no I/O.' },
        { name: 'crypto', message: 'Projection is pure: ids are minted at write time.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Projection is deterministic: dice are rolled once, at write time.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Projection is deterministic: occurredAt is stored on the event.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'postgres',
              message: 'Projection does no I/O. The store (db/) is the only module that does.',
            },
            {
              name: '@anthropic-ai/sdk',
              message: 'Projection never calls a provider. AI output is an event like any other.',
            },
          ],
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'crypto'],
              message: 'Projection is pure: no I/O.',
            },
            {
              group: ['**/db/**'],
              message: 'Projection does no I/O. The store (db/) is the only module that does.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportSpecifier[imported.name='STARFORGED']",
          message:
            'Projection may call pure functions from rules, but never read versioned rules content. ' +
            'Anything content-derived is resolved at write time and stored on the event.',
        },
        {
          selector: "ImportSpecifier[imported.name='ATTRIBUTION']",
          message: 'Projection may call pure functions from rules, but never read rules content.',
        },
        {
          selector: 'NewExpression[callee.name="Date"]',
          message: 'Projection is deterministic: occurredAt is stored on the event.',
        },
      ],
    },
  },
  {
    // AI context assembly (tasks 7.4, 7.6, 7.7) is pure: projected state and
    // events in, a request out. It may read rules content — move names and
    // choice labels are what the AI needs to hear — but it never does I/O,
    // never reads the clock, and never calls a provider, so what the AI is
    // told stays unit-testable and provider-independent (design record §9).
    files: ['packages/server/src/ai/context/**/*.ts'],
    ignores: ['packages/server/src/ai/context/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'Context assembly is pure: no I/O.' },
        { name: 'crypto', message: 'Context assembly is pure.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Context assembly is deterministic.' },
        { object: 'Date', property: 'now', message: 'Context assembly is deterministic.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'postgres',
              message: 'Context assembly does no I/O; the command layer reads the log.',
            },
            {
              name: '@anthropic-ai/sdk',
              message: 'Context assembly builds a request; only a provider sends one.',
            },
          ],
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'crypto'],
              message: 'Context assembly is pure: no I/O.',
            },
            {
              group: ['**/db/**'],
              message: 'Context assembly does no I/O; the command layer reads the log.',
            },
            {
              group: ['../claude.js', '../stub.js', '../create-provider.js'],
              message: 'Context assembly is provider-independent; import only the request types.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'NewExpression[callee.name="Date"]',
          message: 'Context assembly is deterministic.',
        },
      ],
    },
  },
  {
    // Catches rules-of-hooks and stale-dependency bugs statically (D-96).
    files: ['packages/web/**/*.{ts,tsx}'],
    ignores: ['packages/web/**/*.test.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs['recommended-latest'].rules,
  },
  {
    // A busy or blocked launch button stays focusable (D-208): use guarded() from ui/guarded.ts.
    files: ['packages/web/src/launch/**/*.tsx', 'packages/web/src/campaigns/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='button'] > JSXAttribute[name.name='disabled']",
          message:
            'A native disabled button leaves the tab order and drops focus (D-208). Use guarded() from ui/guarded.ts.',
        },
      ],
    },
  },
);
