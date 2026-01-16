#!/usr/bin/env bun
import { cli, command } from "cleye";
import { confirm, intro, isCancel, multiselect, outro, select, spinner, text } from "@clack/prompts";
import chalk from "chalk";
import { execa } from "execa";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { parse, stringify } from "ini";
import axios from "axios";
import { AzureOpenAI } from "openai";
import cl100k_base from "@dqbd/tiktoken/encoders/cl100k_base.json" with { type: "json" };
import { Tiktoken } from "@dqbd/tiktoken/lite";
import ignore from "ignore";

//#region package.json
var version = "3.2.10";
var description = "Auto-generate impressive commits in 1 second. Killing lame commits with AI 🤯🔫";

//#endregion
//#region src/commands/enum.ts
const COMMANDS = { config: "config" };

//#endregion
//#region src/commands/config.ts
const CONFIG_KEYS = {
	OCO_API_KEY: "OCO_API_KEY",
	OCO_TOKENS_MAX_INPUT: "OCO_TOKENS_MAX_INPUT",
	OCO_TOKENS_MAX_OUTPUT: "OCO_TOKENS_MAX_OUTPUT",
	OCO_DESCRIPTION: "OCO_DESCRIPTION",
	OCO_EMOJI: "OCO_EMOJI",
	OCO_MODEL: "OCO_MODEL",
	OCO_WHY: "OCO_WHY",
	OCO_MESSAGE_TEMPLATE_PLACEHOLDER: "OCO_MESSAGE_TEMPLATE_PLACEHOLDER",
	OCO_AI_PROVIDER: "OCO_AI_PROVIDER",
	OCO_ONE_LINE_COMMIT: "OCO_ONE_LINE_COMMIT",
	OCO_API_URL: "OCO_API_URL",
	OCO_API_CUSTOM_HEADERS: "OCO_API_CUSTOM_HEADERS",
	OCO_OMIT_SCOPE: "OCO_OMIT_SCOPE",
	OCO_GITPUSH: "OCO_GITPUSH"
};
const CONFIG_MODES = {
	get: "get",
	set: "set",
	describe: "describe"
};
const MODEL_LIST = { azure: ["gpt-4.1-mini"] };
const getDefaultModel = (_provider) => {
	return MODEL_LIST.azure[0] || "gpt-4.1-mini";
};
const DEFAULT_TOKEN_LIMITS = {
	DEFAULT_MAX_TOKENS_INPUT: 4096,
	DEFAULT_MAX_TOKENS_OUTPUT: 500
};
const validateConfig = (key, condition, validationMessage) => {
	if (!condition) {
		outro(`${chalk.red("✖")} wrong value for ${key}: ${validationMessage}.`);
		outro("For more help refer to docs https://github.com/di-sukharev/opencommit");
		process.exit(1);
	}
};
const configValidators = {
	[CONFIG_KEYS.OCO_API_KEY](value) {
		validateConfig("OCO_API_KEY", !!value, "You need to provide the OCO_API_KEY when OCO_AI_PROVIDER set to \"azure\".");
		return value;
	},
	[CONFIG_KEYS.OCO_DESCRIPTION](value) {
		validateConfig(CONFIG_KEYS.OCO_DESCRIPTION, typeof value === "boolean", "Must be boolean: true or false");
		return value;
	},
	[CONFIG_KEYS.OCO_API_CUSTOM_HEADERS](value) {
		try {
			if (typeof value === "string") JSON.parse(value);
			return value;
		} catch (error) {
			validateConfig(CONFIG_KEYS.OCO_API_CUSTOM_HEADERS, false, "Must be a valid JSON string of headers");
		}
	},
	[CONFIG_KEYS.OCO_TOKENS_MAX_INPUT](value) {
		value = Number.parseInt(String(value), 10);
		validateConfig(CONFIG_KEYS.OCO_TOKENS_MAX_INPUT, !Number.isNaN(value), "Must be a number");
		return value;
	},
	[CONFIG_KEYS.OCO_TOKENS_MAX_OUTPUT](value) {
		value = Number.parseInt(String(value), 10);
		validateConfig(CONFIG_KEYS.OCO_TOKENS_MAX_OUTPUT, !Number.isNaN(value), "Must be a number");
		return value;
	},
	[CONFIG_KEYS.OCO_EMOJI](value) {
		validateConfig(CONFIG_KEYS.OCO_EMOJI, typeof value === "boolean", "Must be boolean: true or false");
		return value;
	},
	[CONFIG_KEYS.OCO_OMIT_SCOPE](value) {
		validateConfig(CONFIG_KEYS.OCO_OMIT_SCOPE, typeof value === "boolean", "Must be boolean: true or false");
		return value;
	},
	[CONFIG_KEYS.OCO_API_URL](value) {
		validateConfig(CONFIG_KEYS.OCO_API_URL, typeof value === "string", `${value} is not a valid URL. It should start with 'http://' or 'https://'.`);
		return value;
	},
	[CONFIG_KEYS.OCO_MODEL](value) {
		validateConfig(CONFIG_KEYS.OCO_MODEL, typeof value === "string", `${value} is not supported.`);
		return value;
	},
	[CONFIG_KEYS.OCO_MESSAGE_TEMPLATE_PLACEHOLDER](value) {
		validateConfig(CONFIG_KEYS.OCO_MESSAGE_TEMPLATE_PLACEHOLDER, value.startsWith("$"), `${value} must start with $, for example: '$msg'`);
		return value;
	},
	[CONFIG_KEYS.OCO_GITPUSH](value) {
		validateConfig(CONFIG_KEYS.OCO_GITPUSH, typeof value === "boolean", "Must be true or false");
		return value;
	},
	[CONFIG_KEYS.OCO_AI_PROVIDER](value) {
		validateConfig(CONFIG_KEYS.OCO_AI_PROVIDER, value === "azure", `${value} is not supported, use 'azure'`);
		return value;
	},
	[CONFIG_KEYS.OCO_ONE_LINE_COMMIT](value) {
		validateConfig(CONFIG_KEYS.OCO_ONE_LINE_COMMIT, typeof value === "boolean", "Must be true or false");
		return value;
	},
	[CONFIG_KEYS.OCO_WHY](value) {
		validateConfig(CONFIG_KEYS.OCO_WHY, typeof value === "boolean", "Must be true or false");
		return value;
	}
};
const OCO_AI_PROVIDER_ENUM = { AZURE: "azure" };
const defaultConfigPath = join(homedir(), ".opencommit");
const defaultEnvPath = resolve(process.cwd(), ".env");
const DEFAULT_CONFIG = {
	OCO_TOKENS_MAX_INPUT: DEFAULT_TOKEN_LIMITS.DEFAULT_MAX_TOKENS_INPUT,
	OCO_TOKENS_MAX_OUTPUT: DEFAULT_TOKEN_LIMITS.DEFAULT_MAX_TOKENS_OUTPUT,
	OCO_DESCRIPTION: false,
	OCO_EMOJI: false,
	OCO_MODEL: getDefaultModel("azure"),
	OCO_MESSAGE_TEMPLATE_PLACEHOLDER: "$msg",
	OCO_AI_PROVIDER: OCO_AI_PROVIDER_ENUM.AZURE,
	OCO_ONE_LINE_COMMIT: false,
	OCO_WHY: false,
	OCO_OMIT_SCOPE: false,
	OCO_GITPUSH: true
};
const initGlobalConfig = (configPath = defaultConfigPath) => {
	writeFileSync(configPath, stringify(DEFAULT_CONFIG), "utf8");
	return DEFAULT_CONFIG;
};
const parseConfigVarValue = (value) => {
	try {
		if (typeof value === "string") return JSON.parse(value);
		return value;
	} catch (error) {
		return value;
	}
};
const getEnvConfig = () => {
	return {
		OCO_MODEL: process.env.OCO_MODEL,
		OCO_API_URL: process.env.OCO_API_URL,
		OCO_API_KEY: process.env.OCO_API_KEY,
		OCO_API_CUSTOM_HEADERS: process.env.OCO_API_CUSTOM_HEADERS,
		OCO_AI_PROVIDER: process.env.OCO_AI_PROVIDER,
		OCO_TOKENS_MAX_INPUT: parseConfigVarValue(process.env.OCO_TOKENS_MAX_INPUT),
		OCO_TOKENS_MAX_OUTPUT: parseConfigVarValue(process.env.OCO_TOKENS_MAX_OUTPUT),
		OCO_DESCRIPTION: parseConfigVarValue(process.env.OCO_DESCRIPTION),
		OCO_EMOJI: parseConfigVarValue(process.env.OCO_EMOJI),
		OCO_MESSAGE_TEMPLATE_PLACEHOLDER: process.env.OCO_MESSAGE_TEMPLATE_PLACEHOLDER,
		OCO_ONE_LINE_COMMIT: parseConfigVarValue(process.env.OCO_ONE_LINE_COMMIT),
		OCO_OMIT_SCOPE: parseConfigVarValue(process.env.OCO_OMIT_SCOPE),
		OCO_GITPUSH: parseConfigVarValue(process.env.OCO_GITPUSH)
	};
};
const setGlobalConfig = (config$3, configPath = defaultConfigPath) => {
	writeFileSync(configPath, stringify(config$3), "utf8");
};
const getIsGlobalConfigFileExist = (configPath = defaultConfigPath) => {
	return existsSync(configPath);
};
const getGlobalConfig = (configPath = defaultConfigPath) => {
	let globalConfig;
	if (getIsGlobalConfigFileExist(configPath)) globalConfig = parse(readFileSync(configPath, "utf8"));
	else globalConfig = initGlobalConfig(configPath);
	return globalConfig;
};
/**
* Merges two configs.
* Env config takes precedence over global ~/.opencommit config file
* @param main - env config
* @param fallback - global ~/.opencommit config file
* @returns merged config
*/
const mergeConfigs = (main, fallback) => {
	const allKeys = new Set([...Object.keys(main), ...Object.keys(fallback)]);
	return Array.from(allKeys).reduce((acc, key) => {
		acc[key] = parseConfigVarValue(main[key] ?? fallback[key]);
		return acc;
	}, {});
};
const cleanUndefinedValues = (config$3) => {
	return Object.fromEntries(Object.entries(config$3).map(([_, v]) => {
		try {
			if (typeof v === "string") {
				if (v === "undefined") return [_, void 0];
				if (v === "null") return [_, null];
				return [_, JSON.parse(v)];
			}
			return [_, v];
		} catch (error) {
			return [_, v];
		}
	}));
};
const getConfig = ({ globalPath = defaultConfigPath } = {}) => {
	return cleanUndefinedValues(mergeConfigs(getEnvConfig(), getGlobalConfig(globalPath)));
};
const setConfig = (keyValues, globalConfigPath = defaultConfigPath) => {
	const config$3 = getConfig({ globalPath: globalConfigPath });
	const configToSet = {};
	for (const [key, value] of keyValues) {
		if (!Object.hasOwn(configValidators, key)) {
			const supportedKeys = Object.keys(configValidators).join("\n");
			throw new Error(`Unsupported config key: ${key}. Expected keys are:\n\n${supportedKeys}.\n\nFor more help refer to our docs: https://github.com/di-sukharev/opencommit`);
		}
		let parsedConfigValue;
		try {
			if (typeof value === "string") parsedConfigValue = JSON.parse(value);
			else parsedConfigValue = value;
		} catch (error) {
			parsedConfigValue = value;
		}
		configToSet[key] = configValidators[key](parsedConfigValue);
	}
	setGlobalConfig(mergeConfigs(configToSet, config$3), globalConfigPath);
	outro(`${chalk.green("✔")} config successfully set`);
};
function getConfigKeyDetails(key) {
	switch (key) {
		case CONFIG_KEYS.OCO_MODEL: return {
			description: "The AI model to use for generating commit messages",
			values: MODEL_LIST
		};
		case CONFIG_KEYS.OCO_AI_PROVIDER: return {
			description: "The AI provider to use",
			values: Object.values(OCO_AI_PROVIDER_ENUM)
		};
		case CONFIG_KEYS.OCO_DESCRIPTION: return {
			description: "Postface a message with ~3 sentences description of the changes",
			values: ["true", "false"]
		};
		case CONFIG_KEYS.OCO_EMOJI: return {
			description: "Preface a message with GitMoji",
			values: ["true", "false"]
		};
		case CONFIG_KEYS.OCO_WHY: return {
			description: "Output a short description of why the changes were done after the commit message (default: false)",
			values: ["true", "false"]
		};
		case CONFIG_KEYS.OCO_OMIT_SCOPE: return {
			description: "Do not include a scope in the commit message",
			values: ["true", "false"]
		};
		case CONFIG_KEYS.OCO_GITPUSH: return {
			description: "Push to git after commit (deprecated). If false, oco will exit after committing",
			values: ["true", "false"]
		};
		case CONFIG_KEYS.OCO_TOKENS_MAX_INPUT: return {
			description: "Max model token limit",
			values: ["Any positive integer"]
		};
		case CONFIG_KEYS.OCO_TOKENS_MAX_OUTPUT: return {
			description: "Max response tokens",
			values: ["Any positive integer"]
		};
		case CONFIG_KEYS.OCO_API_KEY: return {
			description: "API key for the selected provider",
			values: ["String (required for most providers)"]
		};
		case CONFIG_KEYS.OCO_API_URL: return {
			description: "Custom API URL - may be used to set proxy path to OpenAI API",
			values: ["URL string (must start with 'http://' or 'https://')"]
		};
		case CONFIG_KEYS.OCO_MESSAGE_TEMPLATE_PLACEHOLDER: return {
			description: "Message template placeholder",
			values: ["String (must start with $)"]
		};
		case CONFIG_KEYS.OCO_ONE_LINE_COMMIT: return {
			description: "One line commit message",
			values: ["true", "false"]
		};
		default: return {
			description: "String value",
			values: ["Any string"]
		};
	}
}
function printConfigKeyHelp(param) {
	if (!Object.values(CONFIG_KEYS).includes(param)) {
		console.log(chalk.red(`Unknown config parameter: ${param}`));
		return;
	}
	const details = getConfigKeyDetails(param);
	const desc = details.description;
	let defaultValue;
	if (param in DEFAULT_CONFIG) defaultValue = DEFAULT_CONFIG[param];
	console.log(chalk.bold(`\n${param}:`));
	console.log(chalk.gray(`  Description: ${desc}`));
	if (defaultValue !== void 0) if (typeof defaultValue === "string") console.log(chalk.gray(`  Default: ${defaultValue}`));
	else console.log(chalk.gray(`  Default: ${defaultValue}`));
	if (Array.isArray(details.values)) {
		console.log(chalk.gray("  Accepted values:"));
		for (const value of details.values) console.log(chalk.gray(`    - ${value}`));
	} else {
		console.log(chalk.gray("  Accepted values by provider:"));
		for (const [provider, values] of Object.entries(details.values)) {
			console.log(chalk.gray(`    ${provider}:`));
			for (const value of values) console.log(chalk.gray(`      - ${value}`));
		}
	}
}
function printAllConfigHelp() {
	console.log(chalk.bold("Available config parameters:"));
	for (const key of Object.values(CONFIG_KEYS).sort()) {
		const details = getConfigKeyDetails(key);
		let defaultValue;
		if (key in DEFAULT_CONFIG) defaultValue = DEFAULT_CONFIG[key];
		console.log(chalk.bold(`\n${key}:`));
		console.log(chalk.gray(`  Description: ${details.description}`));
		if (defaultValue !== void 0) if (typeof defaultValue === "string") console.log(chalk.gray(`  Default: ${defaultValue}`));
		else console.log(chalk.gray(`  Default: ${defaultValue}`));
	}
	console.log(chalk.yellow("\nUse \"oco config describe [PARAMETER]\" to see accepted values and more details for a specific config parameter."));
}
const configCommand = command({
	name: COMMANDS.config,
	parameters: ["<mode>", "[key=values...]"],
	help: {
		description: "Configure opencommit settings",
		examples: [
			"Describe all config parameters: oco config describe",
			"Describe a specific parameter: oco config describe OCO_MODEL",
			"Get a config value: oco config get OCO_MODEL",
			"Set a config value: oco config set OCO_MODEL=gpt-4"
		]
	}
}, async (argv) => {
	try {
		const { mode, keyValues } = argv._;
		intro(`COMMAND: config ${mode} ${keyValues}`);
		if (mode === CONFIG_MODES.describe) {
			if (!keyValues || keyValues.length === 0) printAllConfigHelp();
			else for (const key of keyValues) printConfigKeyHelp(key);
			process.exit(0);
		} else if (mode === CONFIG_MODES.get) {
			if (!keyValues || keyValues.length === 0) throw new Error("No config keys specified for get mode");
			const config$3 = getConfig() || {};
			for (const key of keyValues) outro(`${key}=${config$3[key]}`);
		} else if (mode === CONFIG_MODES.set) {
			if (!keyValues || keyValues.length === 0) throw new Error("No config keys specified for set mode");
			await setConfig(keyValues.map((keyValue) => keyValue.split("=")));
		} else throw new Error(`Unsupported mode: ${mode}. Valid modes are: "set", "get", and "describe"`);
	} catch (error) {
		outro(`${chalk.red("✖")} ${error}`);
		process.exit(1);
	}
});

