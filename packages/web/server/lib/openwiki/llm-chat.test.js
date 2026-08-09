import { describe, expect, it } from 'vitest';
import {
  anthropicResponseToOpenai,
  buildOpenaiCompatibleForwardBody,
  googleResponseToOpenai,
  openaiBodyToAnthropic,
  openaiBodyToGoogle,
  openaiBodyToResponses,
  responsesPayloadToOpenai,
} from './llm-chat.js';

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

describe('openaiBodyToGoogle', () => {
  it('maps tools and function responses by call id', () => {
    const body = openaiBodyToGoogle({
      modelID: 'gemini-2.5-flash',
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
          { role: 'tool', tool_call_id: 'call_1', content: '{"files":["a.txt"]}' },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'ls',
            description: 'list',
            parameters: { type: 'object', properties: { path: { type: 'string' } }, additionalProperties: false },
          },
        }],
      },
    });
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.tools[0].functionDeclarations[0].name).toBe('ls');
    expect(body.tools[0].functionDeclarations[0].parameters.additionalProperties).toBeUndefined();
    expect(body.contents[1].role).toBe('model');
    expect(body.contents[1].parts[0].functionCall.name).toBe('ls');
    expect(body.contents[2].parts[0].functionResponse.name).toBe('ls');
  });
});

describe('googleResponseToOpenai', () => {
  it('maps functionCall parts to tool_calls', () => {
    const completion = googleResponseToOpenai({
      candidates: [{
        content: {
          parts: [
            { text: 'working' },
            { functionCall: { name: 'read_file', args: { path: 'a.md' } } },
          ],
        },
      }],
    }, 'gemini-2.5-flash');
    expect(completion.choices[0].finish_reason).toBe('tool_calls');
    expect(completion.choices[0].message.tool_calls[0].function.name).toBe('read_file');
  });
});

describe('buildOpenaiCompatibleForwardBody', () => {
  it('forces stream false and drops stream_options', () => {
    const forward = buildOpenaiCompatibleForwardBody({
      body: {
        model: 'client-model',
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0.2,
        messages: [{ role: 'user', content: 'hi' }],
      },
      modelID: 'forced-model',
      messages: [{ role: 'user', content: 'patched' }],
    });
    expect(forward.stream).toBe(false);
    expect(forward.stream_options).toBeUndefined();
    expect(forward.model).toBe('forced-model');
    expect(forward.messages).toEqual([{ role: 'user', content: 'patched' }]);
    expect(forward.temperature).toBe(0.2);
  });
});

describe('openaiBodyToResponses / responsesPayloadToOpenai', () => {
  it('round-trips tool calls', () => {
    const body = openaiBodyToResponses({
      modelID: 'gpt-5',
      body: {
        messages: [
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
          { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
        ],
        tools: [{
          type: 'function',
          function: { name: 'ls', description: 'list', parameters: { type: 'object', properties: {} } },
        }],
      },
    });
    expect(body.tools[0].name).toBe('ls');
    expect(body.input.some((item) => item.type === 'function_call')).toBe(true);
    expect(body.input.some((item) => item.type === 'function_call_output')).toBe(true);

    const completion = responsesPayloadToOpenai({
      id: 'resp_1',
      output: [{
        type: 'function_call',
        call_id: 'call_2',
        name: 'read_file',
        arguments: '{"path":"a.md"}',
      }],
    }, 'gpt-5');
    expect(completion.choices[0].finish_reason).toBe('tool_calls');
    expect(completion.choices[0].message.tool_calls[0].function.name).toBe('read_file');
  });
});
