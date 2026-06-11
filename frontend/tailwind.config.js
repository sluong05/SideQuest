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
          50:  '#F8FAFC',
          100: '#E2E8F0',
          200: '#94A3B8',
          300: '#475569',
          400: '#1E3A5F',
          500: '#0D1F38',
          600: '#080F20',
          700: '#060C18',
          800: '#040A14',
          900: '#030710',
          950: '#010509',
        },
        // Design token aliases
        sq: {
          page:    '#050A14',
          card:    '#081525',
          'card-alt': '#0B1B2D',
          border:  'rgba(59,130,246,0.18)',
          blue:    '#2563EB',
          'blue-bright': '#3B82F6',
          warning: '#F59E0B',
          danger:  '#EF4444',
          success: '#22C55E',
        },
      },
      boxShadow: {
        'glow-blue':   '0 0 20px rgba(37,99,235,0.4)',
        'glow-green':  '0 0 20px rgba(34,197,94,0.4)',
        'glow-red':    '0 0 20px rgba(239,68,68,0.4)',
        'glow-orange': '0 0 20px rgba(249,115,22,0.4)',
        'glow-sm':     '0 0 10px rgba(37,99,235,0.25)',
        'glow-lg':     '0 0 30px rgba(37,99,235,0.5)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':  'spin 3s linear infinite',
      },
    },
  },
  plugins: [],
};
