import react from '@portfolio/config/eslint-react';

export default [
  ...react,
  { ignores: ['storybook-static/**'] },
  {
    // Vendored shadcn/ui and AI Elements files: keep them close to upstream so updates stay easy.
    files: ['src/components/ui/**', 'src/components/ai-elements/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
      // Upstream patterns: props destructured only to keep them out of a spread,
      // and React Compiler rules the upstream code doesn't follow yet.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      'react-hooks/static-components': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];
