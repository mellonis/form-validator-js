module.exports = {
  projects: [
    '.',
    '<rootDir>/packages/*',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!@form-validator-js)',
  ],
};
