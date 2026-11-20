#!/usr/bin/env node
/**
 * i18n audit for the gym staff app (src/pages and src/components).
 *
 *   node scripts/i18n-audit.mjs              list every finding
 *   node scripts/i18n-audit.mjs --summary    counts per file only
 *   node scripts/i18n-audit.mjs --check      exit 1 on any finding (CI)
 *   node scripts/i18n-audit.mjs --dir=pages/sales   limit to a sub path of src/
 *
 * It reports three kinds of problem:
 *   missing-key   t('...') / tr('...') literal that has no Arabic entry in i18n/ar.js
 *   untranslated  static user-facing text that is not wrapped in t():
 *                 JSX text, text-like attributes (placeholder, title, aria-label, alt,
 *                 label ...), toast/confirm/alert messages, and label-like object
 *                 properties
 *   dictionary    conflicting duplicate keys, empty values, placeholder mismatches
 *
 * Silence a deliberate exception with `// i18n-ignore` on the same or previous line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as espree from 'espree';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../src');
const DEFAULT_DIRS = ['pages', 'components'];

const TEXT_ATTRS = new Set([
  'placeholder', 'title', 'aria-label', 'aria-description', 'alt', 'label', 'helperText',
  'description', 'hint', 'emptyText', 'subtitle', 'heading', 'confirmLabel', 'cancelLabel',
  'tooltip', 'message', 'emptyMessage', 'loadingText', 'submitLabel',
]);
const LABEL_KEYS = new Set([
  'label', 'title', 'description', 'placeholder', 'message', 'text', 'heading', 'subtitle',
  'hint', 'emptyText', 'tooltip', 'header', 'cta', 'confirmLabel', 'emptyMessage',
]);
const TOAST_METHODS = new Set(['success', 'error', 'loading', 'custom', 'info', 'warn', 'warning']);
const MESSAGE_SETTER = /^set(Error|Err|Msg|Message|Notice|Feedback|Success|Warning|Status(Message)?)\w*$/;
/** Words that stay in Latin script in Arabic UI. */
const KEEP = new Set([
  'forma', 'whatsapp', 'egp', 'pdf', 'csv', 'qr', 'excel', 'sms', 'instagram', 'facebook', 'id', 'url',
  'api', 'vat', 'ok', 'tiktok', 'google', 'meta', 'messenger', 'xlsx', 'sku', 'iban', 'email', 'e-mail',
]);

const HAS_LETTER = /[A-Za-z]/;
const HAS_ARABIC = /[\u0600-\u06FF]/;

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.(jsx?|mjs)$/.test(entry.name) && !/\.(test|stress\.test)\.jsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function walk(node, parent, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((child) => child && walk(child, node, visit));
    else if (value && typeof value.type === 'string') walk(value, node, visit);
  }
}

function isTranslateCall(node) {
  return node.type === 'CallExpression' && node.callee.type === 'Identifier'
    && (node.callee.name === 't' || node.callee.name === 'tr');
}

function literalText(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.cooked).join('{}');
  return null;
}

/** String literals a JSX child / message expression can render directly. */
function stringsIn(expr, out = []) {
  if (!expr) return out;
  switch (expr.type) {
    case 'Literal':
    case 'TemplateLiteral':
      if (literalText(expr) != null) out.push(expr);
      break;
    case 'ConditionalExpression':
      stringsIn(expr.consequent, out);
      stringsIn(expr.alternate, out);
      break;
    case 'LogicalExpression':
      stringsIn(expr.right, out);
      if (expr.operator !== '&&') stringsIn(expr.left, out);
      break;
    default:
  }
  return out;
}

function isHumanText(text) {
  const s = String(text).replace(/\s+/g, ' ').trim();
  if (!s || !HAS_LETTER.test(s) || HAS_ARABIC.test(s)) return false;
  if (/^&\w+;$/.test(s)) return false;
  const words = s.toLowerCase().split(/[^a-z-]+/).filter(Boolean);
  if (words.length && words.every((w) => KEEP.has(w))) return false;
  return true;
}

/** For object properties we only flag text that reads like a sentence/label, not an id. */
function looksLikeLabel(text) {
  const s = text.trim();
  return isHumanText(s) && (/\s/.test(s) || /^[A-Z]/.test(s));
}

function loadPlaceholders(text) {
  return [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
}

export async function loadDictionary() {
  const mod = await import(pathToFileURL(path.join(SRC, 'i18n/ar.js')).href);
  return { AR: mod.default, modules: mod.AR_MODULES };
}

export function checkDictionary(modules) {
  const problems = [];
  const seen = new Map();
  for (const [name, dict] of Object.entries(modules)) {
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== 'string' || !value.trim()) problems.push(`${name}: empty value for "${key}"`);
      if (loadPlaceholders(key) !== loadPlaceholders(value)) {
        problems.push(`${name}: placeholder mismatch for "${key}" -> "${value}"`);
      }
      if (seen.has(key) && seen.get(key).value !== value) {
        problems.push(`"${key}" has conflicting translations in ${seen.get(key).name} and ${name}`);
      }
      if (!seen.has(key)) seen.set(key, { name, value });
    }
  }
  return problems;
}

