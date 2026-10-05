/** @type {import('tailwindcss').Config} */

/**
 * Tailwind is a thin layer over `index.css`.
 *
 * Every colour here is a CSS custom property, never a hex. That is what lets one
 * set of component classes serve both themes: `.dark` on <html> re-points the
 * variables in `index.css`, and no utility in this file -- and no component that
 * uses one -- needs to know which theme is live.
 *
 * Source of truth: design-system/mangaud-banking-console/MASTER.md
 * (ui-ux-pro-max, Banking/Traditional Finance, Minimalism & Swiss, density 8).
 */

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // --- semantic slots ---------------------------------------------------
        // `background` is the page, `card` the raised surface. The `DEFAULT` key
        // on each ramp is load-bearing: Tailwind only generates the `/opacity`
        // modifier for a flat colour, so without it `border-border/40` silently
        // fails to resolve inside `@apply`.
        background: 'rgb(var(--page) / <alpha-value>)',
        card: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--surface-raised) / <alpha-value>)',
        sunken: 'rgb(var(--sunken) / <alpha-value>)',
        border: 'rgb(var(--line) / <alpha-value>)',
        rule: 'rgb(var(--line) / <alpha-value>)',
        'border-strong': 'rgb(var(--line-strong) / <alpha-value>)',

        text: 'rgb(var(--ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--ink-soft) / <alpha-value>)',
        muted: 'rgb(var(--ink-muted) / <alpha-value>)',
        inverse: 'rgb(var(--ink-inverse) / <alpha-value>)',

        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          quiet: 'rgb(var(--brand-quiet) / <alpha-value>)',
          line: 'rgb(var(--brand-line) / <alpha-value>)',
          ink: 'rgb(var(--brand-ink) / <alpha-value>)',
          hover: 'rgb(var(--brand-hover) / <alpha-value>)',
        },

        // `quiet` is a semantic slot (the -50 tint, paired for text); the
        // numbered keys are the raw ramp. Both live on the same colour key
        // because they are the same hue -- declaring `danger` twice in this
        // object would silently drop one of them.
        positive: {
          DEFAULT: 'rgb(var(--positive) / <alpha-value>)',
          quiet: 'rgb(var(--positive-quiet) / <alpha-value>)',
          50: 'rgb(var(--green-50) / <alpha-value>)',
          100: 'rgb(var(--green-100) / <alpha-value>)',
          200: 'rgb(var(--green-200) / <alpha-value>)',
          400: 'rgb(var(--green-400) / <alpha-value>)',
          500: 'rgb(var(--green-500) / <alpha-value>)',
          600: 'rgb(var(--green-600) / <alpha-value>)',
          700: 'rgb(var(--green-700) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          quiet: 'rgb(var(--warning-quiet) / <alpha-value>)',
          50: 'rgb(var(--amber-50) / <alpha-value>)',
          100: 'rgb(var(--amber-100) / <alpha-value>)',
          200: 'rgb(var(--amber-200) / <alpha-value>)',
          400: 'rgb(var(--amber-400) / <alpha-value>)',
          500: 'rgb(var(--amber-500) / <alpha-value>)',
          600: 'rgb(var(--amber-600) / <alpha-value>)',
          700: 'rgb(var(--amber-700) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          quiet: 'rgb(var(--danger-quiet) / <alpha-value>)',
          50: 'rgb(var(--red-50) / <alpha-value>)',
          100: 'rgb(var(--red-100) / <alpha-value>)',
          200: 'rgb(var(--red-200) / <alpha-value>)',
          400: 'rgb(var(--red-400) / <alpha-value>)',
          500: 'rgb(var(--red-500) / <alpha-value>)',
          600: 'rgb(var(--red-600) / <alpha-value>)',
          700: 'rgb(var(--red-700) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          quiet: 'rgb(var(--info-quiet) / <alpha-value>)',
          50: 'rgb(var(--sky-50) / <alpha-value>)',
          100: 'rgb(var(--sky-100) / <alpha-value>)',
          200: 'rgb(var(--sky-200) / <alpha-value>)',
          400: 'rgb(var(--sky-400) / <alpha-value>)',
          600: 'rgb(var(--sky-600) / <alpha-value>)',
          700: 'rgb(var(--sky-700) / <alpha-value>)',
        },
        focus: 'rgb(var(--focus) / <alpha-value>)',

        /*
          Sidebar.
          The app shell navigation is always the dark navy, in both themes.
          A sidebar that flips with the theme means the thing you navigate by
          changes colour when you toggle the appearance, which is disorienting
          exactly when you are trying to find a control. Pinned to the primary
          navy and the warm off-white the old design used for it.
        */
        sidebar: {
          DEFAULT: 'rgb(var(--navy-900) / <alpha-value>)',
          hover: 'rgb(var(--navy-800) / <alpha-value>)',
          active: 'rgb(var(--navy-700) / <alpha-value>)',
          text: 'rgb(var(--sidebar-text) / <alpha-value>)',
          muted: 'rgb(var(--sidebar-muted) / <alpha-value>)',
        },

        // --- gold (accent) -----------------------------------------------------
        brass: {
          DEFAULT: 'rgb(var(--gold-700) / <alpha-value>)',
          50: 'rgb(var(--gold-50) / <alpha-value>)',
          100: 'rgb(var(--gold-100) / <alpha-value>)',
          200: 'rgb(var(--gold-200) / <alpha-value>)',
          300: 'rgb(var(--gold-300) / <alpha-value>)',
          400: 'rgb(var(--gold-400) / <alpha-value>)',
          500: 'rgb(var(--gold-500) / <alpha-value>)',
          600: 'rgb(var(--gold-600) / <alpha-value>)',
          700: 'rgb(var(--gold-700) / <alpha-value>)',
          800: 'rgb(var(--gold-800) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--green-600) / <alpha-value>)',
          quiet: 'rgb(var(--positive-quiet) / <alpha-value>)',
          50: 'rgb(var(--green-50) / <alpha-value>)',
          100: 'rgb(var(--green-100) / <alpha-value>)',
          200: 'rgb(var(--green-200) / <alpha-value>)',
          400: 'rgb(var(--green-400) / <alpha-value>)',
          500: 'rgb(var(--green-500) / <alpha-value>)',
          600: 'rgb(var(--green-600) / <alpha-value>)',
          700: 'rgb(var(--green-700) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--navy-900) / <alpha-value>)',
          50: 'rgb(var(--navy-50) / <alpha-value>)',
          100: 'rgb(var(--navy-100) / <alpha-value>)',
          200: 'rgb(var(--navy-200) / <alpha-value>)',
          300: 'rgb(var(--navy-300) / <alpha-value>)',
          400: 'rgb(var(--navy-400) / <alpha-value>)',
          500: 'rgb(var(--navy-500) / <alpha-value>)',
          600: 'rgb(var(--navy-600) / <alpha-value>)',
          700: 'rgb(var(--navy-700) / <alpha-value>)',
          800: 'rgb(var(--navy-800) / <alpha-value>)',
          900: 'rgb(var(--navy-900) / <alpha-value>)',
          950: 'rgb(var(--navy-950) / <alpha-value>)',
        },

        // --- legacy aliases ---------------------------------------------------
        // Kept so pre-redesign call sites still resolve. `paper` was the old
        // background, `ink` the old foreground; both now point at the new slots.
        paper: {
          DEFAULT: 'rgb(var(--page) / <alpha-value>)',
          raised: 'rgb(var(--surface) / <alpha-value>)',
          deep: 'rgb(var(--sunken) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
        },
      },

      fontFamily: {
        // IBM Plex Sans is the engine's pick for "financial, trustworthy,
        // professional, banking, serious". It serves headings AND body.
        sans: [
          'IBM Plex Sans',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        /*
          `display` was Fraunces, a display serif. Fifteen call sites still say
          `font-display`, and with no such key they silently fell through to the
          body face -- which happened to be the right result, but by accident.
          It is mapped explicitly now so the intent is visible: in a Swiss
          banking console every level of the hierarchy is the same family, and
          hierarchy is carried by size and weight rather than by a second
          typeface. One family also means one set of digit shapes, so a heading
          figure and a table figure line up.
        */
        display: ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        /*
          JetBrains Mono is now for code-like values only -- bank references,
          statement numbers, ids -- via the `.mono-code` utility. It is NOT used
          for money: a monospace digit is ~20% wider than the surrounding text,
          so ₹1,87,615.36 renders with a gap after every separator and the reader
          has to hunt for the decimal point.
        */
        mono: ['JetBrains Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },

      fontSize: {
        // A strict modular scale. The engine's UX guidance is explicit that an
        // arbitrary scale defeats scanning; these are 11/12/13/14/15/18/22/28/34.
        '2xs': ['var(--text-2xs)', { lineHeight: '1rem' }],
        xs: ['var(--text-xs)', { lineHeight: '1.125rem' }],
        sm: ['var(--text-sm)', { lineHeight: '1.25rem' }],
        base: ['var(--text-base)', { lineHeight: '1.375rem' }],
        md: ['var(--text-md)', { lineHeight: '1.5rem' }],
        lg: ['var(--text-lg)', { lineHeight: '1.5rem' }],
        xl: ['var(--text-xl)', { lineHeight: '1.75rem' }],
        '2xl': ['var(--text-2xl)', { lineHeight: '2.125rem' }],
        '3xl': ['var(--text-3xl)', { lineHeight: '2.375rem' }],
      },

      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },

      boxShadow: {
        // Two-layer values (contact + ambient) defined in index.css. `edge` is
        // the lit top edge on its own, for a surface that needs the highlight
        // without changing elevation.
        card: 'var(--shadow-sm)',
        lift: 'var(--shadow-md)',
        pop: 'var(--shadow-lg)',
        overlay: 'var(--shadow-xl)',
        edge: 'var(--edge-light)',
        brand: '0 1px 2px rgb(var(--brand) / 0.25)',
      },

      spacing: {
        // Density 8/10. `safe-t` / `safe-b` are the only additions: a fixed
        // mobile bottom bar has to clear the home indicator.
        'safe-t': 'env(safe-area-inset-top, 0px)',
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
      },

      screens: {
        xs: '420px',
      },

      maxWidth: {
        // One content width. A dense ledger stretched across 1920px is a scan
        // problem, not a layout win.
        content: '80rem',
        measure: '68ch',
      },

      transitionDuration: {
        instant: 'var(--dur-instant)',
        fast: 'var(--dur-fast)',
        DEFAULT: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },

      transitionTimingFunction: {
        out: 'var(--ease-out)',
        standard: 'var(--ease-in-out)',
      },

      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
      },

      animation: {
        rise: 'rise var(--dur-base) var(--ease-out) both',
        'fade-in': 'fade-in var(--dur-base) var(--ease-out) both',
        'scale-in': 'scale-in var(--dur-base) var(--ease-out) both',
      },
    },
  },
  plugins: [],
};