import type { OpenAI } from "openai";
import { getConfig } from "./commands/config.js";

const config = getConfig();

export const IDENTITY = "You are to act as an author of a commit message in git.";

/**
 * Critical constraint to ensure only ONE commit message is generated.
 * This prevents the multi-header bug when processing large diffs.
 */
const SINGLE_MESSAGE_CONSTRAINT = `
## Critical Output Rules:
- You MUST generate exactly ONE single-line commit message
- Output ONLY the commit header line, nothing else
- NO bullet points, NO body text, NO descriptions
- NO line breaks in your output
- If multiple things changed, pick the most significant type
- When in doubt, prefer: feat > fix > refactor > chore
- Example valid output: "feat(auth): add user login endpoint"
- Example INVALID output: "feat(auth): add user login\n- added validation\n- added tests"`;

/**
 * SUMMARY_PROMPT for Map phase - analyzes diff chunks and extracts key changes.
 * Used when diffs are too large and need to be processed in chunks.
 */
export const SUMMARY_PROMPT: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
    role: "system",
    content: `You are a code analyst. Analyze the following git diff and extract the primary change.

## Instructions:
- Return a SINGLE sentence describing the main change
- Focus on WHAT changed at a high level
- Do NOT return bulleted lists
- Do NOT write a commit message or commit header
- Do NOT use prefixes like "feat:", "fix:", etc.
- Be concise - one sentence only

## Example Output:
Added user authentication middleware with JWT validation`,
};

/**
 * INTENT_EXTRACTION_PROMPT for extracting high-level themes from file summaries.
 * Used between Map and Reduce phases to capture cross-cutting intent.
 */
export const INTENT_EXTRACTION_PROMPT: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
    role: "system",
    content: `You are a code change analyst. Given summaries of file-level changes with file counts, extract 1-3 HIGH-LEVEL THEMES that describe the overall commit intent.

## Rules:
- Identify CROSS-FILE PATTERNS, not individual file changes
- Use ARCHITECTURAL language: "restructures", "introduces", "migrates", "overhauls"
- Each theme should describe SYSTEM-LEVEL or MODULE-LEVEL intent
- Prefer breadth (affects many files) over specificity (affects one file)
- Themes affecting more files should be ranked higher
- Do NOT use commit prefixes like "feat:", "fix:", etc.
- Do NOT mention specific file names unless absolutely essential

## Input Format:
You will receive summaries with file counts, e.g.:
- [7 files] Added authentication middleware and updated route handlers
- [1 file] Fixed typo in README

## Output Format:
Return a JSON object with this exact structure:
{
  "themes": [
    {
      "title": "Short theme title (3-6 words)",
      "description": "One sentence describing the architectural or systemic change",
      "fileCount": 7,
      "scope": "feature"
    }
  ]
}

## Scope Values:
- "architectural": Major structural changes, refactoring across modules
- "feature": New functionality or capabilities
- "fix": Bug fixes or error corrections
- "refactor": Code improvements without behavior change
- "chore": Maintenance, deps, config, or tooling

## Example:
Input:
- [5 files] Added JWT validation middleware and updated auth routes
- [3 files] Updated user service to use new auth tokens
- [1 file] Fixed typo in error message

Output:
{
  "themes": [
    {
      "title": "JWT authentication system",
      "description": "Introduces JWT-based authentication with middleware and updated user service integration",
      "fileCount": 8,
      "scope": "feature"
    }
  ]
}`,
};

const COMMIT_GUIDELINES = `Follow these commit message guidelines:

## Format Structure
type(scope): description
- Length: ≤ 50 characters total
- Case: lowercase except proper nouns
- Voice: imperative mood ("add" not "adds" or "added")
- Punctuation: no period at end
- Style: concise, direct, actionable

## Type Classification (Priority Order)
### Primary Types:
- feat: new functionality, components, or user-facing features
- fix: bug fixes, error handling, or corrections
- refactor: code restructuring without behavior changes
- perf: performance optimizations or improvements
- chore: maintenance, dependencies, tooling, configuration, or broad non-source code changes

### Secondary Types:
- deps, fix(deps), chore(deps), build(deps): dependency additions, upgrades, or removals
- i18n, locale, translation: internationalization and localization changes
- style, format: formatting, whitespace, linting fixes
- security: vulnerability fixes or security improvements
- revert: reverting previous commits
- build: build system or tooling changes
- compat: compatibility updates
- test: adding/modifying tests without production code changes
- ci: CI/CD pipeline, build, or deployment configuration
- docs: documentation changes only, either markdown or code comments
- deprecated: deprecation notices

## Scope Determination Rules
### For src/ changes:
- Use specific module/component name: auth, api, ui, core, utils
- File-based: parser, validator, router, middleware
- Feature-based: login, dashboard, notifications

### For non-src/ changes:
- Dependencies: deps
- Configuration: config
- Build/tooling: build, ci
- Documentation: docs
- Root files: omit scope

### Scope Selection Priority:
1. Most specific affected component
2. If multiple components: use parent module or omit scope
3. If unclear: omit scope rather than guess

## Decision Tree
1. Is this a dependency change? -> chore(deps): action dependency package-name
2. Is this outside src/ directory? -> chore(scope): action
3. Is this adding new functionality in src/? -> feat(scope): action
4. Is this fixing a bug/error in src/? -> fix(scope): action
5. Is this restructuring code without changing behavior? -> refactor(scope): action
6. Otherwise, use most specific type from list

## Description Writing Rules
### DO:
- Start with action verb: "add", "remove", "update", "fix", "refactor"
- Be specific: "add user authentication" not "add auth stuff"
- Use present tense imperative: "implement" not "implemented"
- Focus on WHAT changed, not WHY

### DON'T:
- Use vague terms: "update things", "fix stuff", "improve code"
- Add explanations: "fix bug (was causing crashes)"
- Include ticket numbers: "fix USER-123"
- Use gerunds: "adding" instead of "add"

## Edge Cases
- Multiple types in one commit: Choose the most significant change. If equal significance, prefer: feat > fix > refactor > chore
- Multiple scopes affected: Use parent scope if logical grouping exists, omit scope if no clear parent`;

