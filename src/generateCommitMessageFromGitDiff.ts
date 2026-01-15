import { OpenAI } from 'openai';
import { DEFAULT_TOKEN_LIMITS, getConfig } from './commands/config';
import { getMainCommitPrompt, SUMMARY_PROMPT, getSynthesisPrompt } from './prompts';
import { getEngine } from './utils/engine';
import { extractFileName } from './utils/extractFileName';
import { mergeDiffs } from './utils/mergeDiffs';
import { tokenCount } from './utils/tokenCount';
import { i18n, I18nLocals } from './i18n';

const config = getConfig();
const MAX_TOKENS_INPUT = config.OCO_TOKENS_MAX_INPUT;
const MAX_TOKENS_OUTPUT = config.OCO_TOKENS_MAX_OUTPUT;

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a chunk of the diff that can be processed independently.
 */
interface DiffChunk {
  content: string;
  files: string[];
  tokenCount: number;
}

/**
 * Summary of changes from analyzing a diff chunk (Map phase output).
 */
interface ChunkSummary {
  summary: string;
  files: string[];
}

// ============================================================================
// Error Enums
// ============================================================================

export enum GenerateCommitMessageErrorEnum {
  tooMuchTokens = 'TOO_MUCH_TOKENS',
  internalError = 'INTERNAL_ERROR',
  emptyMessage = 'EMPTY_MESSAGE',
  outputTokensTooHigh = `Token limit exceeded, OCO_TOKENS_MAX_OUTPUT must not be much higher than the default ${DEFAULT_TOKEN_LIMITS.DEFAULT_MAX_TOKENS_OUTPUT} tokens.`
}

// ============================================================================
// Constants
// ============================================================================

const ADJUSTMENT_FACTOR = 20;
const DIFF_SEPARATOR = 'diff --git ';
const RATE_LIMIT_DELAY_MS = 1000;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates the chat completion prompt for direct commit message generation.
 */
const generateCommitMessageChatCompletionPrompt = async (
  diff: string,
  context: string
): Promise<Array<OpenAI.Chat.Completions.ChatCompletionMessageParam>> => {
  const INIT_MESSAGES_PROMPT = await getMainCommitPrompt(context);
  return [
    ...INIT_MESSAGES_PROMPT,
    { role: 'user', content: diff }
  ];
};

/**
 * Delays execution for rate limiting purposes.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Splits a diff string by lines when it exceeds token limits.
 * Used as a fallback when file-level splitting isn't granular enough.
 */
