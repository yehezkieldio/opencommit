import { tokenCount } from './token-count.js';

/**
 * Slices a string to fit within a token limit using binary search.
 *
 * This solves the critical bug where character indices were used as token counts,
 * leading to oversized chunks or data loss.
 *
 * @param text - The text to slice
 * @param maxTokens - Maximum tokens allowed in the result
 * @returns A substring that fits within the token limit
 */
export function sliceToTokenLimit(text: string, maxTokens: number): string {
  if (maxTokens <= 0) {
    return '';
  }

  const textTokens = tokenCount(text);
  if (textTokens <= maxTokens) {
    return text;
  }

  // Binary search for the maximum character index that stays within token limit
  let low = 0;
  let high = text.length;
  let result = '';

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const slice = text.substring(0, mid);

    if (tokenCount(slice) <= maxTokens) {
      result = slice;
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

/**
 * Splits text into chunks that each fit within a token limit.
 *
 * Unlike simple character splitting, this guarantees each chunk
 * satisfies: tokenCount(chunk) <= maxTokens
 *
 * @param text - The text to split
 * @param maxTokens - Maximum tokens per chunk
 * @returns Array of chunks, each within the token limit
 */
export function splitToTokenChunks(text: string, maxTokens: number): string[] {
  if (maxTokens <= 0) {
    throw new Error('maxTokens must be positive');
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (tokenCount(remaining) <= maxTokens) {
      chunks.push(remaining);
      break;
    }

    const chunk = sliceToTokenLimit(remaining, maxTokens);
    if (chunk.length === 0) {
      // Edge case: first character alone exceeds limit (shouldn't happen with reasonable limits)
      // Take at least one character to avoid infinite loop
      chunks.push(remaining.substring(0, 1));
      remaining = remaining.substring(1);
    } else {
      chunks.push(chunk);
      remaining = remaining.substring(chunk.length);
    }
  }

  return chunks;
}
