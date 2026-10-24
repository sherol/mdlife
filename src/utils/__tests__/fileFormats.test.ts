import { describe, expect, it } from 'vitest';
import {
  fileExtension,
  folderAllowsAltFormats,
  formatJsonLosslessly,
  getFileTaskProgress,
  getFileFormat,
  getTemplateForFormat,
  mimeTypeForFile,
  normalizeFileName,
  parseJsonContent,
  stripFileExtension,
} from '../fileFormats';

describe('getFileFormat', () => {
  it('detects JSON and plain text by extension, anything else is markdown', () => {
    expect(getFileFormat('data.json')).toBe('json');
    expect(getFileFormat('DATA.JSON')).toBe('json');
    expect(getFileFormat('notes.txt')).toBe('text');
    expect(getFileFormat('plan.md')).toBe('markdown');
    expect(getFileFormat('plan')).toBe('markdown');
  });

  it('maps formats to extensions and mime types', () => {
    expect(fileExtension('a.json')).toBe('.json');
    expect(fileExtension('a.md')).toBe('.md');
    expect(mimeTypeForFile('a.json')).toBe('application/json');
    expect(mimeTypeForFile('a.txt')).toBe('text/plain');
    expect(mimeTypeForFile('a.md')).toBe('text/markdown');
  });
});

describe('folderAllowsAltFormats', () => {
  it('allows only the projects folder and its sub-folders', () => {
    expect(folderAllowsAltFormats('projects')).toBe(true);
    expect(folderAllowsAltFormats('projects/app')).toBe(true);
    expect(folderAllowsAltFormats('Projects/app')).toBe(true);
    expect(folderAllowsAltFormats('notes')).toBe(false);
    expect(folderAllowsAltFormats('archive/projects')).toBe(false);
    expect(folderAllowsAltFormats('')).toBe(false);
  });
});

describe('normalizeFileName', () => {
  it('keeps .json / .txt in projects', () => {
    expect(normalizeFileName('data.json', 'projects/app')).toBe('data.json');
    expect(normalizeFileName(' log.txt ', 'projects')).toBe('log.txt');
  });

  it('adds .md outside projects and for names without an extension', () => {
    expect(normalizeFileName('data.json', 'notes')).toBe('data.json.md');
    expect(normalizeFileName('plan', 'projects/app')).toBe('plan.md');
    expect(normalizeFileName('plan.md', 'goals')).toBe('plan.md');
  });
});

describe('stripFileExtension', () => {
  it('removes the format extension only', () => {
    expect(stripFileExtension('a.md')).toBe('a');
    expect(stripFileExtension('a.json')).toBe('a');
    expect(stripFileExtension('a.txt')).toBe('a');
    expect(stripFileExtension('a.csv')).toBe('a.csv');
  });
});

describe('parseJsonContent', () => {
  it('parses valid JSON', () => {
    expect(parseJsonContent('{"a": [1, 2]}')).toEqual({ ok: true, value: { a: [1, 2] } });
  });

  it('reports invalid and empty content', () => {
    const bad = parseJsonContent('{"a": }');
    expect(bad.ok).toBe(false);
    expect(parseJsonContent('  ')).toEqual({ ok: false, error: 'The file is empty.' });
  });

  it('starter templates are valid', () => {
    expect(parseJsonContent(getTemplateForFormat('json', 'My "Data"')).ok).toBe(true);
    expect(getTemplateForFormat('text', 'Hello')).toBe('Hello\n');
  });
});

describe('formatJsonLosslessly', () => {
  const fmt = (content: string) => formatJsonLosslessly(content, JSON.parse(content));

  it('re-indents JSON when only whitespace changes', () => {
    expect(fmt('{"a":[1, 2],  "b": " x y "}')).toBe(
      '{\n  "a": [\n    1,\n    2\n  ],\n  "b": " x y "\n}\n',
    );
    expect(fmt('{"s": "quote \\" and \\\\ backslash"}')).not.toBeNull();
  });

  it('refuses when re-serializing would change the data', () => {
    expect(fmt('{"id": 12345678901234567890}')).toBeNull(); // precision loss
    expect(fmt('{"a": 1, "a": 2}')).toBeNull(); // duplicate key
    expect(fmt('{"n": 1.0}')).toBeNull(); // number spelling
    expect(fmt('{"n": 1e2}')).toBeNull();
    expect(fmt('{"s": "\\u00e9"}')).toBeNull(); // escape spelling
  });
});

describe('getFileTaskProgress', () => {
  it('counts tasks in markdown only', () => {
    const content = '- [ ] a\n- [x] b\n';
    expect(getFileTaskProgress({ name: 'p.md', content }).total).toBe(2);
    expect(getFileTaskProgress({ name: 'log.txt', content }).total).toBe(0);
    expect(getFileTaskProgress({ name: 'd.json', content }).total).toBe(0);
  });
});
