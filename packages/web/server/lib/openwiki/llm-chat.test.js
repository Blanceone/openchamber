import { describe, expect, it } from 'vitest';
import { anthropicResponseToOpenai, openaiBodyToAnthropic } from './llm-chat.js';

describe('openaiBodyToAnthropic', () => {
  it('maps tools and tool results', () => {
    const body = openaiBodyToAnthropic({
      modelID: 'claude-opus-4',
      body: {
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: { name: 'ls', arguments: '{"path":"."}' },
            }],
          },
          { role: 'tool', tool_call_id: 'call_1', content: 'a.txt' },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'ls',
            description: 'list',
            parameters: { type: 'object', properties: { path: { type: 'string' } } },
          },
        }],
        max_tokens: 100,
      },
    });
    expect(body.model).toBe('claude-opus-4');
    expect(body.system).toBe('sys');
    expect(body.tools[0].name).toBe('ls');
    expect(body.messages[0]).toEqual({ role: 'user', content: 'hi' });
    expect(body.messages[1].role).toBe('assistant');
    expect(body.messages[1].content[0].type).toBe('tool_use');
    expect(body.messages[2].role).toBe('user');
    expect(body.messages[2].content[0].type).toBe('tool_result');
  });
});

describe('anthropicResponseToOpenai', () => {
  it('maps tool_use stop to tool_calls', () => {
    const completion = anthropicResponseToOpenai({
      id: 'msg_1',
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'working' },
        { type: 'tool_use', id: 'tu_1', name: 'read_file', input: { path: 'a.md' } },
      ],
    }, 'claude-opus-4');
    expect(completion.choices[0].finish_reason).toBe('tool_calls');
    expect(completion.choices[0].message.tool_calls[0].function.name).toBe('read_file');
    expect(completion.choices[0].message.content).toBe('working');
  });
});
