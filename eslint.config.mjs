const sharedRules = {
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-redeclare': 'error',
  'no-unreachable': 'error',
  'no-constant-condition': 'warn',
  eqeqeq: ['warn', 'smart'],
  curly: ['warn', 'multi-line'],
  'prefer-const': 'warn'
};

export default [
  {
    ignores: ['admin.html', 'docs/admin.html', 'src/admin.js', 'node_modules/**']
  },
  {
    files: ['src/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        navigator: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        CSS: 'readonly',
        fetch: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
        console: 'readonly',
        Event: 'readonly'
      }
    },
    rules: {
      ...sharedRules,
      // Browser source files are concatenated by build-admin.mjs and share globals.
      // Per-file no-undef is not valid for this architecture.
      'no-undef': 'off'
    }
  },
  {
    files: ['src/lib/**/*.mjs', 'tests/**/*.mjs', 'build-admin.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        process: 'readonly'
      }
    },
    rules: {
      ...sharedRules,
      'no-undef': 'error'
    }
  }
];