function splitDiffByLines(diff: string, maxTokens: number): string[] {
  const lines = diff.split('\n');
  const chunks: string[] = [];
  let currentChunk = '';

  if (maxTokens <= 0) {
    throw new Error(GenerateCommitMessageErrorEnum.outputTokensTooHigh);
  }

  for (let line of lines) {
    // Handle extremely long single lines
    while (tokenCount(line) > maxTokens) {
      const subLine = line.substring(0, maxTokens);
      line = line.substring(maxTokens);
      chunks.push(subLine);
    }

    const potentialChunk = currentChunk + (currentChunk ? '\n' : '') + line;
    if (tokenCount(potentialChunk) > maxTokens) {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk = potentialChunk;
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

// ============================================================================
// Map Phase: Splitting and Summarizing
// ============================================================================

/**
 * Splits a diff into chunks by file boundaries, respecting token limits.
 * Prioritizes keeping each file together, but will split large files if needed.
 */
function splitDiffByFiles(diff: string, maxTokens: number): DiffChunk[] {
  const fileDiffs = diff.split(DIFF_SEPARATOR).slice(1);
  const chunks: DiffChunk[] = [];
  let currentChunk: DiffChunk = { content: '', files: [], tokenCount: 0 };

  for (const fileDiff of fileDiffs) {
    const fullFileDiff = DIFF_SEPARATOR + fileDiff;
    const fileTokens = tokenCount(fullFileDiff);
    const fileName = extractFileName(fileDiff);

    // Would adding this file exceed the limit?
    if (currentChunk.tokenCount + fileTokens > maxTokens && currentChunk.content) {
      // Push current chunk and start a new one
      chunks.push(currentChunk);
      currentChunk = { content: '', files: [], tokenCount: 0 };
    }

    // Is this single file too large to fit?
    if (fileTokens > maxTokens) {
      // Push any current content first
      if (currentChunk.content) {
        chunks.push(currentChunk);
        currentChunk = { content: '', files: [], tokenCount: 0 };
      }

      // Split large file by hunks/lines
      const subChunks = splitLargeFileDiff(fileDiff, maxTokens);
      for (const subContent of subChunks) {
        chunks.push({
          content: DIFF_SEPARATOR + subContent,
          files: [fileName],
          tokenCount: tokenCount(DIFF_SEPARATOR + subContent)
        });
      }
    } else {
      // Add file to current chunk
      currentChunk.content += fullFileDiff;
      currentChunk.files.push(fileName);
      currentChunk.tokenCount += fileTokens;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.content) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Splits a large single-file diff into smaller chunks by hunk boundaries.
 */
function splitLargeFileDiff(fileDiff: string, maxTokens: number): string[] {
  const hunkSeparator = '@@ ';
  const [fileHeader, ...hunks] = fileDiff.split(hunkSeparator);

  // Try to merge hunks into reasonably-sized chunks
  const mergedHunks = mergeDiffs(
    hunks.map((hunk) => hunkSeparator + hunk),
    maxTokens - tokenCount(fileHeader) // Reserve space for header
  );

  const result: string[] = [];
  for (const hunk of mergedHunks) {
    const fullDiff = fileHeader + hunk;
    if (tokenCount(fullDiff) > maxTokens) {
      // Still too large - fall back to line-level splitting
      const lineSplit = splitDiffByLines(fullDiff, maxTokens);
      result.push(...lineSplit);
    } else {
      result.push(fullDiff);
    }
  }

  return result;
}

/**
 * MAP PHASE: Analyzes each diff chunk and extracts a summary of changes.
 * Returns bullet-point summaries without commit message formatting.
 */
async function getDiffSummaries(chunks: DiffChunk[]): Promise<ChunkSummary[]> {
  const engine = getEngine();
  const summaries: ChunkSummary[] = [];

  for (const chunk of chunks) {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      SUMMARY_PROMPT,
      { role: 'user', content: chunk.content }
    ];

    try {
      const summary = await engine.generateCommitMessage(messages);
      summaries.push({
        summary: summary || `Changes in: ${chunk.files.join(', ')}`,
        files: chunk.files
      });
    } catch (error) {
      // Fallback: use file names as summary if LLM fails
      summaries.push({
        summary: `Changes in: ${chunk.files.join(', ')}`,
        files: chunk.files
      });
    }

    // Rate limiting to avoid API throttling
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }

  return summaries;
}

// ============================================================================
// Reduce Phase: Synthesizing Final Message
// ============================================================================

/**
 * REDUCE PHASE: Combines all chunk summaries into a single commit message.
 * Handles recursive reduction if summaries are too long.
 */
async function synthesizeCommitMessage(
  summaries: ChunkSummary[],
  context: string
): Promise<string> {
  const engine = getEngine();
  const translation = i18n[(config.OCO_LANGUAGE as I18nLocals) || 'en'];

  // Combine all summaries into a structured format
  const combinedSummary = summaries
    .map((s) => {
      const fileList = s.files.length > 0 ? `**Files:** ${s.files.join(', ')}\n` : '';
      return `${fileList}${s.summary}`;
    })
    .join('\n\n---\n\n');

  // Check if combined summary fits in context
  const synthesisPrompt = getSynthesisPrompt(translation.localLanguage, context);
  const promptTokens = tokenCount(synthesisPrompt.content as string);
  const maxSummaryTokens = MAX_TOKENS_INPUT - promptTokens - MAX_TOKENS_OUTPUT - ADJUSTMENT_FACTOR;

  let finalSummary = combinedSummary;

  // Recursive reduction if summaries are too long
  if (tokenCount(combinedSummary) > maxSummaryTokens) {
    finalSummary = await recursivelyReduceSummaries(summaries, maxSummaryTokens);
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    synthesisPrompt,
    {
      role: 'user',
      content: `Here is a summary of all changes in this commit:\n\n${finalSummary}`
    }
  ];

  const commitMessage = await engine.generateCommitMessage(messages);
  if (!commitMessage) {
    throw new Error(GenerateCommitMessageErrorEnum.emptyMessage);
  }

  return commitMessage;
}

/**
 * Recursively reduces summaries when they exceed token limits.
 * Groups summaries and re-summarizes them.
 */
async function recursivelyReduceSummaries(
  summaries: ChunkSummary[],
  maxTokens: number
): Promise<string> {
  const engine = getEngine();

  // Group summaries into batches that fit within limits
  const batches: ChunkSummary[][] = [];
  let currentBatch: ChunkSummary[] = [];
  let currentBatchTokens = 0;

  for (const summary of summaries) {
    const summaryTokens = tokenCount(summary.summary);
    if (currentBatchTokens + summaryTokens > maxTokens / 2 && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchTokens = 0;
    }
    currentBatch.push(summary);
    currentBatchTokens += summaryTokens;
  }
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  // If only one batch, just truncate
  if (batches.length <= 1) {
    return summaries
      .map((s) => s.summary)
      .join('\n')
      .substring(0, maxTokens * 3); // Rough char estimate
  }

  // Re-summarize each batch
  const reducedSummaries: ChunkSummary[] = [];
  for (const batch of batches) {
    const batchText = batch.map((s) => s.summary).join('\n');
    const allFiles = batch.flatMap((s) => s.files);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      SUMMARY_PROMPT,
      { role: 'user', content: `Consolidate these changes into a shorter summary:\n\n${batchText}` }
    ];

    try {
      const reduced = await engine.generateCommitMessage(messages);
      reducedSummaries.push({
        summary: reduced || batchText.substring(0, 500),
        files: allFiles
      });
    } catch {
      reducedSummaries.push({
        summary: batchText.substring(0, 500),
        files: allFiles
      });
    }

    await delay(RATE_LIMIT_DELAY_MS);
  }

  // Check if we need another round of reduction
  const combinedReduced = reducedSummaries.map((s) => s.summary).join('\n\n');
  if (tokenCount(combinedReduced) > maxTokens) {
    return recursivelyReduceSummaries(reducedSummaries, maxTokens);
  }

  return combinedReduced;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main entry point for generating a commit message from a git diff.
 *
 * For small diffs: Direct generation using the full diff.
 * For large diffs: Map-Reduce pipeline (summarize chunks → synthesize message).
 *
 * @param diff - The git diff string from 'git diff --staged'
 * @param context - Optional user-provided context for the commit
 * @returns A single, cohesive commit message
 */
export const generateCommitMessageByDiff = async (
  diff: string,
  context: string = ''
): Promise<string> => {
  try {
    const INIT_MESSAGES_PROMPT = await getMainCommitPrompt(context);

    const INIT_MESSAGES_PROMPT_LENGTH = INIT_MESSAGES_PROMPT.map(
      (msg) => tokenCount(msg.content as string) + 4
    ).reduce((a, b) => a + b, 0);

    const MAX_DIFF_TOKENS =
      MAX_TOKENS_INPUT -
      ADJUSTMENT_FACTOR -
      INIT_MESSAGES_PROMPT_LENGTH -
      MAX_TOKENS_OUTPUT;

    const diffTokens = tokenCount(diff);

    // ========================================================================
    // Small Diff Path: Direct Generation
    // ========================================================================
    if (diffTokens <= MAX_DIFF_TOKENS) {
      const messages = await generateCommitMessageChatCompletionPrompt(diff, context);
      const engine = getEngine();
      const commitMessage = await engine.generateCommitMessage(messages);

      if (!commitMessage) {
        throw new Error(GenerateCommitMessageErrorEnum.emptyMessage);
      }

      return commitMessage;
    }

    // ========================================================================
    // Large Diff Path: Map-Reduce Pipeline
    // ========================================================================

    // MAP: Split diff into chunks and summarize each
    const chunks = splitDiffByFiles(diff, MAX_DIFF_TOKENS);
    const summaries = await getDiffSummaries(chunks);

    // REDUCE: Synthesize a single commit message from all summaries
    return await synthesizeCommitMessage(summaries, context);

  } catch (error) {
    throw error;
  }
};

// ============================================================================
// Legacy Exports (Deprecated - kept for backwards compatibility)
// ============================================================================

/**
 * @deprecated Use generateCommitMessageByDiff with the new Map-Reduce pipeline.
 * This function is kept for backwards compatibility but should not be used.
 */
export const getCommitMsgsPromisesFromFileDiffs = async (
  diff: string,
  maxDiffLength: number
): Promise<Promise<string | null | undefined>[]> => {
  console.warn(
    'getCommitMsgsPromisesFromFileDiffs is deprecated. ' +
    'Use generateCommitMessageByDiff which now handles large diffs correctly.'
  );

  // Redirect to new pipeline - this returns a single message, not multiple
  const message = await generateCommitMessageByDiff(diff, '');
  return [Promise.resolve(message)];
};
