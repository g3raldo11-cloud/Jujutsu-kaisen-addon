import Anthropic from '@anthropic-ai/sdk';
import type { AppContext } from '../lib/context';
import { decryptSecret } from '../lib/crypto';

export interface AiBotConfig {
  model?: string;
  systemPrompt?: string;
  effort?: 'low' | 'medium' | 'high';
  dailyLimitPerUser?: number;
}

let client: { key: string; base?: string; instance: Anthropic } | null = null;

/** The API key never leaves the server: env var or the owner-configured key stored encrypted. */
async function getClient(ctx: AppContext) {
  const stored = await ctx.settings.getSecret('ai_api_key');
  const key = stored ? decryptSecret(ctx.config.APP_SECRET, stored) : ctx.config.AI_API_KEY;
  if (!key) return null;
  if (!client || client.key !== key || client.base !== ctx.config.AI_BASE_URL) {
    client = { key, base: ctx.config.AI_BASE_URL, instance: new Anthropic({ apiKey: key, baseURL: ctx.config.AI_BASE_URL, timeout: 90_000, maxRetries: 2 }) };
  }
  return client.instance;
}

export type AiAnswer = { ok: true; text: string } | { ok: false; error: string };

export async function askClaude(ctx: AppContext, conf: AiBotConfig, question: string, asker: string): Promise<AiAnswer> {
  const anthropic = await getClient(ctx);
  if (!anthropic) return { ok: false, error: 'O bot de IA ainda não foi configurado. O proprietário precisa cadastrar a chave da API no painel administrativo.' };
  const s = await ctx.settings.get();
  const system =
    (conf.systemPrompt?.trim() ||
      `Você é o assistente da comunidade privada "${s.communityName}". Responda em português do Brasil, de forma clara e direta, em no máximo três parágrafos curtos. Use Markdown simples quando ajudar. Se não souber algo sobre a comunidade, diga que não sabe.`) +
    `\n\nA pergunta foi feita por @${asker} em um canal da comunidade.`;
  try {
    const response = await anthropic.beta.messages.create({
      model: conf.model || ctx.config.AI_MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: question }],
      output_config: { effort: conf.effort ?? 'medium' },
      // Server-side fallback re-runs a declined request on a suitable model within the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (response.stop_reason === 'refusal') {
      return { ok: false, error: 'Não posso ajudar com esse pedido.' };
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) return { ok: false, error: 'Não recebi uma resposta. Tente reformular a pergunta.' };
    return { ok: true, text: response.stop_reason === 'max_tokens' ? `${text}\n\n_(resposta interrompida)_` : text };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      ctx.log.error({ status: err.status }, 'AI bot: invalid credentials');
      return { ok: false, error: 'A chave da API configurada é inválida. Avise a administração.' };
    }
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: 'Muitas perguntas no momento. Tente novamente em instantes.' };
    if (err instanceof Anthropic.BadRequestError) {
      ctx.log.warn({ message: err.message }, 'AI bot: bad request');
      return { ok: false, error: 'A pergunta não pôde ser processada (verifique o modelo configurado).' };
    }
    if (err instanceof Anthropic.APIError) {
      ctx.log.error({ status: err.status, message: err.message }, 'AI bot: API error');
      return { ok: false, error: 'O serviço de IA está indisponível agora. Tente mais tarde.' };
    }
    ctx.log.error({ err }, 'AI bot: request failed');
    return { ok: false, error: 'Não foi possível contatar o serviço de IA.' };
  }
}
