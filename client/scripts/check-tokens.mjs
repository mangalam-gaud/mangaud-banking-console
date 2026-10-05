/**
 * Verifies every Tailwind colour utility used in `src/` actually resolves.
 *
 * An unresolvable colour is not a type error and does not fail `tsc`, but it
 * *does* fail the build the moment it appears inside an `@apply` -- and in JSX
 * it fails silently, leaving an element with no styling at all. Running this
 * catches both cases in one pass.
 *
 *   node scripts/check-tokens.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const require = createRequire(import.meta.url);

// ------------------------------------------------------------------ config

const config = require(join(ROOT, 'tailwind.config.js'));
const customColors = config?.theme?.extend?.colors ?? {};
const customShadows = config?.theme?.extend?.boxShadow ?? {};

// Tailwind's built-in palette resolves without being declared in the config,
// so it has to be loaded too or every `bg-gray-50` reads as a false positive.
let builtinColors = {};
try {
  builtinColors = require('tailwindcss/colors');
} catch {
  builtinColors = Object.fromEntries(
    ['slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
     'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
     'purple', 'fuchsia', 'pink', 'rose', 'white', 'black', 'transparent',
     'current', 'inherit'].map((k) => [k, {}])
  );
}

const colors = { ...builtinColors, ...customColors };

/**
 * Splits a utility into the colour reference, or null when it carries none.
 *
 * Several Tailwind utilities share a colour prefix with something that is not
 * a colour, so the prefix alone is not enough:
 *   `border-b`        -> null   (a border side)
 *   `border-b-2`      -> null   (a border width)
 *   `ring-offset-2`   -> null   (a ring offset width)
 *   `border-t-rule`   -> `rule` (a colour, with a side)
 *   `text-brass-700`  -> `brass-700`
 */
const COLOUR_PREFIXES = [
  'bg', 'text', 'ring-offset', 'ring', 'border', 'divide', 'fill', 'stroke',
  'outline', 'from', 'via', 'to', 'placeholder', 'decoration', 'accent', 'caret',
];

const DIRECTION = /^[trblexy](?=-|$)/;
const WIDTH = /^\d+$/;

const colourPart = (token) => {
  // `bg-gradient-to-br` is a background-image utility.
  if (/^bg-gradient-/.test(token)) return null;

  const prefix = COLOUR_PREFIXES.find((p) => token.startsWith(`${p}-`));
  if (!prefix) return null;

  let rest = token.slice(prefix.length + 1);

  // Peeling a side/direction: `border-b-2` is a width, `border-b-rule` a colour.
  if (DIRECTION.test(rest)) {
    rest = rest.slice(2); // drop the single-letter direction and its '-'
    if (rest === '' || WIDTH.test(rest)) return null;
  }

  // `ring-offset-2` is a width; `ring-offset-background` is a colour.
  if (prefix === 'ring-offset' && (rest === '' || WIDTH.test(rest))) return null;

  if (rest === '') return null;
  if (/^(?:x|y|reverse|none|current|inherit|transparent|collapse|separate|spacing.*)$/.test(rest)) {
    return null;
  }
  return rest;
};

/** Walks a possibly-nested colour object, e.g. `paper.raised`. */
const lookup = (name) => {
  if (name in colors) return true;

  // Try every `-` boundary as a nesting separator:
  // `paper-raised` -> paper.raised, `brass-600` -> brass.600
  const parts = name.split('-');
  for (let i = parts.length - 1; i > 0; i--) {
    const head = parts.slice(0, i).join('-');
    const tail = parts.slice(i).join('-');
    if (head in colors) {
      const value = colors[head];
      if (value && typeof value === 'object') {
        if (tail === 'DEFAULT' || tail in value) return true;
      }
    }
  }
  return false;
};

const resolves = (token) => {
  const part = colourPart(token);
  if (!part) return true;
  // Strip an /opacity suffix; only flat colours take one, but a DEFAULT key
  // makes the base name flat, and the check is about existence, not validity.
  return lookup(part.split('/')[0]);
};

// ------------------------------------------------------------------- files

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'design-system' || entry === 'assets') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (['.tsx', '.ts', '.css'].includes(extname(full))) out.push(full);
  }
  return out;
};

// Utilities whose "colour" argument looks like a colour name. Deliberately
// narrow so `text-sm`, `border-b` and `rounded-lg` are not flagged.
const UTILITY = new RegExp(
  [
    // colour utilities: bg-, text-, border-*, ring-*, fill-, stroke-,
    // divide-*, from-, via-, to-, outline-, shadow-{named}, placeholder-, etc.
    '\\b(?:bg|text|border|ring|ring-offset|border-[trblxy]|divide|fill|stroke|outline|from|via|to|placeholder|decoration|accent|caret|shadow)-(?!\\d)',
    '[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:/\\d{1,3})?',
    // word boundary so we don't match inside a longer class
  ].join(''),
  'g'
);

