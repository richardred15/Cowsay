module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.js'],
  testTimeout: 10000,
  verbose: true,
  // Don't use the global test setup for unit tests
  setupFilesAfterEnv: []
};