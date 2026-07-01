/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Cairo', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        premium: '0 10px 30px -5px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
