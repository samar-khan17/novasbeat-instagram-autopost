/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#050508',
        surface:    '#0d0a1a',
        card:       '#110e20',
        card2:      '#1A0D2E',
        border:     '#2a1f4a',
        accent:     '#8A5CF6',
        brand:      '#A855F7',
        cyan:       '#60A5FA',
        teal:       '#38E0D2',
        success:    '#10b981',
        error:      '#ef4444',
        warning:    '#f59e0b',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Source Sans 3"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow:    '0 0 20px rgba(138,92,246,0.35)',
        'glow-sm':'0 0 12px rgba(138,92,246,0.25)',
        card:    '0 4px 24px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
};
