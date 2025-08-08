module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/fixtures/test-setup.js'],
  testTimeout: 30000,
  maxWorkers: 1,
  verbose: true
};