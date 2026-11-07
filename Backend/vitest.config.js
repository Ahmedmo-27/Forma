const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.js", "../Frontend/src/**/*.test.js"],
  },
});
