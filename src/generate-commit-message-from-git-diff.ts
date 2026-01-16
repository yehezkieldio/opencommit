import type { OpenAI } from "openai";
import { DEFAULT_TOKEN_LIMITS, getConfig } from "#/commands/config";
import { getMainCommitPrompt, getThemeSynthesisPrompt, INTENT_EXTRACTION_PROMPT, SUMMARY_PROMPT } from "#/prompts";
import { getEngine } from "#/utils/engine";
import { extractFileName } from "#/utils/extract-file-name";
import { mergeDiffs } from "#/utils/merge-diffs";
import { splitToTokenChunks } from "#/utils/slice-to-token-limit";
import { computeTokenBudget, TokenBudgetError } from "#/utils/token-budget";
import { tokenCount } from "#/utils/token-count";
import { ensureValidCommitMessage } from "#/utils/validate-commit-message.js";

const config = getConfig();
const MAX_TOKENS_INPUT = config.OCO_TOKENS_MAX_INPUT;
const MAX_TOKENS_OUTPUT = config.OCO_TOKENS_MAX_OUTPUT;

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

/**
 * A high-level theme extracted from file summaries (Intent Extraction phase output).
 */
interface Theme {
    title: string;
    description: string;
    fileCount: number;
    scope: "architectural" | "feature" | "fix" | "refactor" | "chore";
}

export const GenerateCommitMessageErrorEnum = {
    tooMuchTokens: "TOO_MUCH_TOKENS",
    internalError: "INTERNAL_ERROR",
    emptyMessage: "EMPTY_MESSAGE",
    outputTokensTooHigh: `Token limit exceeded, OCO_TOKENS_MAX_OUTPUT must not be much higher than the default ${DEFAULT_TOKEN_LIMITS.DEFAULT_MAX_TOKENS_OUTPUT} tokens.`,
} as const;
export type GenerateCommitMessageErrorEnum =
    (typeof GenerateCommitMessageErrorEnum)[keyof typeof GenerateCommitMessageErrorEnum];

const ADJUSTMENT_FACTOR = 20;
/** Regex pattern for splitting diffs by file - anchored to line start */
const DIFF_FILE_PATTERN = /^diff --git /m;
/** Regex pattern for splitting hunks - anchored to line start */
const HUNK_PATTERN = /^@@ /m;
/** Bounded concurrency for parallel API calls */
const MAX_CONCURRENCY = 2;
/** Initial delay for exponential backoff (ms) */
const INITIAL_BACKOFF_MS = 500;
/** Maximum delay for exponential backoff (ms) */
const MAX_BACKOFF_MS = 10_000;

/**
 * Creates the chat completion prompt for direct commit message generation.
 */