// Things that look like colour utilities but are not colour references.
const NOT_COLOURS = new Set([
  // text alignment / size / decoration
  'text-left', 'text-right', 'text-center', 'text-justify',
  'text-xs', 'text-sm', 'text-base', 'text-md', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl',
  'text-2xs', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl',
  'text-wrap', 'text-nowrap', 'text-balance', 'text-ellipsis', 'text-clip',
  'text-opacity',
  // borders
  'border', 'border-none', 'border-solid', 'border-dashed', 'border-dotted',
  'border-collapse', 'border-separate', 'border-spacing',
  'border-radius', 'border-spacing-x', 'border-spacing-y',
  // rings
  'ring', 'ring-inset', 'ring-offset',
  // shadows
  'shadow-inner', 'shadow-none',
  // backgrounds
  'bg-cover', 'bg-contain', 'bg-center', 'bg-top', 'bg-bottom',
  'bg-repeat', 'bg-no-repeat', 'bg-fixed', 'bg-local', 'bg-scroll',
  'bg-opacity', 'bg-none',
  // outlines
  'outline-dashed', 'outline-dotted', 'outline-none',
  // misc
  'placeholder-none', 'from-none', 'to-none', 'via-none',
  'divide-none', 'divide-x', 'divide-y', 'divide-x-reverse', 'divide-y-reverse',
  'fill-current', 'stroke-current', 'stroke-none',
]);

/**
 * Plain CSS properties, which share a prefix with utilities
 * (`border-radius`, `text-rendering`, `outline-offset`, `ring-offset-*`).
 * These appear inside `@layer base` and are not Tailwind classes.
 */
const CSS_PROPERTIES = new Set([
  // border-* sides are CSS properties; the colour utility is order-border`r
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'text-rendering', 'text-size-adjust', 'text-overflow', 'text-underline-offset',
  'outline-offset', 'outline-width', 'outline-color', 'outline-style',
  'ring-offset-width', 'ring-offset-color',
  'border-image', 'border-image-source', 'border-image-slice',
  // `border-color: …` written as a declaration, not a utility class.
  'border-color',
]);

const problems = [];
const files = walk(SRC);

for (const file of files) {
  const rel = file.replace(ROOT + '\\', '').replace(ROOT + '/', '');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);

lines.forEach((line, i) => {
    /*
     * Strip comments, and -- in .css only -- declarations, before extracting.
     *
     * Without this the linter reads prose as code. Two real examples from this
     * repo: a doc comment reading "The accent-gold action" was reported as an
     * unresolvable `accent-gold` utility, and the declaration
     * `--text-md: 0.9375rem` was reported as a `text-md` colour.
     *
     * The declaration strip is deliberately scoped to `.css`. Applied to TSX it
     * also ate the spaces between adjacent class names -- `bg-card hidden` came
     * out as `bg-cardhidden` -- because a property-shaped regex matches too much
     * of a class attribute. A linter that cries wolf gets ignored, which is
     * worse than not having one.
     */
    const isCss = file.endsWith('.css');
    const stripped = line
      .replace(/\/\*.*?\*\//g, '')        // block comment, same line
      .replace(/^[ \t]*\*[ \t].*$/, '')   // block-comment continuation
      .replace(/\/\/.*$/, '')             // line comment
      .replace(isCss ? /--[\w-]+\s*:/g : /$^/, '')
      .replace(isCss ? /^[ \t]*[-a-z]+\s*:/gm : /$^/, '');

    for (const match of stripped.matchAll(UTILITY)) {
      const token = match[0];
      const bare = token.split('/')[0];

      if (NOT_COLOURS.has(bare) || NOT_COLOURS.has(token)) continue;
      if (CSS_PROPERTIES.has(bare) || CSS_PROPERTIES.has(token)) continue;

      // `ring-offset-background` names the ring's offset colour, which lives in
      // the same palette as everything else -- no special case needed.
      if (token.startsWith('shadow-')) {
        const name = token.replace(/^shadow-/, '');
        if (name in customShadows) continue;
        if (['sm', 'md', 'lg', 'xl', '2xl', 'inner', 'none'].includes(name)) continue;
      }

      if (resolves(token)) continue;

      problems.push({ file: rel, line: i + 1, token, text: line.trim() });
    }
  });
}

console.log(`Scanned ${files.length} files against ${Object.keys(colors).length} colour keys.\n`);

if (problems.length === 0) {
  console.log('OK — every colour utility resolves.');
  process.exit(0);
}

// Collapse repeats of the same token into one line of advice.
const byToken = new Map();
for (const p of problems) {
  if (!byToken.has(p.token)) byToken.set(p.token, []);
  byToken.get(p.token).push(p);
}

console.log(`${problems.length} unresolvable colour utilities (${byToken.size} distinct):\n`);
for (const [token, hits] of [...byToken.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${token}  (${hits.length})`);
  for (const h of hits.slice(0, 3)) {
    console.log(`      ${h.file}:${h.line}`);
  }
  if (hits.length > 3) console.log(`      ... and ${hits.length - 3} more`);
}

process.exit(1);
