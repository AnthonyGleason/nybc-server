/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ["**/**/*.test.ts"], //set name of tests
  verbose: true, //each test is reported in the test run
  forceExit: true,
  setupFilesAfterEnv: ['./jest.setup.ts'],
  moduleNameMapper: {
    '@src/(.*)': '<rootDir>/src/$1'
  },
  moduleFileExtensions: ['js', 'ts', 'json', 'node'],
  //clearMocks: true,
};