const generateCommitMessageChatCompletionPrompt = async (
    diff: string,
    context: string
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> => {
    const INIT_MESSAGES_PROMPT = await getMainCommitPrompt(context);
    return [...INIT_MESSAGES_PROMPT, { role: "user", content: diff }];
};

/**
 * Delays execution with exponential backoff and jitter.
 * @param attempt - The current attempt number (0-indexed)
 * @returns Promise that resolves after the delay
 */
function exponentialBackoff(attempt: number): Promise<void> {
    const baseDelay = Math.min(INITIAL_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    // Add jitter: random value between 0 and 50% of base delay
    const jitter = Math.random() * baseDelay * 0.5;
    const delay = baseDelay + jitter;
    return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Splits a diff string by lines when it exceeds token limits.
 * Uses token-aware slicing to guarantee each chunk fits within limits.
 */
function splitDiffByLines(diff: string, maxTokens: number): string[] {
    if (maxTokens <= 0) {
        throw new Error(GenerateCommitMessageErrorEnum.outputTokensTooHigh);
    }

    const lines = diff.split("\n");
    const chunks: string[] = [];
    let currentChunk = "";

    for (const line of lines) {
        const lineTokens = tokenCount(line);

        // Handle extremely long single lines with token-aware slicing
        if (lineTokens > maxTokens) {
            // Push current chunk if exists
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = "";
            }
            // Split the long line into token-safe chunks
            const lineChunks = splitToTokenChunks(line, maxTokens);
            chunks.push(...lineChunks);
            continue;
        }

        const potentialChunk = currentChunk + (currentChunk ? "\n" : "") + line;
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

/**
 * Splits a diff into chunks by file boundaries using regex anchors.
 * Prioritizes keeping each file together, but will split large files if needed.
 */
function splitDiffByFiles(diff: string, maxTokens: number): DiffChunk[] {
    // Use regex split anchored to line start for robustness
    const parts = diff.split(DIFF_FILE_PATTERN);
    // First element is empty or content before first diff
    const fileDiffs = parts.slice(1).map((part) => `diff --git ${part}`);

    const chunks: DiffChunk[] = [];
    let currentChunk: DiffChunk = { content: "", files: [], tokenCount: 0 };

    for (const fileDiff of fileDiffs) {
        const fileTokens = tokenCount(fileDiff);
        const fileName = extractFileName(fileDiff.substring("diff --git ".length));

        // Would adding this file exceed the limit?
        if (currentChunk.tokenCount + fileTokens > maxTokens && currentChunk.content) {
            // Push current chunk and start a new one
            chunks.push(currentChunk);
            currentChunk = { content: "", files: [], tokenCount: 0 };
        }

        // Is this single file too large to fit?
        if (fileTokens > maxTokens) {
            // Push any current content first
            if (currentChunk.content) {
                chunks.push(currentChunk);
                currentChunk = { content: "", files: [], tokenCount: 0 };
            }

            // Split large file by hunks/lines
            const subChunks = splitLargeFileDiff(fileDiff, maxTokens);
            for (const subContent of subChunks) {
                chunks.push({
                    content: subContent,
                    files: [fileName],
                    tokenCount: tokenCount(subContent),
                });
            }
        } else {
            // Add file to current chunk
            currentChunk.content += fileDiff;
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
 * Uses regex anchored to line start for reliable hunk detection.
 */
function splitLargeFileDiff(fileDiff: string, maxTokens: number): string[] {
    // Find the file header (everything before first hunk)
    const hunkMatch = fileDiff.match(HUNK_PATTERN);
    if (!hunkMatch || hunkMatch.index === undefined) {
        // No hunks found - split by lines
        return splitDiffByLines(fileDiff, maxTokens);
    }

    const fileHeader = fileDiff.substring(0, hunkMatch.index);
    const hunksContent = fileDiff.substring(hunkMatch.index);
    const headerTokens = tokenCount(fileHeader);

    // If header alone exceeds max, fall back to line splitting
    if (headerTokens >= maxTokens) {
        return splitDiffByLines(fileDiff, maxTokens);
    }

    // Split hunks using regex
    const hunkParts = hunksContent.split(HUNK_PATTERN);
    const hunks = hunkParts.slice(1).map((part) => `@@ ${part}`);

    // Try to merge hunks into reasonably-sized chunks
    const maxHunkTokens = maxTokens - headerTokens;
    const mergedHunks = mergeDiffs(hunks, maxHunkTokens);

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
 * Runs promises with bounded concurrency.
 */
async function runWithConcurrency<T>(
    items: T[],
    fn: (item: T, index: number) => Promise<void>,
    concurrency: number
): Promise<void> {
    const queue = items.map((item, index) => ({ item, index }));
    const running: Promise<void>[] = [];

    while (queue.length > 0 || running.length > 0) {
        // Fill up to concurrency limit
        while (running.length < concurrency && queue.length > 0) {
            const queueItem = queue.shift();
            if (!queueItem) break;
            const { item, index } = queueItem;
            const promise = fn(item, index).finally(() => {
                const idx = running.indexOf(promise);
                if (idx > -1) running.splice(idx, 1);
            });
            running.push(promise);
        }

        // Wait for at least one to complete
        if (running.length > 0) {
            await Promise.race(running);
        }
    }
}

/**
 * MAP PHASE: Analyzes each diff chunk and extracts a summary of changes.
 * Uses bounded concurrency and exponential backoff for reliability.
 */
async function getDiffSummaries(chunks: DiffChunk[]): Promise<ChunkSummary[]> {
    const engine = getEngine();
    const summaries: ChunkSummary[] = new Array(chunks.length);
    let lastAttemptTime = 0;

    await runWithConcurrency(
        chunks,
        async (chunk, index) => {
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                SUMMARY_PROMPT,
                { role: "user", content: chunk.content },
            ];

            // Ensure minimum delay between requests
            const now = Date.now();
            const timeSinceLastRequest = now - lastAttemptTime;
            if (timeSinceLastRequest < INITIAL_BACKOFF_MS) {
                await exponentialBackoff(0);
            }
            lastAttemptTime = Date.now();

            let attempts = 0;
            const maxAttempts = 3;

            while (attempts < maxAttempts) {
                try {
                    const summary = await engine.generateCommitMessage(messages);
                    summaries[index] = {
                        summary: summary || `Changes in: ${chunk.files.join(", ")}`,
                        files: chunk.files,
                    };
                    return;
                } catch (error) {
                    attempts++;
                    if (attempts < maxAttempts) {
                        await exponentialBackoff(attempts);
                    }
                }
            }

            // Fallback: use file names as summary if all attempts fail
            summaries[index] = {
                summary: `Changes in: ${chunk.files.join(", ")}`,
                files: chunk.files,
            };
        },
        MAX_CONCURRENCY
    );

    return summaries;
}

const JSON_MATCH_REGEX = /```(?:json)?\s*([\s\S]*?)```/;

/**
 * INTENT EXTRACTION PHASE: Extracts high-level themes from file summaries.
 * This bridges the gap between file-specific Map phase output and synthesis.
 *
 * Key features:
 * - Aggregates file counts across summaries for weighting
 * - Uses specialized prompt that forbids file-level trivia
 * - Returns structured themes with scope classification
 */
async function extractThemes(summaries: ChunkSummary[]): Promise<Theme[]> {
    const engine = getEngine();

    // Prepare weighted input: include file counts for each summary
    const weightedSummaries = summaries.map((s) => {
        const fileCount = s.files.length;
        const fileLabel = fileCount === 1 ? "1 file" : `${fileCount} files`;
        return `- [${fileLabel}] ${s.summary}`;
    });

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        INTENT_EXTRACTION_PROMPT,
        {
            role: "user",
            content: `Extract high-level themes from these file-level change summaries:\n\n${weightedSummaries.join("\n")}`,
        },
    ];

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            const response = await engine.generateCommitMessage(messages);
            if (response) {
                // Parse JSON response - extract from markdown code blocks if present
                let jsonStr = response.trim();

                // Handle markdown code blocks
                const jsonMatch = jsonStr.match(JSON_MATCH_REGEX);
                if (jsonMatch?.[1]) {
                    jsonStr = jsonMatch[1].trim();
                }

                const parsed = JSON.parse(jsonStr);
                if (parsed.themes && Array.isArray(parsed.themes)) {
                    return parsed.themes.map((t: Partial<Theme>) => ({
                        title: t.title || "Changes",
                        description: t.description || "",
                        fileCount: t.fileCount || 1,
                        scope: t.scope || "chore",
                    }));
                }
            }
        } catch (error) {
            attempts++;
            if (attempts < maxAttempts) {
                await exponentialBackoff(attempts);
            }
        }
    }

    // Fallback: create a single generic theme from all summaries
    const totalFiles = new Set(summaries.flatMap((s) => s.files)).size;
    return [
        {
            title: "Multiple changes",
            description: summaries
                .map((s) => s.summary)
                .join("; ")
                .slice(0, 200),
            fileCount: totalFiles,
            scope: "chore",
        },
    ];
}

/**
 * REDUCE PHASE: Combines extracted themes into a single commit message.
 * Now operates on high-level themes instead of raw file summaries.
 */
async function synthesizeCommitMessage(summaries: ChunkSummary[], context: string): Promise<string> {
    const engine = getEngine();

    // INTENT EXTRACTION: Extract high-level themes from summaries
    const themes = await extractThemes(summaries);

    // Sort themes by file count (descending) for priority
    const sortedThemes = [...themes].sort((a, b) => b.fileCount - a.fileCount);

    // Format themes for synthesis prompt
    const themesContent = sortedThemes
        .map((t, i) => {
            const priority = i === 0 ? "[PRIMARY]" : "[SECONDARY]";
            return `${priority} ${t.title} (${t.fileCount} files, ${t.scope})
   ${t.description}`;
        })
        .join("\n\n");

    const synthesisPrompt = getThemeSynthesisPrompt(context);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        synthesisPrompt,
        {
            role: "user",
            content: `Generate a commit message from these extracted themes:\n\n${themesContent}`,
        },
    ];

    const commitMessage = await engine.generateCommitMessage(messages);
    if (!commitMessage) {
        throw new Error(GenerateCommitMessageErrorEnum.emptyMessage);
    }

    // Validate and repair if necessary
    return await ensureValidCommitMessage(commitMessage);
}

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
export const generateCommitMessageByDiff = async (diff: string, context = ""): Promise<string> => {
    const INIT_MESSAGES_PROMPT = await getMainCommitPrompt(context);

    const budget = computeTokenBudget({
        promptMessages: INIT_MESSAGES_PROMPT,
        maxInputTokens: MAX_TOKENS_INPUT,
        maxOutputTokens: MAX_TOKENS_OUTPUT,
        adjustmentFactor: ADJUSTMENT_FACTOR,
    });

    if (!budget.isValid) {
        throw new TokenBudgetError(budget.errorReason ?? "Token budget exceeded");
    }

    const diffTokens = tokenCount(diff);

    // ========================================================================
    // Small Diff Path: Direct Generation
    // ========================================================================

    if (diffTokens <= budget.maxDiffTokens) {
        const messages = await generateCommitMessageChatCompletionPrompt(diff, context);
        const engine = getEngine();
        const commitMessage = await engine.generateCommitMessage(messages);

        if (!commitMessage) {
            throw new Error(GenerateCommitMessageErrorEnum.emptyMessage);
        }

        // Validate and repair if necessary
        return await ensureValidCommitMessage(commitMessage);
    }

    // ========================================================================
    // Large Diff Path: Map-Reduce Pipeline
    // ========================================================================

    // MAP: Split diff into chunks and summarize each
    const chunks = splitDiffByFiles(diff, budget.maxDiffTokens);
    const summaries = await getDiffSummaries(chunks);

    // REDUCE: Synthesize a single commit message from all summaries
    return await synthesizeCommitMessage(summaries, context);
};
