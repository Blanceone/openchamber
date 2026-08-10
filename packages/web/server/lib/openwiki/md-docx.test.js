import { describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import { markdownToDocxBuffer, markdownToDocxParagraphs } from './md-docx.js';

describe('OpenWiki markdown to docx', () => {
  it('renders headings and lists into OOXML paragraphs', () => {
    const xml = markdownToDocxParagraphs('# Title\n\n- item one\n');
    expect(xml).toContain('Title');
    expect(xml).toContain('• item one');
  });

  it('builds a valid docx zip with document.xml', () => {
    const buffer = markdownToDocxBuffer('# Hello\n\nBody text\n');
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry('word/document.xml');
    expect(entry).toBeTruthy();
    const xml = entry.getData().toString('utf8');
    expect(xml).toContain('Hello');
    expect(xml).toContain('Body text');
  });
});
