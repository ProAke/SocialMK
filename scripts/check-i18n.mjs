/**
 * Verifies that every statically referenced translation key exists in both
 * Thai and English dictionaries, and reports unused keys.
 * Usage: node scripts/check-i18n.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const i18nPath = path.join(root, 'apps/web/src/lib/i18n.tsx');
const source = fs.readFileSync(i18nPath, 'utf8');

const thStart = source.indexOf('const th: Record<string, string> = {');
const enStart = source.indexOf('const en: Record<string, string> = {');
const dictEnd = source.indexOf('const dictionaries');
const thBlock = source.slice(thStart, enStart);
const enBlock = source.slice(enStart, dictEnd);

function extractKeys(block) {
  const keys = new Set();
  for (const match of block.matchAll(/^\s*'([^']+)':/gm)) keys.add(match[1]);
  return keys;
}

const thKeys = extractKeys(thBlock);
const enKeys = extractKeys(enBlock);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !full.endsWith('i18n.tsx')) files.push(full);
  }
  return files;
}

const used = new Map();
for (const file of walk(path.join(root, 'apps/web/src'))) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/\bt\(\s*'([^']+)'/g)) {
    if (!used.has(match[1])) used.set(match[1], new Set());
    used.get(match[1]).add(path.relative(root, file));
  }
}

const missingTh = [...used.keys()].filter((key) => !thKeys.has(key));
const missingEn = [...used.keys()].filter((key) => !enKeys.has(key));
const unused = [...thKeys].filter((key) => !used.has(key));
const asymmetric = [...thKeys].filter((key) => !enKeys.has(key));

console.log(`keys: th ${thKeys.size} / en ${enKeys.size} · used ${used.size}`);
if (missingTh.length) console.log(`\n✗ missing in Thai (${missingTh.length}):\n${missingTh.map((k) => `  ${k}  ← ${[...(used.get(k) ?? [])].join(', ')}`).join('\n')}`);
if (missingEn.length) console.log(`\n✗ missing in English (${missingEn.length}):\n${missingEn.map((k) => `  ${k}`).join('\n')}`);
if (asymmetric.length) console.log(`\n! present in Thai only (${asymmetric.length}):\n${asymmetric.map((k) => `  ${k}`).join('\n')}`);
if (unused.length) console.log(`\n· unused keys (${unused.length}):\n  ${unused.join(', ')}`);
if (!missingTh.length && !missingEn.length) console.log('\n✓ all referenced keys are translated');
if (missingTh.length || missingEn.length) process.exitCode = 1;
