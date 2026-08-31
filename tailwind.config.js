/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: '#070a12',
        midnight: {
          950: '#060910',
          900: '#0a0f1d',
          850: '#0d1426',
          800: '#111b33',
          700: '#172545',
          600: '#1e325c',
        },
        blueAccent: {
          500: '#3b82f6',
          400: '#60a5fa',
          300: '#93c5fd',
          glow: 'rgba(59, 130, 246, 0.25)',
        }
      },
      boxShadow: {
        'blue-soft': '0 0 25px -5px rgba(59, 130, 246, 0.2), 0 8px 24px -6px rgba(0, 0, 0, 0.6)',
        'blue-glow': '0 0 35px -5px rgba(59, 130, 246, 0.35)',
        'core-glow': '0 0 45px -5px rgba(59, 130, 246, 0.4), 0 0 20px rgba(96, 165, 250, 0.3)',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
