const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Backend suite + Frontend pure/node-safe unit tests (lib/pages).
    // Exclude React component/hook suites — Backend does not install react.
    include: [
      "src/**/*.test.js",
      "../Frontend/src/lib/**/*.test.js",
      "../Frontend/src/pages/**/*.test.js",
    ],
    exclude: [
      "**/node_modules/**",
      "../Frontend/src/components/**",
      "../Frontend/src/hooks/**",
      "../Frontend/src/utils/**",
    ],
  },
});
