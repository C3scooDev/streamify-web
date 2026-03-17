import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      colors: {
        ink: {
          50:  '#f0f0ee',
          100: '#d4d4cf',
          200: '#a8a89f',
          300: '#7d7d72',
          400: '#525249',
          500: '#2a2a25',
          600: '#1e1e1a',
          700: '#141410',
          800: '#0d0d0a',
          900: '#080806',
        },
        signal: {
          DEFAULT: '#e8ff47',
          dim:     '#c4d93a',
          dark:    '#8fa829',
        },
        ember: {
          DEFAULT: '#ff5c35',
          dim:     '#cc4929',
        },
      },
      animation: {
        'fade-in':   'fadeIn 0.4s ease forwards',
        'slide-up':  'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
        'scan':      'scan 8s linear infinite',
        'pulse-slow':'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(20px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scan:    { from: { transform: 'translateY(-100%)' }, to: { transform: 'translateY(100vh)' } },
      },
    },
  },
  plugins: [],
}

export default config
