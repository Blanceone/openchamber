import { describe, expect, it } from 'vitest';
import { buildFormatUserMessage } from './format.js';
import { OPENWIKI_DOCUMENT_LANGUAGE, OPENWIKI_DOCUMENT_LANGUAGE_PROMPT } from './language.js';
import { getPresetBodies } from './presets.js';

describe('OpenWiki fixed document language', () => {
  it('exports zh-CN as the product language', () => {
    expect(OPENWIKI_DOCUMENT_LANGUAGE).toBe('zh-CN');
  });

  it('always injects the Chinese language mandate into the user message', () => {
    const message = buildFormatUserMessage({ instructions: '', format: '' });
    expect(message.startsWith(OPENWIKI_DOCUMENT_LANGUAGE_PROMPT)).toBe(true);
    expect(message).toContain('Simplified Chinese');
  });

  it('seeds format presets with the Chinese language rule', () => {
    for (const id of ['openwiki-default', 'architecture-module', 'api-service', 'custom']) {
      const bodies = getPresetBodies(/** @type {any} */ (id));
      expect(bodies.format).toContain('Simplified Chinese');
      expect(bodies.format).toContain('Mermaid');
    }
  });
});
