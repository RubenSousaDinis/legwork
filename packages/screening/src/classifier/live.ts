import Anthropic from '@anthropic-ai/sdk';
import { AnthropicClassifier, type AnthropicClassifierOptions } from './anthropic';

/**
 * The only place in the repo that reads the key. T-16 calls this once at boot; nothing is
 * constructed at module load, and the client is never a default export.
 */
export function createLiveClassifier(
  overrides?: Partial<AnthropicClassifierOptions>,
): AnthropicClassifier {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return new AnthropicClassifier({ client: new Anthropic({ apiKey }), ...overrides });
}
