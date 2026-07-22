/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Cairo"', 'system-ui', 'sans-serif'],
        mono: ['"Spline Sans Mono"', 'monospace'],
      },
      colors: {
        industrial: {
          50: '#f5f7fa',
          100: '#e9eef5',
          200: '#d0dce8',
          300: '#aabed5',
          400: '#7d9bbe',
          500: '#5a7ca6',
          600: '#46628c',
          700: '#384f73',
          800: '#304462',
          900: '#2b3951',
          950: '#1d2537',
        },
        accent: {
          50: '#fff8eb',
          100: '#ffefc6',
          200: '#ffdc88',
          300: '#ffc34a',
          400: '#ffaa1a',
          500: '#f98c07',
          600: '#dd6902',
          700: '#b74906',
          800: '#94380c',
          900: '#7a300d',
          950: '#461702',
        }
      },
      boxShadow: {
        premium: '0 20px 40px -10px rgba(0,0,0,0.1)',
        'premium-hover': '0 30px 60px -15px rgba(0,0,0,0.15)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
};