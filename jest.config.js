module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node', // Important for testing Node.js code like agent-script.ts
  roots: ['<rootDir>/src'], // Adjust if tests are located elsewhere
  testMatch: [ // Pattern to discover test files
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json' // Ensure this points to your TS config
    }]
  },
  moduleNameMapper: { // If you have path aliases in tsconfig.json
    '^@/(.*)$': '<rootDir>/src/$1' // Example, adjust to your project
  },
  // Add any other global setup or configurations if needed
};
