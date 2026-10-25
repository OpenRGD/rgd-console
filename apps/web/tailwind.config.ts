import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#080d15',
        panel: '#101924',
        elevated: '#14212d',
        line: '#243341',
        mint: '#63e5c0',
        muted: '#91a2b3',
        amber: '#f5c477',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'], mono: ['ui-monospace', 'SFMono-Regular', 'monospace'] },
    },
  },
  plugins: [],
} satisfies Config;
