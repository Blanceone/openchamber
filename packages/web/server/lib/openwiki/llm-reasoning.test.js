import { describe, expect, it } from 'vitest';
import { createReasoningContentStore } from './llm-reasoning.js';

describe('createReasoningContentStore', () => {
  it('reinjects reasoning_content for assistant tool_call turns', () => {
    const store = createReasoningContentStore();
    store.rememberFromCompletion({
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          reasoning_content: 'plan to list files',
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'ls', arguments: '{}' },
          }],
        },
      }],
    });

    const patched = store.patchMessages([
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'ls', arguments: '{}' },
        }],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'a.txt' },
    ]);

    expect(patched[1].reasoning_content).toBe('plan to list files');
    expect(patched[0].reasoning_content).toBeUndefined();
  });

  it('keeps an existing reasoning_content and remembers it', () => {
    const store = createReasoningContentStore();
    const patched = store.patchMessages([{
      role: 'assistant',
      content: null,
      reasoning_content: 'already here',
      tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'ls', arguments: '{}' } }],
    }]);
    expect(patched[0].reasoning_content).toBe('already here');

    const again = store.patchMessages([{
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'ls', arguments: '{}' } }],
    }]);
    expect(again[0].reasoning_content).toBe('already here');
  });

  it('falls back to empty string when nothing was captured', () => {
    const store = createReasoningContentStore();
    const patched = store.patchMessages([{
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'missing', type: 'function', function: { name: 'ls', arguments: '{}' } }],
    }]);
    expect(patched[0].reasoning_content).toBe('');
  });
});
