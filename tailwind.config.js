/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'slide-up': {
          '0%': {
            transform: 'translateY(100%)',
            opacity: '0',
            width: '0',
            overflow: 'hidden',
          },
          '100%': {
            transform: 'translateY(0)',
            opacity: '1',
            width: 'auto',
            overflow: 'visible',
          },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.4s ease-out',
      },
    },
  },
  plugins: [],
}
