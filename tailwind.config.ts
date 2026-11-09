import type { Config } from 'tailwindcss';
export default { content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'], theme: { extend: { colors: { cream: '#FBF7F0', paper: '#FFFDF8', ink: '#1F2937', blue: '#2F5BEA', teal: '#0EA5A4' }, fontFamily: { display: ['Georgia', 'serif'], sans: ['Arial', 'sans-serif'] } } }, plugins: [] } satisfies Config;
