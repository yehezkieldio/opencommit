import type { OpenAI } from "openai";
import { tokenCount } from "#/utils/token-count";

/**
 * Result of token budget computation.
 */
export interface TokenBudgetResult {
    /** Maximum tokens available for diff content */
    maxDiffTokens: number;
    /** Total tokens used by prompt messages */
    promptTokens: number;
    /** Whether the budget is valid (positive) */
    isValid: boolean;
    /** Error reason if budget is invalid */
    errorReason?: string;
}

/**
 * Options for computing token budget.
 */
export interface TokenBudgetOptions {
    /** Array of prompt messages to account for */
    promptMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    /** Maximum input tokens for the model */
    maxInputTokens: number;
    /** Maximum output tokens reserved for response */
    maxOutputTokens: number;
    /** Safety adjustment factor (default: 20) */
    adjustmentFactor?: number;
}

/**
 * Computes the available token budget for diff content.
 *
 * This centralizes all token arithmetic to avoid drift between different
 * parts of the codebase and provides early validation.
 *
 * @param options - Token budget computation options
 * @returns Structured result with budget info and validity
 */
export function computeTokenBudget(options: TokenBudgetOptions): TokenBudgetResult {
    const { promptMessages, maxInputTokens, maxOutputTokens, adjustmentFactor = 20 } = options;

    // Calculate prompt overhead (content + 4 tokens per message for formatting)
    const promptTokens = promptMessages.reduce((total, msg) => {
        const contentTokens = tokenCount(msg.content as string);
        return total + contentTokens + 4; // +4 for message formatting overhead
    }, 0);

    // Calculate available budget for diff content
    const maxDiffTokens = maxInputTokens - adjustmentFactor - promptTokens - maxOutputTokens;

    // Validate budget
    if (maxDiffTokens <= 0) {
        return {
            maxDiffTokens,
            promptTokens,
            isValid: false,
            errorReason:
                `Token budget exhausted: prompt uses ${promptTokens} tokens, ` +
                `output reserves ${maxOutputTokens} tokens, but max input is only ${maxInputTokens}. ` +
                "Try reducing OCO_TOKENS_MAX_OUTPUT or using a model with higher context limits.",
        };
    }

    return {
        maxDiffTokens,
        promptTokens,
        isValid: true,
    };
}

/**
 * Error thrown when token budget is invalid.
 */
export class TokenBudgetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TokenBudgetError";
    }
}

/**
 * Computes token budget and throws if invalid.
 * Convenience wrapper for use in main flow where invalid budget is fatal.
 */
export function requireValidTokenBudget(options: TokenBudgetOptions): TokenBudgetResult {
    const result = computeTokenBudget(options);
    if (!result.isValid) {
        throw new TokenBudgetError(result.errorReason ?? "Unknown error");
    }
    return result;
}
