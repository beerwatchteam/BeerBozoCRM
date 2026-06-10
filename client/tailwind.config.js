/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bb-green': '#1A5C0E',
        'bb-green-dark': '#155209',
        'bb-green-light': '#F0F8EC',
        'bb-border': '#E2E8E0',
        'bb-light': '#F6F8FA',
        'sidebar': '#111827',
        'sidebar-hover': '#1F2937',
        'sidebar-active': '#1A5C0E',
        'sidebar-text': '#9CA3AF',
        'sidebar-text-active': '#FFFFFF',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Inter',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)',
        'card-md': '0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.06)',
        'card-lg': '0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
}
