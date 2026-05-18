// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        // 토스증권 디자인 토큰
        toss: {
          bg:       '#0A0A0A',
          surface:  '#141414',
          elevated: '#1C1C1E',
          card:     '#242426',
          input:    '#2C2C2E',
          border:   '#2C2C2E',
          blue:     '#3182F6',
          green:    '#05C072',
          yellow:   '#F5A623',
          red:      '#F04452',
          gray:     '#8E8E93',
          muted:    '#48484A',
        },
      },
      borderRadius: {
        'xl':  '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      animation: {
        'fade-up': 'fadeUp .25s ease both',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