//#endregion
//#region src/prompts.ts
const config$2 = getConfig();
const IDENTITY = "You are to act as an author of a commit message in git.";
/**
* Critical constraint to ensure only ONE commit message is generated.
* This prevents the multi-header bug when processing large diffs.
*/
const SINGLE_MESSAGE_CONSTRAINT = `
## Critical Output Rules:
- You MUST generate exactly ONE commit message
- NEVER output multiple commit headers (e.g., "feat: X\\n\\nfix: Y" is INVALID)
- If multiple things changed, pick the most significant type
- Use the commit body to mention secondary changes if needed
- When in doubt, prefer: feat > fix > refactor > chore`;
/**
* SUMMARY_PROMPT for Map phase - analyzes diff chunks and extracts key changes.
* Used when diffs are too large and need to be processed in chunks.
*/
const SUMMARY_PROMPT = {
	role: "system",
	content: `You are a code analyst. Analyze the following git diff and extract the key technical changes.

## Instructions:
- Return a concise bulleted list of changes (3-5 items max)
- Focus on WHAT changed, not WHY
- Include file names where relevant
- Do NOT write a commit message or commit header
- Do NOT use prefixes like "feat:", "fix:", etc.
- Be technical and specific
- Keep each bullet point to one line

## Example Output:
- Added user authentication middleware in \`auth.ts\`
- Updated API endpoint path from /v1 to /v2 in \`routes.ts\`
- Fixed null pointer exception in error handler
- Removed deprecated logging utility`
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
const getDescriptionInstruction = () => config$2.OCO_DESCRIPTION ? "Add a short description of WHY the changes are done after the commit message. Don't start it with \"This commit\", just describe the changes." : "Don't add any descriptions to the commit, only commit message.";
const getOneLineCommitInstruction = () => config$2.OCO_ONE_LINE_COMMIT ? "Craft a concise, single sentence, commit message that encapsulates all changes made, with an emphasis on the primary updates. If the modifications share a common theme or scope, mention it succinctly; otherwise, leave the scope out to maintain focus. The goal is to provide a clear and unified overview of the changes in one single message." : "";
const getScopeInstruction = () => config$2.OCO_OMIT_SCOPE ? "Do not include a scope in the commit message format. Use the format: <type>: <subject>" : "";
const userInputCodeContext = (context) => {
	if (context !== "" && context !== " ") return `Additional context provided by the user: <context>${context}</context>\nConsider this context when generating the commit message, incorporating relevant information when appropriate.`;
	return "";
};
const INIT_MAIN_PROMPT = (context) => ({
	role: "system",
	content: `${`${IDENTITY} Your mission is to create clean and comprehensive commit messages following the Conventional Commit Convention and explain WHAT were the changes and mainly WHY the changes were done.`}\nI'll send you an output of 'git diff --staged' command, and you are to convert it into a commit message.\n${getCommitConvention()}\n${SINGLE_MESSAGE_CONSTRAINT}\n${getDescriptionInstruction()}\n${getOneLineCommitInstruction()}\n${getScopeInstruction()}\nUse the present tense. Lines must not be longer than 74 characters. Use English for the commit message.\n${userInputCodeContext(context)}`
});
const INIT_DIFF_PROMPT = {
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
                });`
};
const getSynthesisPrompt = (context) => ({
	role: "system",
	content: `${`${IDENTITY}

You will receive a summary of all changes across multiple files/chunks in a git commit.
Your task is to write **exactly ONE** commit message that covers all changes.`}
${COMMIT_GUIDELINES}
${SINGLE_MESSAGE_CONSTRAINT}
${getDescriptionInstruction()}
${getOneLineCommitInstruction()}
${getScopeInstruction()}
Use the present tense. Lines must not be longer than 74 characters. Use English for the commit message.
${userInputCodeContext(context)}`
});
const getMainCommitPrompt = async (context) => {
	return [INIT_MAIN_PROMPT(context), INIT_DIFF_PROMPT];
};

//#endregion
//#region src/utils/remove-content-tags.ts
/**
* Removes content wrapped in specified tags from a string
* @param content The content string to process
* @param tag The tag name without angle brackets (e.g., 'think' for '<think></think>')
* @returns The content with the specified tags and their contents removed, and trimmed
*/
function removeContentTags(content, tag) {
	if (!content || typeof content !== "string") return content;
	const openTag = `<${tag}>`;
	const closeTag = `</${tag}>`;
	let result = "";
	let skipUntil = null;
	let depth = 0;
	for (let i = 0; i < content.length; i++) {
		if (content.substring(i, i + openTag.length) === openTag) {
			depth++;
			if (depth === 1) {
				skipUntil = content.indexOf(closeTag, i + openTag.length);
				i = i + openTag.length - 1;
				continue;
			}
		} else if (content.substring(i, i + closeTag.length) === closeTag && depth > 0) {
			depth--;
			if (depth === 0) {
				i = i + closeTag.length - 1;
				skipUntil = null;
				continue;
			}
		}
		if (skipUntil === null) result += content[i];
	}
	result = result.replace(/[ \t]+/g, " ").trim();
	return result;
}

//#endregion
//#region src/utils/token-count.ts
let cachedEncoder = null;
function getEncoder() {
	if (!cachedEncoder) cachedEncoder = new Tiktoken(cl100k_base.bpe_ranks, cl100k_base.special_tokens, cl100k_base.pat_str);
	return cachedEncoder;
}
function tokenCount(content) {
	return getEncoder().encode(content).length;
}

//#endregion
//#region src/engine/azure.ts
var AzureEngine = class {
	config;
	client;
	constructor(config$3) {
		this.config = config$3;
		this.client = new AzureOpenAI({
			endpoint: this.config.baseURL,
			apiKey: this.config.apiKey,
			apiVersion: "2024-08-01-preview"
		});
	}
	generateCommitMessage = async (messages) => {
		try {
			if (messages.map((msg) => tokenCount(msg.content) + 4).reduce((a, b) => a + b, 0) > this.config.maxTokensInput - this.config.maxTokensOutput) throw new Error(GenerateCommitMessageErrorEnum.tooMuchTokens);
			const message = (await this.client.chat.completions.create({
				model: this.config.model,
				messages
			})).choices[0].message;
			if (message?.content === null) return;
			const content = message?.content;
			return removeContentTags(content, "think");
		} catch (error) {
			outro(`${chalk.red("✖")} ${this.config.model}`);
			const err = error;
			outro(`${chalk.red("✖")} ${JSON.stringify(error)}`);
			if (axios.isAxiosError(error) && error.response?.status === 401) {
				const openAiError = error.response.data.error;
				if (openAiError?.message) outro(openAiError.message);
				outro("For help look into README https://github.com/di-sukharev/opencommit#setup");
			}
			throw err;
		}
	};
};

//#endregion
//#region src/utils/engine.ts
function parseCustomHeaders(headers) {
	let parsedHeaders = {};
	if (!headers) return parsedHeaders;
	try {
		if (typeof headers === "object" && !Array.isArray(headers)) parsedHeaders = headers;
		else parsedHeaders = JSON.parse(headers);
	} catch (error) {
		console.warn("Invalid OCO_API_CUSTOM_HEADERS format, ignoring custom headers");
	}
	return parsedHeaders;
}
function getEngine() {
	const config$3 = getConfig();
	const provider = config$3.OCO_AI_PROVIDER;
	const customHeaders = parseCustomHeaders(config$3.OCO_API_CUSTOM_HEADERS);
	const DEFAULT_CONFIG$1 = {
		model: config$3.OCO_MODEL,
		maxTokensOutput: config$3.OCO_TOKENS_MAX_OUTPUT,
		maxTokensInput: config$3.OCO_TOKENS_MAX_INPUT,
		baseURL: config$3.OCO_API_URL ?? "",
		apiKey: config$3.OCO_API_KEY ?? "",
		customHeaders
	};
	if (provider === OCO_AI_PROVIDER_ENUM.AZURE) return new AzureEngine(DEFAULT_CONFIG$1);
	throw new Error(`Unsupported provider: ${provider}. Only 'azure' is supported.`);
}

//#endregion
//#region src/utils/extract-file-name.ts
/**
* Extracts the file name from a git diff chunk.
* Parses the "a/file.ts b/file.ts" format from diff headers.
*
* @param fileDiff - A single file's diff content (without the "diff --git " prefix)
* @returns The extracted file name, or 'unknown' if parsing fails
*/
const DIFF_FILE_REGEX = /^a\/(.+?)\s+b\//;
const FALLBACK_REGEX = /\+\+\+ b\/(.+)/;
function extractFileName(fileDiff) {
	const match = fileDiff.match(DIFF_FILE_REGEX);
	if (match) return match[1];
	const plusMatch = fileDiff.match(FALLBACK_REGEX);
	if (plusMatch) return plusMatch[1];
	return "unknown";
}

//#endregion
//#region src/utils/merge-diffs.ts
function mergeDiffs(arr, maxStringLength) {
	const mergedArr = [];
	let currentItem = arr[0];
	for (const item of arr.slice(1)) if (tokenCount(currentItem + item) <= maxStringLength) currentItem += item;
	else {
		mergedArr.push(currentItem);
		currentItem = item;
	}
	mergedArr.push(currentItem);
	return mergedArr;
}

//#endregion
//#region src/utils/slice-to-token-limit.ts
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
function sliceToTokenLimit(text$1, maxTokens) {
	if (maxTokens <= 0) return "";
	if (tokenCount(text$1) <= maxTokens) return text$1;
	let low = 0;
	let high = text$1.length;
	let result = "";
	while (low < high) {
		const mid = Math.floor((low + high + 1) / 2);
		const slice = text$1.substring(0, mid);
		if (tokenCount(slice) <= maxTokens) {
			result = slice;
			low = mid;
		} else high = mid - 1;
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
function splitToTokenChunks(text$1, maxTokens) {
	if (maxTokens <= 0) throw new Error("maxTokens must be positive");
	const chunks = [];
	let remaining = text$1;
	while (remaining.length > 0) {
		if (tokenCount(remaining) <= maxTokens) {
			chunks.push(remaining);
			break;
		}
		const chunk = sliceToTokenLimit(remaining, maxTokens);
		if (chunk.length === 0) {
			chunks.push(remaining.substring(0, 1));
			remaining = remaining.substring(1);
		} else {
			chunks.push(chunk);
			remaining = remaining.substring(chunk.length);
		}
	}
	return chunks;
}

//#endregion
//#region src/utils/token-budget.ts
/**
* Computes the available token budget for diff content.
*
* This centralizes all token arithmetic to avoid drift between different
* parts of the codebase and provides early validation.
*
* @param options - Token budget computation options
* @returns Structured result with budget info and validity
*/
function computeTokenBudget(options) {
	const { promptMessages, maxInputTokens, maxOutputTokens, adjustmentFactor = 20 } = options;
	const promptTokens = promptMessages.reduce((total, msg) => {
		return total + tokenCount(msg.content) + 4;
	}, 0);
	const maxDiffTokens = maxInputTokens - adjustmentFactor - promptTokens - maxOutputTokens;
	if (maxDiffTokens <= 0) return {
		maxDiffTokens,
		promptTokens,
		isValid: false,
		errorReason: `Token budget exhausted: prompt uses ${promptTokens} tokens, output reserves ${maxOutputTokens} tokens, but max input is only ${maxInputTokens}. Try reducing OCO_TOKENS_MAX_OUTPUT or using a model with higher context limits.`
	};
	return {
		maxDiffTokens,
		promptTokens,
		isValid: true
	};
}
/**
* Error thrown when token budget is invalid.
*/
var TokenBudgetError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "TokenBudgetError";
	}
};

//#endregion
//#region src/utils/validate-commit-message.ts
/**
* Valid conventional commit types in priority order.
*/
const VALID_TYPES = [
	"feat",
	"fix",
	"refactor",
	"perf",
	"chore",
	"deps",
	"i18n",
	"locale",
	"translation",
	"style",
	"format",
	"security",
	"revert",
	"build",
	"compat",
	"test",
	"ci",
	"docs",
	"deprecated"
];
/**
* Regex to match a conventional commit header.
* Matches: type(scope): subject  OR  type: subject
*/
const HEADER_PATTERN = new RegExp(`^(${VALID_TYPES.join("|")})(\\([^)]+\\))?:\\s*.+`, "i");
/**
* Regex to match a header line anywhere in text.
*/
const HEADER_LINE_PATTERN = new RegExp(`^(${VALID_TYPES.join("|")})(\\([^)]+\\))?:\\s*.+`, "gim");
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
function validateCommitMessage(message, options = {}) {
	const { maxSubjectLength = 50, requireScope = false } = options;
	const errors = [];
	const lines = message.trim().split("\n");
	if (lines.length === 0 || !lines[0].trim()) return {
		isValid: false,
		errors: ["Empty commit message"],
		headerCount: 0
	};
	const firstLine = lines[0].trim();
	if (!HEADER_PATTERN.test(firstLine)) errors.push(`First line is not a valid conventional commit header: "${firstLine}"`);
	const colonIndex = firstLine.indexOf(":");
	if (colonIndex > -1) {
		const subject = firstLine.substring(colonIndex + 1).trim();
		if (subject.length > maxSubjectLength) errors.push(`Subject line exceeds ${maxSubjectLength} characters (${subject.length})`);
	}
	if (requireScope && !firstLine.includes("(")) errors.push("Scope is required but not present");
	const allHeaders = message.match(HEADER_LINE_PATTERN) || [];
	const additionalHeaders = allHeaders.slice(1);
	if (additionalHeaders.length > 0) errors.push(`Multiple commit headers detected. Only one header is allowed. Additional headers found: ${additionalHeaders.join(", ")}`);
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
async function repairCommitMessage(invalidMessage) {
	const engine = getEngine();
	const repairPrompt = [{
		role: "system",
		content: `You are a commit message formatter. The following commit message is invalid because it contains multiple headers or doesn't follow conventional commit format.

