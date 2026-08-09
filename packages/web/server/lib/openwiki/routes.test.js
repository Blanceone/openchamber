import { describe, expect, test, vi } from 'vitest';
import express from 'express';
import { registerOpenWikiRoutes } from './routes.js';

const createApp = (resolveProjectDirectory) => {
  const app = express();
  app.use(express.json());
  const handlers = new Map();
  const originalGet = app.get.bind(app);
  const originalPost = app.post.bind(app);
  app.get = (path, ...args) => {
    handlers.set(`GET ${path}`, args[args.length - 1]);
    return originalGet(path, ...args);
  };
  app.post = (path, ...args) => {
    handlers.set(`POST ${path}`, args[args.length - 1]);
    return originalPost(path, ...args);
  };

  registerOpenWikiRoutes(app, {
    resolveProjectDirectory,
    readOpenChamberSettings: async () => ({}),
  });

  return handlers;
};

const mockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('openwiki routes directory resolution', () => {
  test('status awaits resolveProjectDirectory(req) and returns ownership', async () => {
    const resolveProjectDirectory = vi.fn(async (req) => {
      expect(req.query.directory).toBe('D:/work/demo');
      return { directory: 'D:/work/demo', error: null };
    });
    const handlers = createApp(resolveProjectDirectory);
    const res = mockRes();
    await handlers.get('GET /api/openwiki/status')(
      { query: { directory: 'D:/work/demo' }, get: () => undefined },
      res,
    );

    expect(resolveProjectDirectory).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(res.body.projectDirectory).toBe('D:/work/demo');
    expect(res.body.ownership).toBe('absent');
    expect(typeof res.body.wikiRoot).toBe('string');
  });

  test('rejects when directory resolver returns a Promise-shaped miss', async () => {
    const handlers = createApp(async () => ({ directory: null, error: 'Directory parameter or active project is required' }));
    const res = mockRes();
    await handlers.get('GET /api/openwiki/status')(
      { query: {}, get: () => undefined },
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('directory-required');
  });

  test('POST generate projects body.directory onto the resolver', async () => {
    const resolveProjectDirectory = vi.fn(async (req) => {
      expect(req.query.directory).toBe('D:/work/demo');
      return { directory: 'D:/work/demo', error: null };
    });
    const handlers = createApp(resolveProjectDirectory);
    const res = mockRes();

    // Avoid starting a real job: expect model-required after directory resolves.
    await handlers.get('POST /api/openwiki/generate')(
      {
        body: { directory: 'D:/work/demo' },
        query: {},
        get: () => undefined,
      },
      res,
    );

    expect(resolveProjectDirectory).toHaveBeenCalledOnce();
    // Without a model this fails closed after directory resolution — not a Promise path error.
    expect(String(res.body?.error || '')).not.toMatch(/Received an instance of Promise/i);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  test('POST consent is registered', async () => {
    const handlers = createApp(async () => ({ directory: 'D:/work/demo', error: null }));
    expect(typeof handlers.get('POST /api/openwiki/consent')).toBe('function');
  });
});
