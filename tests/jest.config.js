module.exports = {
    testEnvironment: "node",
    roots: ["<rootDir>"],
    testMatch: ["**/*.test.js"],
    collectCoverageFrom: [
        "../modules/**/*.js",
        "../index.js",
        "!../modules/games/**/*.js", // Game logic tested via integration
        "!../node_modules/**",
    ],
    setupFilesAfterEnv: ["<rootDir>/fixtures/test-setup.js"],
    testTimeout: 30000,
    maxWorkers: 1, // Prevent database conflicts
    verbose: true,
    bail: true, // Fail fast on security tests
    forceExit: true,
};