const getCommitConvention = () => COMMIT_GUIDELINES;

const getScopeInstruction = () =>
    config.OCO_OMIT_SCOPE
        ? "Do not include a scope in the commit message format. Use the format: <type>: <subject>"
        : "";

const userInputCodeContext = (context: string) => {
    if (context !== "" && context !== " ") {
        return `Additional context provided by the user: <context>${context}</context>\nConsider this context when generating the commit message, incorporating relevant information when appropriate.`;
    }
    return "";
};

/**
 * Returns a prompt for synthesizing the final commit message from extracted themes.
 * This operates on high-level themes, not raw file summaries.
 */
export const getThemeSynthesisPrompt = (context: string): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
    role: "system",
    content: (() => {
        const mission = `${IDENTITY}

You will receive HIGH-LEVEL THEMES extracted from a commit.
Your task is to write **exactly ONE single-line** commit message. Output ONLY the header line, nothing else.`;

        const selectionRules = `## Rules:
- Choose the theme affecting the MOST files as the primary focus
- If themes have equal file counts, prefer: feature > fix > refactor > chore
- Do NOT include bullet points or body text
- Do NOT include line breaks
- Output ONLY the single commit header line`;

        const conventionGuidelines = COMMIT_GUIDELINES;
        const scopeInstruction = getScopeInstruction();
        const generalGuidelines =
            "Use the present tense. Output must be a single line under 74 characters. Use English.";
        const userInputContext = userInputCodeContext(context);

        return `${mission}
${selectionRules}
${conventionGuidelines}
${SINGLE_MESSAGE_CONSTRAINT}
${scopeInstruction}
${generalGuidelines}
${userInputContext}`;
    })(),
});

const INIT_MAIN_PROMPT = (context: string): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
    role: "system",
    content: (() => {
        const missionStatement = `${IDENTITY} Your mission is to create a single-line commit message following the Conventional Commit Convention.`;
        const diffInstruction =
            "I'll send you an output of 'git diff --staged' command, and you are to convert it into a single-line commit message. Output ONLY the commit header, nothing else.";
        const conventionGuidelines = getCommitConvention();
        const scopeInstruction = getScopeInstruction();
        const generalGuidelines =
            "Use the present tense. Output must be a single line under 74 characters. Use English. NO bullet points, NO body text.";
        const userInputContext = userInputCodeContext(context);

        return `${missionStatement}\n${diffInstruction}\n${conventionGuidelines}\n${SINGLE_MESSAGE_CONSTRAINT}\n${scopeInstruction}\n${generalGuidelines}\n${userInputContext}`;
    })(),
});

export const INIT_DIFF_PROMPT: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
    role: "user",
    content: `diff --git a/src/server.ts b/src/server.ts
    index ad4db42..f3b18a9 100644
    --- a/src/server.ts
    +++ b/src/server.ts
    @@ -10,7 +10,7 @@
    import {
        initWinstonLogger();

        const app = express();
        -const port = 7799;
        +const PORT = 7799;

        app.use(express.json());

        @@ -34,6 +34,6 @@
        app.use((_, res, next) => {
            // ROUTES
            app.use(PROTECTED_ROUTER_URL, protectedRouter);

            -app.listen(port, () => {
                -  console.log(\`Server listening on port \${port}\`);
                +app.listen(process.env.PORT || PORT, () => {
                    +  console.log(\`Server listening on port \${PORT}\`);
                });`,
};

export const getSynthesisPrompt = (context: string): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
    role: "system",
    content: (() => {
        const mission = `${IDENTITY}

You will receive a summary of all changes across multiple files/chunks in a git commit.
Your task is to write **exactly ONE single-line** commit message. Output ONLY the header line, nothing else.`;

        const conventionGuidelines = COMMIT_GUIDELINES;
        const scopeInstruction = getScopeInstruction();
        const generalGuidelines =
            "Use the present tense. Output must be a single line under 74 characters. Use English. NO bullet points, NO body text.";
        const userInputContext = userInputCodeContext(context);

        return `${mission}
${conventionGuidelines}
${SINGLE_MESSAGE_CONSTRAINT}
${scopeInstruction}
${generalGuidelines}
${userInputContext}`;
    })(),
});

export const getMainCommitPrompt = async (
    context: string
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> => {
    return [INIT_MAIN_PROMPT(context), INIT_DIFF_PROMPT];
};
