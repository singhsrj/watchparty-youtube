/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Syne"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        void: '#06131d',
        surface: '#0b1d2a',
        panel: '#102536',
        border: '#1c3a4e',
        accent: '#ff4438',
        'accent-bright': '#ff675e',
        'accent-dim': '#c93027',
        glow: '#ff8f86',
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
          '0%, 100%': { boxShadow: '0 0 20px rgba(255, 68, 56, 0.35)' },
          '50%': { boxShadow: '0 0 42px rgba(255, 103, 94, 0.7)' },
        },
      },
      boxShadow: {
        'accent-glow': '0 0 34px rgba(255, 68, 56, 0.45)',
        card: '0 4px 24px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
}
