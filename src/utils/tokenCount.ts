import cl100k_base from '@dqbd/tiktoken/encoders/cl100k_base.json';
import { Tiktoken } from '@dqbd/tiktoken/lite';

// Singleton encoder instance - avoids expensive re-initialization on every call
let cachedEncoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!cachedEncoder) {
    cachedEncoder = new Tiktoken(
      cl100k_base.bpe_ranks,
      cl100k_base.special_tokens,
      cl100k_base.pat_str
    );
  }
  return cachedEncoder;
}

export function tokenCount(content: string): number {
  const encoding = getEncoder();
  const tokens = encoding.encode(content);
  return tokens.length;
}
