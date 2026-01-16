import { OpenAI } from 'openai';
import { getEngine } from './engine';

/**
 * Valid conventional commit types in priority order.
 */
const VALID_TYPES = [
    'feat', 'fix', 'refactor', 'perf', 'chore',
    'deps', 'i18n', 'locale', 'translation', 'style', 'format',
    'security', 'revert', 'build', 'compat', 'test', 'ci', 'docs', 'deprecated'
];

/**
 * Regex to match a conventional commit header.
 * Matches: type(scope): subject  OR  type: subject
 */
const HEADER_PATTERN = new RegExp(
    `^(${VALID_TYPES.join('|')})(\\([^)]+\\))?:\\s*.+`,
    'i'
);

/**
 * Regex to match a header line anywhere in text.
 */
const HEADER_LINE_PATTERN = new RegExp(
    `^(${VALID_TYPES.join('|')})(\\([^)]+\\))?:\\s*.+`,
    'gim'
);

/**
 * Result of commit message validation.
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    headerCount: number;
    firstHeader?: string;
    additionalHeaders?: string[];
}

/**
 * Options for commit message validation.
 */
export interface ValidationOptions {
    /** Maximum length for subject line (default: 50) */
    maxSubjectLength?: number;
    /** Whether scope is required (default: false) */
    requireScope?: boolean;
}

/**
 * Validates a commit message against conventional commit rules.
 * 
 * Checks:
 * - Exactly one conventional header at the top
 * - No additional header-like lines later
 * - Subject length constraints
 * 
 * @param message - The commit message to validate
 * @param options - Validation options
 * @returns Validation result with errors and header info
 */
export function validateCommitMessage(
    message: string,
    options: ValidationOptions = {}
): ValidationResult {
    const { maxSubjectLength = 50, requireScope = false } = options;
    const errors: string[] = [];
    const lines = message.trim().split('\n');

    if (lines.length === 0 || !lines[0].trim()) {
        return {
            isValid: false,
            errors: ['Empty commit message'],
            headerCount: 0
        };
    }

    const firstLine = lines[0].trim();

    // Check if first line is a valid header
    if (!HEADER_PATTERN.test(firstLine)) {
        errors.push(`First line is not a valid conventional commit header: "${firstLine}"`);
    }

    // Check subject length
    const colonIndex = firstLine.indexOf(':');
    if (colonIndex > -1) {
        const subject = firstLine.substring(colonIndex + 1).trim();
        if (subject.length > maxSubjectLength) {
            errors.push(`Subject line exceeds ${maxSubjectLength} characters (${subject.length})`);
        }
    }

    // Check for scope if required
    if (requireScope && !firstLine.includes('(')) {
        errors.push('Scope is required but not present');
    }

    // Find all header-like lines
    const allHeaders = message.match(HEADER_LINE_PATTERN) || [];
    const additionalHeaders = allHeaders.slice(1);

    if (additionalHeaders.length > 0) {
        errors.push(
            `Multiple commit headers detected. Only one header is allowed. ` +
            `Additional headers found: ${additionalHeaders.join(', ')}`
        );
    }

    return {
        isValid: errors.length === 0,
        errors,
        headerCount: allHeaders.length,
        firstHeader: allHeaders[0],
        additionalHeaders
    };
}

/**
 * Repairs an invalid commit message by requesting LLM to rewrite it.
 * 
 * @param invalidMessage - The invalid commit message
 * @param engine - The LLM engine to use for repair
 * @returns Repaired commit message or null if repair failed
 */
export async function repairCommitMessage(
    invalidMessage: string
): Promise<string | null> {
    const engine = getEngine();

    const repairPrompt: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content: `You are a commit message formatter. The following commit message is invalid because it contains multiple headers or doesn't follow conventional commit format.

Rewrite it as EXACTLY ONE valid conventional commit message.

Rules:
- Use format: type(scope): subject
- Pick the most significant type if multiple changes exist
- Keep subject under 50 characters
- Mention other changes in the body if needed
- Types: feat, fix, refactor, perf, chore, docs, test, ci, build, style, revert

Output ONLY the rewritten commit message, nothing else.`
        },
        {
            role: 'user',
            content: invalidMessage
        }
    ];

    try {
        const repaired = await engine.generateCommitMessage(repairPrompt);
        if (repaired) {
            const validation = validateCommitMessage(repaired);
            if (validation.isValid) {
                return repaired;
            }
        }
    } catch {
        // Repair failed, will fall back to deterministic collapse
    }

    return null;
}

/**
 * Deterministically collapses multiple headers into one valid message.
 * Used as a fallback when LLM repair fails.
 * 
 * Strategy: Keep first header, convert others to body bullets.
 * 
 * @param message - The invalid commit message
 * @param validation - Validation result containing header info
 * @returns Collapsed commit message
 */
export function collapseMultipleHeaders(
    message: string,
    validation: ValidationResult
): string {
    if (!validation.firstHeader) {
        // No valid header found, create a generic one
        const firstLine = message.trim().split('\n')[0];
        return `chore: ${firstLine.substring(0, 50)}`;
    }

    if (!validation.additionalHeaders || validation.additionalHeaders.length === 0) {
        return message;
    }

    // Extract body (everything after first header that's not another header)
    const lines = message.split('\n');
    const bodyLines: string[] = [];
    let inBody = false;

    for (const line of lines.slice(1)) {
        const isHeader = HEADER_PATTERN.test(line.trim());
        if (isHeader) {
            // Convert header to bullet point
            bodyLines.push(`- ${line.trim()}`);
        } else {
            inBody = true;
            bodyLines.push(line);
        }
    }

    // Reconstruct message
    const body = bodyLines.join('\n').trim();
    if (body) {
        return `${validation.firstHeader}\n\n${body}`;
    }
    return validation.firstHeader;
}

/**
 * Ensures a commit message is valid, repairing if necessary.
 * 
 * Flow:
 * 1. Validate message
 * 2. If invalid, attempt LLM repair
 * 3. If repair fails, deterministic collapse
 * 
 * @param message - The commit message to validate/repair
 * @param options - Validation options
 * @returns Valid commit message
 */
export async function ensureValidCommitMessage(
    message: string,
    options: ValidationOptions = {}
): Promise<string> {
    const validation = validateCommitMessage(message, options);

    if (validation.isValid) {
        return message;
    }

    // Only attempt repair for multi-header issues
    if (validation.headerCount > 1) {
        const repaired = await repairCommitMessage(message);
        if (repaired) {
            return repaired;
        }

        // Fall back to deterministic collapse
        return collapseMultipleHeaders(message, validation);
    }

    // For other validation issues, return as-is (subject length, etc.)
    // These are warnings rather than fatal errors
    return message;
}