Rewrite it as EXACTLY ONE valid conventional commit message.

Rules:
- Use format: type(scope): subject
- Pick the most significant type if multiple changes exist
- Keep subject under 50 characters
- Mention other changes in the body if needed
- Types: feat, fix, refactor, perf, chore, docs, test, ci, build, style, revert

Output ONLY the rewritten commit message, nothing else.`
	}, {
		role: "user",
		content: invalidMessage
	}];
	try {
		const repaired = await engine.generateCommitMessage(repairPrompt);
		if (repaired) {
			if (validateCommitMessage(repaired).isValid) return repaired;
		}
	} catch {}
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
function collapseMultipleHeaders(message, validation) {
	if (!validation.firstHeader) return `chore: ${message.trim().split("\n")[0].substring(0, 50)}`;
	if (!validation.additionalHeaders || validation.additionalHeaders.length === 0) return message;
	const lines = message.split("\n");
	const bodyLines = [];
	for (const line of lines.slice(1)) if (HEADER_PATTERN.test(line.trim())) bodyLines.push(`- ${line.trim()}`);
	else bodyLines.push(line);
	const body = bodyLines.join("\n").trim();
	if (body) return `${validation.firstHeader}\n\n${body}`;
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
async function ensureValidCommitMessage(message, options = {}) {
	const validation = validateCommitMessage(message, options);
	if (validation.isValid) return message;
	if (validation.headerCount > 1) {
		const repaired = await repairCommitMessage(message);
		if (repaired) return repaired;
		return collapseMultipleHeaders(message, validation);
	}
	return message;
}

//#endregion
//#region src/generate-commit-message-from-git-diff.ts
const config$1 = getConfig();
const MAX_TOKENS_INPUT = config$1.OCO_TOKENS_MAX_INPUT;
const MAX_TOKENS_OUTPUT = config$1.OCO_TOKENS_MAX_OUTPUT;
const GenerateCommitMessageErrorEnum = {
	tooMuchTokens: "TOO_MUCH_TOKENS",
	internalError: "INTERNAL_ERROR",
	emptyMessage: "EMPTY_MESSAGE",
	outputTokensTooHigh: `Token limit exceeded, OCO_TOKENS_MAX_OUTPUT must not be much higher than the default ${DEFAULT_TOKEN_LIMITS.DEFAULT_MAX_TOKENS_OUTPUT} tokens.`
};
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
const MAX_BACKOFF_MS = 1e4;
/** Maximum recursion depth for reduce phase */
const MAX_REDUCTION_DEPTH = 5;
/**
* Creates the chat completion prompt for direct commit message generation.
*/
const generateCommitMessageChatCompletionPrompt = async (diff, context) => {
	return [...await getMainCommitPrompt(context), {
		role: "user",
		content: diff
	}];
};
/**
* Delays execution with exponential backoff and jitter.
* @param attempt - The current attempt number (0-indexed)
* @returns Promise that resolves after the delay
*/
function exponentialBackoff(attempt) {
	const baseDelay = Math.min(INITIAL_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
	const delay = baseDelay + Math.random() * baseDelay * .5;
	return new Promise((resolve$1) => setTimeout(resolve$1, delay));
}
/**
* Splits a diff string by lines when it exceeds token limits.
* Uses token-aware slicing to guarantee each chunk fits within limits.
*/
function splitDiffByLines(diff, maxTokens) {
	if (maxTokens <= 0) throw new Error(GenerateCommitMessageErrorEnum.outputTokensTooHigh);
	const lines = diff.split("\n");
	const chunks = [];
	let currentChunk = "";
	for (const line of lines) {
		if (tokenCount(line) > maxTokens) {
			if (currentChunk) {
				chunks.push(currentChunk);
				currentChunk = "";
			}
			const lineChunks = splitToTokenChunks(line, maxTokens);
			chunks.push(...lineChunks);
			continue;
		}
		const potentialChunk = currentChunk + (currentChunk ? "\n" : "") + line;
		if (tokenCount(potentialChunk) > maxTokens) {
			if (currentChunk) chunks.push(currentChunk);
			currentChunk = line;
		} else currentChunk = potentialChunk;
	}
	if (currentChunk) chunks.push(currentChunk);
	return chunks;
}
/**
* Splits a diff into chunks by file boundaries using regex anchors.
* Prioritizes keeping each file together, but will split large files if needed.
*/
function splitDiffByFiles(diff, maxTokens) {
	const fileDiffs = diff.split(DIFF_FILE_PATTERN).slice(1).map((part) => `diff --git ${part}`);
	const chunks = [];
	let currentChunk = {
		content: "",
		files: [],
		tokenCount: 0
	};
	for (const fileDiff of fileDiffs) {
		const fileTokens = tokenCount(fileDiff);
		const fileName = extractFileName(fileDiff.substring(11));
		if (currentChunk.tokenCount + fileTokens > maxTokens && currentChunk.content) {
			chunks.push(currentChunk);
			currentChunk = {
				content: "",
				files: [],
				tokenCount: 0
			};
		}
		if (fileTokens > maxTokens) {
			if (currentChunk.content) {
				chunks.push(currentChunk);
				currentChunk = {
					content: "",
					files: [],
					tokenCount: 0
				};
			}
			const subChunks = splitLargeFileDiff(fileDiff, maxTokens);
			for (const subContent of subChunks) chunks.push({
				content: subContent,
				files: [fileName],
				tokenCount: tokenCount(subContent)
			});
		} else {
			currentChunk.content += fileDiff;
			currentChunk.files.push(fileName);
			currentChunk.tokenCount += fileTokens;
		}
	}
	if (currentChunk.content) chunks.push(currentChunk);
	return chunks;
}
/**
* Splits a large single-file diff into smaller chunks by hunk boundaries.
* Uses regex anchored to line start for reliable hunk detection.
*/
function splitLargeFileDiff(fileDiff, maxTokens) {
	const hunkMatch = fileDiff.match(HUNK_PATTERN);
	if (!hunkMatch || hunkMatch.index === void 0) return splitDiffByLines(fileDiff, maxTokens);
	const fileHeader = fileDiff.substring(0, hunkMatch.index);
	const hunksContent = fileDiff.substring(hunkMatch.index);
	const headerTokens = tokenCount(fileHeader);
	if (headerTokens >= maxTokens) return splitDiffByLines(fileDiff, maxTokens);
	const mergedHunks = mergeDiffs(hunksContent.split(HUNK_PATTERN).slice(1).map((part) => `@@ ${part}`), maxTokens - headerTokens);
	const result = [];
	for (const hunk of mergedHunks) {
		const fullDiff = fileHeader + hunk;
		if (tokenCount(fullDiff) > maxTokens) {
			const lineSplit = splitDiffByLines(fullDiff, maxTokens);
			result.push(...lineSplit);
		} else result.push(fullDiff);
	}
	return result;
}
/**
* Runs promises with bounded concurrency.
*/
async function runWithConcurrency(items, fn, concurrency) {
	const queue = items.map((item, index) => ({
		item,
		index
	}));
	const running = [];
	while (queue.length > 0 || running.length > 0) {
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
		if (running.length > 0) await Promise.race(running);
	}
}
/**
* MAP PHASE: Analyzes each diff chunk and extracts a summary of changes.
* Uses bounded concurrency and exponential backoff for reliability.
*/
async function getDiffSummaries(chunks) {
	const engine = getEngine();
	const summaries = new Array(chunks.length);
	let lastAttemptTime = 0;
	await runWithConcurrency(chunks, async (chunk, index) => {
		const messages = [SUMMARY_PROMPT, {
			role: "user",
			content: chunk.content
		}];
		if (Date.now() - lastAttemptTime < INITIAL_BACKOFF_MS) await exponentialBackoff(0);
		lastAttemptTime = Date.now();
		let attempts = 0;
		const maxAttempts = 3;
		while (attempts < maxAttempts) try {
			summaries[index] = {
				summary: await engine.generateCommitMessage(messages) || `Changes in: ${chunk.files.join(", ")}`,
				files: chunk.files
			};
			return;
		} catch (error) {
			attempts++;
			if (attempts < maxAttempts) await exponentialBackoff(attempts);
		}
		summaries[index] = {
			summary: `Changes in: ${chunk.files.join(", ")}`,
			files: chunk.files
		};
	}, MAX_CONCURRENCY);
	return summaries;
}
/**
* REDUCE PHASE: Combines all chunk summaries into a single commit message.
* Handles recursive reduction if summaries are too long.
*/
async function synthesizeCommitMessage(summaries, context) {
	const engine = getEngine();
	const combinedSummary = summaries.map((s) => {
		return `${s.files.length > 0 ? `**Files:** ${s.files.join(", ")}\n` : ""}${s.summary}`;
	}).join("\n\n---\n\n");
	const synthesisPrompt = getSynthesisPrompt(context);
	const maxSummaryTokens = MAX_TOKENS_INPUT - tokenCount(synthesisPrompt.content) - MAX_TOKENS_OUTPUT - ADJUSTMENT_FACTOR;
	let finalSummary = combinedSummary;
	if (tokenCount(combinedSummary) > maxSummaryTokens) finalSummary = await recursivelyReduceSummaries(summaries, maxSummaryTokens, 0);
	const messages = [synthesisPrompt, {
		role: "user",
		content: `Here is a summary of all changes in this commit:\n\n${finalSummary}`
	}];
	const commitMessage = await engine.generateCommitMessage(messages);
	if (!commitMessage) throw new Error(GenerateCommitMessageErrorEnum.emptyMessage);
	return await ensureValidCommitMessage(commitMessage);
}
/**
* Recursively reduces summaries when they exceed token limits.
* Uses token-aware trimming and has a max depth safeguard.
*/
async function recursivelyReduceSummaries(summaries, maxTokens, depth) {
	if (depth >= MAX_REDUCTION_DEPTH) return sliceToTokenLimit(summaries.map((s) => s.summary).join("\n"), maxTokens);
	const engine = getEngine();
	const batches = [];
	let currentBatch = [];
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
	if (currentBatch.length > 0) batches.push(currentBatch);
	if (batches.length <= 1) return sliceToTokenLimit(summaries.map((s) => s.summary).join("\n"), maxTokens);
	const reducedSummaries = [];
	for (let i = 0; i < batches.length; i++) {
		const batch = batches[i];
		const batchText = batch.map((s) => s.summary).join("\n");
		const allFiles = batch.flatMap((s) => s.files);
		const messages = [SUMMARY_PROMPT, {
			role: "user",
			content: `Consolidate these changes into a shorter summary:\n\n${batchText}`
		}];
		let reduced = null;
		let attempts = 0;
		while (attempts < 3 && !reduced) try {
			reduced = await engine.generateCommitMessage(messages);
		} catch {
			attempts++;
			if (attempts < 3) await exponentialBackoff(attempts);
		}
		reducedSummaries.push({
			summary: reduced || sliceToTokenLimit(batchText, 500),
			files: allFiles
		});
		if (i < batches.length - 1) await exponentialBackoff(0);
	}
	const combinedReduced = reducedSummaries.map((s) => s.summary).join("\n\n");
	if (tokenCount(combinedReduced) > maxTokens) return recursivelyReduceSummaries(reducedSummaries, maxTokens, depth + 1);
	return combinedReduced;
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
const generateCommitMessageByDiff = async (diff, context = "") => {
	const budget = computeTokenBudget({
		promptMessages: await getMainCommitPrompt(context),
		maxInputTokens: MAX_TOKENS_INPUT,
		maxOutputTokens: MAX_TOKENS_OUTPUT,
		adjustmentFactor: ADJUSTMENT_FACTOR
	});
	if (!budget.isValid) throw new TokenBudgetError(budget.errorReason ?? "Token budget exceeded");
	if (tokenCount(diff) <= budget.maxDiffTokens) {
		const messages = await generateCommitMessageChatCompletionPrompt(diff, context);
		const commitMessage = await getEngine().generateCommitMessage(messages);
		if (!commitMessage) throw new Error(GenerateCommitMessageErrorEnum.emptyMessage);
		return await ensureValidCommitMessage(commitMessage);
	}
	return await synthesizeCommitMessage(await getDiffSummaries(splitDiffByFiles(diff, budget.maxDiffTokens)), context);
};

//#endregion
//#region src/utils/git.ts
const assertGitRepo = async () => {
	try {
		await execa("git", ["rev-parse"]);
	} catch (error) {
		throw new Error(error);
	}
};
const getOpenCommitIgnore = async () => {
	const gitDir = await getGitDir();
	const ig = ignore();
	try {
		ig.add(readFileSync(join(gitDir, ".opencommitignore")).toString().split("\n"));
	} catch (e) {}
	return ig;
};
const getStagedFiles = async () => {
	const { stdout: files } = await execa("git", [
		"diff",
		"--name-only",
		"--cached",
		"--relative"
	], { cwd: await getGitDir() });
	if (!files) return [];
	const filesList = files.split("\n");
	const ig = await getOpenCommitIgnore();
	const allowedFiles = filesList.filter((file) => !ig.ignores(file));
	if (!allowedFiles) return [];
	return allowedFiles.sort();
};
const getChangedFiles = async () => {
	const gitDir = await getGitDir();
	const { stdout: modified } = await execa("git", ["ls-files", "--modified"], { cwd: gitDir });
	const { stdout: others } = await execa("git", [
		"ls-files",
		"--others",
		"--exclude-standard"
	], { cwd: gitDir });
	return [...modified.split("\n"), ...others.split("\n")].filter((file) => !!file).sort();
};
const gitAdd = async ({ files }) => {
	const gitDir = await getGitDir();
	const gitAddSpinner = spinner();
	gitAddSpinner.start("Adding files to commit");
	await execa("git", ["add", ...files], { cwd: gitDir });
	gitAddSpinner.stop(`Staged ${files.length} files`);
};
const getDiff = async ({ files }) => {
	const gitDir = await getGitDir();
	const lockFiles = files.filter((file) => file.includes(".lock") || file.includes("-lock.") || file.includes(".svg") || file.includes(".png") || file.includes(".jpg") || file.includes(".jpeg") || file.includes(".webp") || file.includes(".gif"));
	if (lockFiles.length) outro(`Some files are excluded by default from 'git diff'. No commit messages are generated for this files:\n${lockFiles.join("\n")}`);
	const { stdout: diff } = await execa("git", [
		"diff",
		"--staged",
		"--",
		...files.filter((file) => !(file.includes(".lock") || file.includes("-lock.")))
	], { cwd: gitDir });
	return diff;
};
const getGitDir = async () => {
	const { stdout: gitDir } = await execa("git", ["rev-parse", "--show-toplevel"]);
	return gitDir;
};

//#endregion
//#region src/utils/trytm.ts
const trytm = async (promise) => {
	try {
		return [await promise, null];
	} catch (throwable) {
		if (throwable instanceof Error) return [null, throwable];
		throw throwable;
	}
};

//#endregion
//#region src/commands/commit.ts
const config = getConfig();
const getGitRemotes = async () => {
	const { stdout } = await execa("git", ["remote"]);
	return stdout.split("\n").filter((remote) => Boolean(remote.trim()));
};
const checkMessageTemplate = (extraArgs$1) => {
	for (const key in extraArgs$1) if (extraArgs$1[key].includes(config.OCO_MESSAGE_TEMPLATE_PLACEHOLDER)) return extraArgs$1[key];
	return false;
};
const generateCommitMessageFromGitDiff = async ({ diff, extraArgs: extraArgs$1, context = "", skipCommitConfirmation = false }) => {
	await assertGitRepo();
	const commitGenerationSpinner = spinner();
	commitGenerationSpinner.start("Generating the commit message");
	try {
		let commitMessage = await generateCommitMessageByDiff(diff, context);
		const messageTemplate = checkMessageTemplate(extraArgs$1);
		if (config.OCO_MESSAGE_TEMPLATE_PLACEHOLDER && typeof messageTemplate === "string") {
			const messageTemplateIndex = extraArgs$1.indexOf(messageTemplate);
			extraArgs$1.splice(messageTemplateIndex, 1);
			commitMessage = messageTemplate.replace(config.OCO_MESSAGE_TEMPLATE_PLACEHOLDER, commitMessage);
		}
		commitGenerationSpinner.stop("📝 Commit message generated");
		outro(`Generated commit message:
