const moduleName = 'core';

module.exports = {
  displayName: {
    name: moduleName,
    color: 'red',
  },
  moduleNameMapper: {
    '^@form-validator-js/core': '<rootDir>/src',
  },
  transformIgnorePatterns: [
    'node_modules/(?!@form-validator-js)',
  ],
};
