/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Syne"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        void: '#080810',
        surface: '#0f0f1a',
        panel: '#13131f',
        border: '#1e1e30',
        accent: '#7c5cfc',
        'accent-bright': '#a07cff',
        'accent-dim': '#4a3a9a',
        glow: '#6d44ff',
        host: '#f59e0b',
        moderator: '#22d3ee',
        participant: '#94a3b8',
        danger: '#ef4444',
        success: '#22c55e',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(124, 92, 252, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(124, 92, 252, 0.6)' },
        },
      },
      boxShadow: {
        'accent-glow': '0 0 30px rgba(124, 92, 252, 0.4)',
        'card': '0 4px 24px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
}
