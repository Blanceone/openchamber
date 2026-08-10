import { describe, expect, it } from 'vitest';
import { parseDraftMarkers } from './format-parse.js';
import { getPresetBodies } from './presets.js';

describe('OpenWiki format parse helpers', () => {
  it('parses INSTRUCTIONS/FORMAT marker blocks', () => {
    const text = [
      'noise',
      '<<<OPENCHAMBER_INSTRUCTIONS>>>',
      'Brief line',
      '<<<OPENCHAMBER_FORMAT>>>',
      '# Format',
      '- Mermaid',
      '<<<OPENCHAMBER_END>>>',
      'tail',
    ].join('\n');
    expect(parseDraftMarkers(text)).toEqual({
      instructions: 'Brief line',
      format: '# Format\n- Mermaid',
    });
  });

  it('returns null when markers are incomplete', () => {
    expect(parseDraftMarkers('no markers')).toBeNull();
    expect(parseDraftMarkers('<<<OPENCHAMBER_INSTRUCTIONS>>>\nonly')).toBeNull();
  });

  it('seeds defaults with Mermaid diagram rules', () => {
    const bodies = getPresetBodies('openwiki-default');
    expect(bodies.format).toContain('Mermaid');
  });
});
