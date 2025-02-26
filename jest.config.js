module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/napl/javascript/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  }
};