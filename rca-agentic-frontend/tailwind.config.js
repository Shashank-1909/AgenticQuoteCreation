/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'pulse-flow': 'pulse-flow 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'beam': 'beam 2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      },
      keyframes: {
        'pulse-flow': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '20%': { opacity: '1' },
          '100%': { transform: 'translateY(300%)', opacity: '0' },
        },
        'beam': {
          '0%': { opacity: '0', transform: 'scaleX(0)', transformOrigin: 'left' },
          '50%': { opacity: '1', transform: 'scaleX(1)' },
          '100%': { opacity: '0', transform: 'scaleX(1)', transformOrigin: 'right' },
        }
      }
    },
  },
  plugins: [],
}
