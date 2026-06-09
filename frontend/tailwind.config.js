/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: {
          50:  '#F8FAFC', // crisp white — primary text
          100: '#E2E8F0', // light blue-gray — secondary text
          200: '#94A3B8', // muted blue-gray — hints/labels
          300: '#475569', // dim text / placeholders
          400: '#1E3A5F', // dark blue borders
          500: '#0D1F38', // card background
          600: '#080F20', // PAGE BACKGROUND
          700: '#060C18', // nav / header
          800: '#040A14', // input backgrounds / deepest sections
          900: '#030710', // overlays
          950: '#010509', // near-black
        },
      },
    },
  },
  plugins: [],
};