${chalk.grey("——————————————————")}
${commitMessage}
${chalk.grey("——————————————————")}`);
		const userAction = skipCommitConfirmation ? "Yes" : await select({
			message: "Confirm the commit message?",
			options: [
				{
					value: "Yes",
					label: "Yes"
				},
				{
					value: "No",
					label: "No"
				},
				{
					value: "Edit",
					label: "Edit"
				}
			]
		});
		if (isCancel(userAction)) process.exit(1);
		if (userAction === "Edit") {
			const textResponse = await text({
				message: "Please edit the commit message: (press Enter to continue)",
				initialValue: commitMessage
			});
			if (isCancel(textResponse)) {
				outro("Commit cancelled");
				process.exit(1);
			}
			const editedMessage = textResponse?.toString().trim() ?? "";
			if (!editedMessage) {
				outro(chalk.red("Empty commit message. Commit cancelled."));
				process.exit(1);
			}
			commitMessage = editedMessage;
		}
		if (userAction === "Yes" || userAction === "Edit") {
			const committingChangesSpinner = spinner();
			committingChangesSpinner.start("Committing the changes");
			const { stdout } = await execa("git", [
				"commit",
				"-m",
				commitMessage,
				...extraArgs$1
			]);
			committingChangesSpinner.stop(`${chalk.green("✔")} Successfully committed`);
			outro(stdout);
			const remotes = await getGitRemotes();
			if (config.OCO_GITPUSH === false) return;
			if (!remotes.length) {
				const { stdout: stdout$1 } = await execa("git", ["push"]);
				if (stdout$1) outro(stdout$1);
				process.exit(0);
			}
			if (remotes.length === 1) {
				const isPushConfirmedByUser = await confirm({ message: "Do you want to run `git push`?" });
				if (isCancel(isPushConfirmedByUser)) process.exit(1);
				if (isPushConfirmedByUser) {
					const pushSpinner = spinner();
					pushSpinner.start(`Running 'git push ${remotes[0]}'`);
					const { stdout: stdout$1 } = await execa("git", [
						"push",
						"--verbose",
						remotes[0]
					]);
					pushSpinner.stop(`${chalk.green("✔")} Successfully pushed all commits to ${remotes[0]}`);
					if (stdout$1) outro(stdout$1);
				} else {
					outro("`git push` aborted");
					process.exit(0);
				}
			} else {
				const skipOption = `don't push`;
				const selectedRemote = await select({
					message: "Choose a remote to push to",
					options: [...remotes, skipOption].map((remote) => ({
						value: remote,
						label: remote
					}))
				});
				if (isCancel(selectedRemote)) process.exit(1);
				if (selectedRemote !== skipOption) {
					const pushSpinner = spinner();
					pushSpinner.start(`Running 'git push ${selectedRemote}'`);
					const { stdout: stdout$1 } = await execa("git", ["push", selectedRemote]);
					if (stdout$1) outro(stdout$1);
					pushSpinner.stop(`${chalk.green("✔")} successfully pushed all commits to ${selectedRemote}`);
				}
			}
		} else {
			const regenerateMessage = await confirm({ message: "Do you want to regenerate the message?" });
			if (isCancel(regenerateMessage)) process.exit(1);
			if (regenerateMessage) await generateCommitMessageFromGitDiff({
				diff,
				extraArgs: extraArgs$1
			});
		}
	} catch (error) {
		commitGenerationSpinner.stop(`${chalk.red("✖")} Failed to generate the commit message`);
		console.log(error);
		const err = error;
		outro(`${chalk.red("✖")} ${err?.message || err}`);
		process.exit(1);
	}
};
async function commit(extraArgs$1 = [], context = "", isStageAllFlag = false, skipCommitConfirmation = false) {
	if (isStageAllFlag) {
		const changedFiles$1 = await getChangedFiles();
		if (changedFiles$1) await gitAdd({ files: changedFiles$1 });
		else {
			outro("No changes detected, write some code and run `oco` again");
			process.exit(1);
		}
	}
	const [stagedFiles, errorStagedFiles] = await trytm(getStagedFiles());
	const [changedFiles, errorChangedFiles] = await trytm(getChangedFiles());
	if (!(changedFiles?.length || stagedFiles?.length)) {
		outro(chalk.red("No changes detected"));
		process.exit(1);
	}
	intro("open-commit");
	if (errorChangedFiles ?? errorStagedFiles) {
		outro(`${chalk.red("✖")} ${errorChangedFiles ?? errorStagedFiles}`);
		process.exit(1);
	}
	const stagedFilesSpinner = spinner();
	stagedFilesSpinner.start("Counting staged files");
	if (stagedFiles.length === 0) {
		stagedFilesSpinner.stop("No files are staged");
		const isStageAllAndCommitConfirmedByUser = await confirm({ message: "Do you want to stage all files and generate commit message?" });
		if (isCancel(isStageAllAndCommitConfirmedByUser)) process.exit(1);
		if (isStageAllAndCommitConfirmedByUser) {
			await commit(extraArgs$1, context, true);
			process.exit(0);
		}
		if (stagedFiles.length === 0 && changedFiles.length > 0) {
			const files = await multiselect({
				message: chalk.cyan("Select the files you want to add to the commit:"),
				options: changedFiles.map((file) => ({
					value: file,
					label: file
				}))
			});
			if (isCancel(files)) process.exit(0);
			await gitAdd({ files });
		}
		await commit(extraArgs$1, context, false);
		process.exit(0);
	}
	stagedFilesSpinner.stop(`${stagedFiles.length} staged files:\n${stagedFiles.map((file) => `  ${file}`).join("\n")}`);
	const [, generateCommitError] = await trytm(generateCommitMessageFromGitDiff({
		diff: await getDiff({ files: stagedFiles }),
		extraArgs: extraArgs$1,
		context,
		skipCommitConfirmation
	}));
	if (generateCommitError) {
		outro(`${chalk.red("✖")} ${generateCommitError}`);
		process.exit(1);
	}
	process.exit(0);
}

