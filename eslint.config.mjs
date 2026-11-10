import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  { ignores: ['.next*/**', '.next.build-backup/**', 'node_modules/**'] },
  ...nextVitals,
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      '@next/next/no-location-assign-relative-destination': 'off',
    },
  },
];

export default config;
