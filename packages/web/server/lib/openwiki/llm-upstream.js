import { readAuthFile } from '../opencode/auth.js';
import { readConfig } from '../opencode/shared.js';
import { getCatalogProvider, getModelCatalog } from '../small-model/catalog.js';
import { resolveProviderLogin } from '../small-model/call.js';

export const OPENCODE_ZEN_BASE_URL = 'https://opencode.ai/zen/v1';

/**
 * @param {string} providerID
 */
export const isOpenCodeZenProvider = (providerID) =>
  providerID === 'opencode' || providerID === 'opencode-go';

/**
 * Free-tier OpenCode/Zen models that OpenCode may call without a stored API key.
 * Outside OpenCode they still hit zen/v1; auth may be optional for these ids.
 * @param {string} modelID
 */
export const isLikelyFreeOpenCodeModel = (modelID) => {
  const id = String(modelID || '').toLowerCase();
  if (!id) return false;
  if (id.includes('free')) return true;
  // Common OpenCode free defaults
  return id === 'big-pickle' || id === 'gpt-5-nano';
};

/**
 * @param {object | null | undefined} entry
 */
export const extractApiKey = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.key === 'string' && entry.key.trim()) return entry.key.trim();
  if (typeof entry.access === 'string' && entry.access.trim()) return entry.access.trim();
  if (typeof entry.token === 'string' && entry.token.trim()) return entry.token.trim();
  if (typeof entry.refresh === 'string' && entry.refresh.trim()) return entry.refresh.trim();
  return null;
};

/**
 * @param {string} workingDirectory
 * @param {string} providerID
 */
const readProviderOptions = (workingDirectory, providerID) => {
  try {
    const config = readConfig(workingDirectory);
    const providerCfg = config?.provider?.[providerID];
    if (!providerCfg || typeof providerCfg !== 'object') {
      return { baseURL: null, apiKeyFromConfig: null };
    }
    const baseURL = typeof providerCfg?.options?.baseURL === 'string'
      ? providerCfg.options.baseURL.trim() || null
      : null;
    const apiKeyFromConfig = typeof providerCfg?.options?.apiKey === 'string'
      ? providerCfg.options.apiKey.trim() || null
      : null;
    return { baseURL, apiKeyFromConfig };
  } catch {
    return { baseURL: null, apiKeyFromConfig: null };
  }
};

/**
 * Whether the OpenWiki LLM gateway can attempt this model (preflight / hasLogin).
 * @param {{ directory: string, model: { providerID: string, modelID: string } }} input
 */
export const canUseOpenWikiGatewayModel = ({ directory, model }) => {
  try {
    resolveLlmUpstream({ directory, model });
    return true;
  } catch {
    return false;
  }
};

/**
 * Resolve where the gateway should forward OpenAI-format chat/completions.
 *
 * @param {{
 *   directory: string,
 *   model: { providerID: string, modelID: string },
 *   catalog?: object | null,
 * }} input
 * @returns {{
 *   kind: 'openai-compatible' | 'anthropic',
 *   providerID: string,
 *   modelID: string,
 *   baseURL: string,
 *   headers: Record<string, string>,
 *   anonymous?: boolean,
 * }}
 */
