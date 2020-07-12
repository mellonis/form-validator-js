const moduleName = 'validators';

module.exports = {
  name: moduleName,
  displayName: moduleName,
  transformIgnorePatterns: [
    'node_modules/(?!@form-validator-js)',
  ],
};
