import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'Avenir Next', 'sans-serif'],
        display: ['Space Grotesk', 'Avenir Next', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