export const resolveLlmUpstream = ({ directory, model, catalog = null }) => {
  if (!model?.providerID || !model?.modelID) {
    throw Object.assign(new Error('Model is required'), {
      statusCode: 400,
      code: 'model-required',
    });
  }

  const providerID = model.providerID;
  const modelID = model.modelID;
  const auth = readAuthFile();
  const login = resolveProviderLogin({
    auth,
    workingDirectory: directory,
    providerID,
  });
  const { baseURL: configBaseURL, apiKeyFromConfig } = readProviderOptions(directory, providerID);
  const apiKey = apiKeyFromConfig || extractApiKey(login);

  // ChatGPT OAuth speaks Responses API, not chat-completions + tools for OpenWiki.
  if (providerID === 'openai' && login?.type === 'oauth' && !configBaseURL) {
    throw Object.assign(
      new Error('OpenAI ChatGPT OAuth is not supported for OpenWiki yet. Choose an API-key provider or OpenCode Zen.'),
      { statusCode: 400, code: 'provider-unsupported-for-openwiki', providerID },
    );
  }

  if (providerID === 'anthropic' && apiKey && !configBaseURL) {
    return {
      kind: 'anthropic',
      providerID,
      modelID,
      baseURL: 'https://api.anthropic.com/v1',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    };
  }

  if (isOpenCodeZenProvider(providerID)) {
    const zenBase = (configBaseURL || OPENCODE_ZEN_BASE_URL).replace(/\/+$/, '');
    if (apiKey) {
      return {
        kind: 'openai-compatible',
        providerID,
        modelID,
        baseURL: zenBase,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
      };
    }
    if (isLikelyFreeOpenCodeModel(modelID)) {
      return {
        kind: 'openai-compatible',
        providerID,
        modelID,
        baseURL: zenBase,
        headers: {
          'content-type': 'application/json',
          'user-agent': 'opencode/1.0 openchamber',
        },
        anonymous: true,
      };
    }
    throw Object.assign(
      new Error('Built-in OpenCode/Zen free models cannot run OpenWiki without an API key. Connect OpenCode Zen or pick another logged-in provider.'),
      { statusCode: 401, code: 'no-provider-login', providerID },
    );
  }

  if (!apiKey) {
    throw Object.assign(new Error(`No OpenCode login found for provider "${providerID}"`), {
      statusCode: 401,
      code: 'no-provider-login',
      providerID,
    });
  }

  if (providerID === 'google' || providerID === 'gemini') {
    throw Object.assign(
      new Error('Google/Gemini is not available through the OpenWiki gateway yet. Pick an OpenAI-compatible or Anthropic model.'),
      { statusCode: 400, code: 'provider-unsupported-for-openwiki', providerID },
    );
  }

  if (providerID === 'github-copilot') {
    throw Object.assign(
      new Error('GitHub Copilot is not available through the OpenWiki gateway yet. Pick another logged-in model.'),
      { statusCode: 400, code: 'provider-unsupported-for-openwiki', providerID },
    );
  }

  let baseURL = configBaseURL;
  if (!baseURL) {
    const catalogEntry = getCatalogProvider(catalog, providerID);
    if (typeof catalogEntry?.api === 'string' && catalogEntry.api.trim()) {
      baseURL = catalogEntry.api.trim();
    } else if (providerID === 'openai') {
      baseURL = 'https://api.openai.com/v1';
    } else if (providerID === 'openrouter') {
      baseURL = 'https://openrouter.ai/api/v1';
    }
  }

  if (!baseURL) {
    throw Object.assign(
      new Error(`Provider "${providerID}" has no known API base URL for the OpenWiki gateway.`),
      { statusCode: 400, code: 'provider-unsupported-for-openwiki', providerID },
    );
  }

  return {
    kind: 'openai-compatible',
    providerID,
    modelID,
    baseURL: baseURL.replace(/\/+$/, ''),
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
  };
};

/**
 * Async wrapper that loads the models catalog only when base URL lookup needs it.
 * Avoids blocking OpenWiki job start on a slow/unreachable models.dev fetch.
 * @param {{ directory: string, model: { providerID: string, modelID: string } }} input
 */
export const resolveLlmUpstreamAsync = async (input) => {
  try {
    return resolveLlmUpstream({ ...input, catalog: null });
  } catch (error) {
    const needsCatalog = error?.code === 'provider-unsupported-for-openwiki'
      || (error instanceof Error && /no known API base URL/i.test(error.message));
    if (!needsCatalog) throw error;
  }

  let catalog = null;
  try {
    catalog = await getModelCatalog();
  } catch {
    catalog = null;
  }
  return resolveLlmUpstream({ ...input, catalog });
};
