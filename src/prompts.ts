import { note } from '@clack/prompts';
import { OpenAI } from 'openai';
import { getConfig } from './commands/config';
import { i18n, I18nLocals } from './i18n';
import { configureCommitlintIntegration } from './modules/commitlint/config';
import { commitlintPrompts } from './modules/commitlint/prompts';
import { ConsistencyPrompt } from './modules/commitlint/types';
import * as utils from './modules/commitlint/utils';
import { removeConventionalCommitWord } from './utils/removeConventionalCommitWord';

const config = getConfig();
const translation = i18n[(config.OCO_LANGUAGE as I18nLocals) || 'en'];

export const IDENTITY =
  'You are to act as an author of a commit message in git.';

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

const getDescriptionInstruction = () =>
  config.OCO_DESCRIPTION
    ? 'Add a short description of WHY the changes are done after the commit message. Don\'t start it with "This commit", just describe the changes.'
    : "Don't add any descriptions to the commit, only commit message.";

const getOneLineCommitInstruction = () =>
  config.OCO_ONE_LINE_COMMIT
    ? 'Craft a concise, single sentence, commit message that encapsulates all changes made, with an emphasis on the primary updates. If the modifications share a common theme or scope, mention it succinctly; otherwise, leave the scope out to maintain focus. The goal is to provide a clear and unified overview of the changes in one single message.'
    : '';

const getScopeInstruction = () =>
  config.OCO_OMIT_SCOPE
    ? 'Do not include a scope in the commit message format. Use the format: <type>: <subject>'
    : '';

/**
 * Get the context of the user input
 * @param extraArgs - The arguments passed to the command line
 * @example
 *  $ oco -- This is a context used to generate the commit message
 * @returns - The context of the user input
 */
const userInputCodeContext = (context: string) => {
  if (context !== '' && context !== ' ') {
    return `Additional context provided by the user: <context>${context}</context>\nConsider this context when generating the commit message, incorporating relevant information when appropriate.`;
  }
  return '';
};

const INIT_MAIN_PROMPT = (
  language: string,
  context: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
  role: 'system',
  content: (() => {
    const missionStatement = `${IDENTITY} Your mission is to create clean and comprehensive commit messages following the Conventional Commit Convention and explain WHAT were the changes and mainly WHY the changes were done.`;
    const diffInstruction =
      "I'll send you an output of 'git diff --staged' command, and you are to convert it into a commit message.";
    const conventionGuidelines = getCommitConvention();
    const descriptionGuideline = getDescriptionInstruction();
    const oneLineCommitGuideline = getOneLineCommitInstruction();
    const scopeInstruction = getScopeInstruction();
    const generalGuidelines = `Use the present tense. Lines must not be longer than 74 characters. Use ${language} for the commit message.`;
    const userInputContext = userInputCodeContext(context);

    return `${missionStatement}\n${diffInstruction}\n${conventionGuidelines}\n${descriptionGuideline}\n${oneLineCommitGuideline}\n${scopeInstruction}\n${generalGuidelines}\n${userInputContext}`;
  })()
});

export const INIT_DIFF_PROMPT: OpenAI.Chat.Completions.ChatCompletionMessageParam =
  {
    role: 'user',
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
                });`
  };

const getConsistencyContent = (translation: ConsistencyPrompt) => {
  const fixMessage =
    config.OCO_OMIT_SCOPE && translation.commitFixOmitScope
      ? translation.commitFixOmitScope
      : translation.commitFix;

  const featMessage =
    config.OCO_OMIT_SCOPE && translation.commitFeatOmitScope
      ? translation.commitFeatOmitScope
      : translation.commitFeat;

  const fix = fixMessage;
  const feat = config.OCO_ONE_LINE_COMMIT ? '' : featMessage;

  const description = config.OCO_DESCRIPTION
    ? translation.commitDescription
    : '';

  return [fix, feat, description].filter(Boolean).join('\n');
};

const INIT_CONSISTENCY_PROMPT = (
  translation: ConsistencyPrompt
): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
  role: 'assistant',
  content: getConsistencyContent(translation)
});

export const getMainCommitPrompt = async (
  context: string
): Promise<Array<OpenAI.Chat.Completions.ChatCompletionMessageParam>> => {
  switch (config.OCO_PROMPT_MODULE) {
    case '@commitlint':
      if (!(await utils.commitlintLLMConfigExists())) {
        note(
          `OCO_PROMPT_MODULE is @commitlint but you haven't generated consistency for this project yet.`
        );
        await configureCommitlintIntegration();
      }

      // Replace example prompt with a prompt that's generated by OpenAI for the commitlint config.
      const commitLintConfig = await utils.getCommitlintLLMConfig();

      return [
        commitlintPrompts.INIT_MAIN_PROMPT(
          translation.localLanguage,
          commitLintConfig.prompts
        ),
        INIT_DIFF_PROMPT,
        INIT_CONSISTENCY_PROMPT(
          commitLintConfig.consistency[
            translation.localLanguage
          ] as ConsistencyPrompt
        )
      ];

    default:
      return [
        INIT_MAIN_PROMPT(translation.localLanguage, context),
        INIT_DIFF_PROMPT,
        INIT_CONSISTENCY_PROMPT(translation)
      ];
  }
};
