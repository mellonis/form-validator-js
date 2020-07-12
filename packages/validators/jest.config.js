const moduleName = 'validators';

module.exports = {
  displayName: {
    name: moduleName,
    color: 'green',
  },
  moduleNameMapper: {
    '^@form-validator-js/core$': '<rootDir>/../core/src',
    '^@form-validator-js/validators$': '<rootDir>/src',
  },
  transformIgnorePatterns: [
    'node_modules/(?!@form-validator-js)',
  ],
};