//#endregion
//#region src/version.ts
const getOpenCommitLatestVersion = async () => {
	try {
		const { stdout } = await execa("npm", [
			"view",
			"opencommit",
			"version"
		]);
		return stdout;
	} catch (_) {
		outro("Error while getting the latest version of opencommit");
		return;
	}
};

//#endregion
//#region src/utils/check-is-latest-version.ts
const checkIsLatestVersion = async () => {
	const latestVersion = await getOpenCommitLatestVersion();
	if (latestVersion) {
		const currentVersion = version;
		if (currentVersion !== latestVersion) outro(chalk.yellow(`
You are not using the latest stable version of OpenCommit with new features and bug fixes.
Current version: ${currentVersion}. Latest version: ${latestVersion}.
🚀 To update run: npm i - g opencommit @latest.
        `));
	}
};

//#endregion
//#region src/cli.ts
const extraArgs = process.argv.slice(2);
cli({
	version,
	name: "opencommit",
	commands: [configCommand],
	flags: {
		fgm: {
			type: Boolean,
			description: "Use full GitMoji specification",
			default: false
		},
		context: {
			type: String,
			alias: "c",
			description: "Additional user input context for the commit message",
			default: ""
		},
		yes: {
			type: Boolean,
			alias: "y",
			description: "Skip commit confirmation prompt",
			default: false
		}
	},
	ignoreArgv: (type) => type === "unknown-flag" || type === "argument",
	help: { description }
}, async ({ flags }) => {
	await checkIsLatestVersion();
	commit(extraArgs, flags.context, false, flags.yes);
}, extraArgs);

//#endregion