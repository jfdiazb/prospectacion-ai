module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          50: '#f9f9f9',
          100: '#f3f3f3',
          200: '#e8e8e8',
          300: '#d2d2d2',
          400: '#a1a1a1',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#292929',
          900: '#1a1a1a',
          950: '#0b1220',
        },
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          500: '#a78bfa',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
        },
      },
      boxShadow: {
        card: '0 25px 70px rgba(0, 0, 0, 0.18)',
        'card-hover': '0 24px 60px rgba(0, 0, 0, 0.2)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 6px rgba(0, 0, 0, 0.1)',
        'card-hover': '0 20px 25px rgba(0, 0, 0, 0.15)',
      },
    },
  },
  darkMode: 'class',
  plugins: [],
};
