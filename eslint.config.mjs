export default [
  {
    ignores: [
      "admin.html",
      "src/admin.js",
      "node_modules/**"
    ]
  },
  {
    files: ["src/js/**/*.js", "src/lib/**/*.mjs", "tests/**/*.mjs", "build-admin.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        location: "readonly",
        navigator: "readonly",
        confirm: "readonly",
        alert: "readonly",
        FileReader: "readonly",
        Blob: "readonly",
        URL: "readonly",
        CSS: "readonly",
        fetch: "readonly",
        btoa: "readonly",
        atob: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        requestAnimationFrame: "readonly",
        console: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-undef": "error",
      "no-redeclare": "error",
      "no-unreachable": "error",
      "no-constant-condition": "warn",
      "eqeqeq": ["warn", "smart"],
      "curly": ["warn", "multi-line"],
      "prefer-const": "warn"
    }
  }
];