export function auditSource(source, file, AR) {
  const findings = [];
  const lines = source.split(/\r?\n/);
  const ignored = (line) => /i18n-ignore/.test(lines[line - 1] || '') || /i18n-ignore/.test(lines[line - 2] || '');
  const add = (kind, node, text) => {
    const line = node.loc.start.line;
    if (!ignored(line)) findings.push({ kind, file, line, text: String(text).replace(/\s+/g, ' ').trim().slice(0, 90) });
  };

  let ast;
  try {
    ast = espree.parse(source, {
      ecmaVersion: 'latest', sourceType: 'module', loc: true, ecmaFeatures: { jsx: true },
    });
  } catch (err) {
    findings.push({ kind: 'parse-error', file, line: err.lineNumber || 0, text: err.message });
    return findings;
  }

  walk(ast, null, (node, parent) => {
    // Dictionary keys
    if (isTranslateCall(node)) {
      const arg = node.arguments[0];
      if (!arg) return;
      const text = arg.type === 'Literal' || (arg.type === 'TemplateLiteral' && arg.expressions.length === 0)
        ? (arg.type === 'Literal' ? arg.value : arg.quasis[0].value.cooked)
        : null;
      if (typeof text === 'string') {
        if (HAS_LETTER.test(text) && !AR[text]) add('missing-key', arg, text);
      } else if (arg.type === 'TemplateLiteral') {
        add('dynamic-key', arg, 'template literal with ${} passed to t(); use {placeholders} and vars');
      }
      return;
    }

    // JSX text
    if (node.type === 'JSXText') {
      if (isHumanText(node.value)) add('untranslated', node, node.value);
      return;
    }

    // Text-like attributes
    if (node.type === 'JSXAttribute' && node.name.type === 'JSXIdentifier' && TEXT_ATTRS.has(node.name.name)) {
      const v = node.value;
      const exprs = !v ? [] : v.type === 'Literal' ? [v] : v.type === 'JSXExpressionContainer' ? stringsIn(v.expression) : [];
      for (const e of exprs) {
        const text = literalText(e);
        if (isHumanText(text)) add('untranslated', e, `${node.name.name}="${text}"`);
      }
      return;
    }

    // {cond ? 'Yes' : 'No'} rendered as a child
    if (node.type === 'JSXExpressionContainer' && parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment')) {
      for (const e of stringsIn(node.expression)) {
        const text = literalText(e);
        if (isHumanText(text)) add('untranslated', e, text);
      }
      return;
    }

    // toast / confirm / alert / setError('...')
    if (node.type === 'CallExpression') {
      const c = node.callee;
      const name = c.type === 'Identifier' ? c.name : null;
      const isToast = (name === 'toast')
        || (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'toast'
          && c.property.type === 'Identifier' && TOAST_METHODS.has(c.property.name));
      const isDialog = name === 'confirm' || name === 'alert'
        || (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'window'
          && c.property.type === 'Identifier' && (c.property.name === 'confirm' || c.property.name === 'alert'));
      const isSetter = name && MESSAGE_SETTER.test(name);
      if (isToast || isDialog || isSetter) {
        for (const e of stringsIn(node.arguments[0])) {
          const text = literalText(e);
          if (isHumanText(text)) add('untranslated', e, text);
        }
      }
      return;
    }

    // { label: 'Text' } style data
    if (node.type === 'Property' && !node.computed && node.key
      && (node.key.type === 'Identifier' || node.key.type === 'Literal')) {
      const key = node.key.name || node.key.value;
      if (LABEL_KEYS.has(key)) {
        for (const e of stringsIn(node.value)) {
          const text = literalText(e);
          if (looksLikeLabel(text)) add('untranslated', e, `${key}: '${text}'`);
        }
      }
    }
  });

  return findings;
}

export async function runAudit({ dirs = DEFAULT_DIRS } = {}) {
  const { AR, modules } = await loadDictionary();
  const files = dirs.flatMap((d) => {
    const full = path.join(SRC, d);
    if (!fs.existsSync(full)) return [];
    return fs.statSync(full).isDirectory() ? walkFiles(full) : [full];
  });
  const findings = [];
  for (const file of files) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    findings.push(...auditSource(fs.readFileSync(file, 'utf8'), rel, AR));
  }
  const dictionary = checkDictionary(modules);
  return { findings, dictionary, files: files.length };
}

async function main() {
  const args = process.argv.slice(2);
  const dirArg = args.find((a) => a.startsWith('--dir='));
  const dirs = dirArg ? [dirArg.slice(6)] : DEFAULT_DIRS;
  const { findings, dictionary, files } = await runAudit({ dirs });

  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }

  if (args.includes('--summary')) {
    [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)
      .forEach(([file, list]) => console.log(`${String(list.length).padStart(5)}  ${file}`));
  } else {
    for (const [file, list] of byFile) {
      console.log(`\n${file}`);
      list.forEach((f) => console.log(`  ${String(f.line).padStart(5)}  ${f.kind.padEnd(12)} ${f.text}`));
    }
  }
  dictionary.forEach((p) => console.log(`dictionary: ${p}`));

  const counts = findings.reduce((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] || 0) + 1 }), {});
  console.log(`\nScanned ${files} files. Findings: ${findings.length} ${JSON.stringify(counts)}; dictionary problems: ${dictionary.length}`);
  if (args.includes('--check') && (findings.length || dictionary.length)) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
