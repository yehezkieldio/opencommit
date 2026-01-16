import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join as pathJoin, resolve as pathResolve } from "node:path";
import { intro, outro } from "@clack/prompts";
import chalk from "chalk";
import { command } from "cleye";
import { parse as iniParse, stringify as iniStringify } from "ini";
import { COMMANDS } from "./enum.js";

export const CONFIG_KEYS = {
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
    OCO_GITPUSH: "OCO_GITPUSH", // todo: deprecate
} as const;
export type CONFIG_KEYS = (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS];

export const CONFIG_MODES = {
    get: "get",
    set: "set",
    describe: "describe",
} as const;
export type CONFIG_MODES = (typeof CONFIG_MODES)[keyof typeof CONFIG_MODES];

export const MODEL_LIST = {
    azure: ["gpt-4.1-mini"],
};

const getDefaultModel = (_provider: string | undefined): string => {
    return MODEL_LIST.azure[0] || "gpt-4.1-mini";
};

export const DEFAULT_TOKEN_LIMITS = {
    DEFAULT_MAX_TOKENS_INPUT: 4096,
    DEFAULT_MAX_TOKENS_OUTPUT: 500,
} as const;
export type DEFAULT_TOKEN_LIMITS = (typeof DEFAULT_TOKEN_LIMITS)[keyof typeof DEFAULT_TOKEN_LIMITS];

const validateConfig = (key: string, condition: boolean, validationMessage: string) => {
    if (!condition) {
        outro(`${chalk.red("✖")} wrong value for ${key}: ${validationMessage}.`);

        outro("For more help refer to docs https://github.com/di-sukharev/opencommit");

        process.exit(1);
    }
};

export const configValidators = {
    [CONFIG_KEYS.OCO_API_KEY](value: unknown) {
        validateConfig(
            "OCO_API_KEY",
            !!value,
            'You need to provide the OCO_API_KEY when OCO_AI_PROVIDER set to "azure".'
        );
        return value as string;
    },

    [CONFIG_KEYS.OCO_DESCRIPTION](value: unknown) {
        validateConfig(CONFIG_KEYS.OCO_DESCRIPTION, typeof value === "boolean", "Must be boolean: true or false");

        return value as boolean;
    },

    [CONFIG_KEYS.OCO_API_CUSTOM_HEADERS](value: unknown) {
        try {
            // Custom headers must be a valid JSON string
            if (typeof value === "string") {
                JSON.parse(value);
            }
            return value as string;
        } catch (error) {
            validateConfig(CONFIG_KEYS.OCO_API_CUSTOM_HEADERS, false, "Must be a valid JSON string of headers");
        }
    },

    [CONFIG_KEYS.OCO_TOKENS_MAX_INPUT](value: unknown) {
        // biome-ignore lint/style/noParameterAssign: it's fine here
        value = Number.parseInt(String(value), 10);
        validateConfig(CONFIG_KEYS.OCO_TOKENS_MAX_INPUT, !Number.isNaN(value), "Must be a number");

        return value as number;
    },

    [CONFIG_KEYS.OCO_TOKENS_MAX_OUTPUT](value: unknown) {
        // biome-ignore lint/style/noParameterAssign: it's fine here
        value = Number.parseInt(String(value), 10);
        validateConfig(CONFIG_KEYS.OCO_TOKENS_MAX_OUTPUT, !Number.isNaN(value), "Must be a number");

        return value as number;
    },

    [CONFIG_KEYS.OCO_EMOJI](value: unknown) {
        validateConfig(CONFIG_KEYS.OCO_EMOJI, typeof value === "boolean", "Must be boolean: true or false");

        return value as boolean;
    },

    [CONFIG_KEYS.OCO_OMIT_SCOPE](value: unknown) {
        validateConfig(CONFIG_KEYS.OCO_OMIT_SCOPE, typeof value === "boolean", "Must be boolean: true or false");

        return value as boolean;
    },

    [CONFIG_KEYS.OCO_API_URL](value: unknown) {
        validateConfig(
            CONFIG_KEYS.OCO_API_URL,
            typeof value === "string",
            `${value} is not a valid URL. It should start with 'http://' or 'https://'.`
        );
        return value as string;
    },

    [CONFIG_KEYS.OCO_MODEL](value: unknown) {
        validateConfig(CONFIG_KEYS.OCO_MODEL, typeof value === "string", `${value} is not supported.`);
        return value as string;
    },

    [CONFIG_KEYS.OCO_MESSAGE_TEMPLATE_PLACEHOLDER](value: unknown) {
        validateConfig(
            CONFIG_KEYS.OCO_MESSAGE_TEMPLATE_PLACEHOLDER,
            (value as string).startsWith("$"),
            `${value} must start with $, for example: '$msg'`
        );
        return value as string;
    },

    // todo: deprecate
    [CONFIG_KEYS.OCO_GITPUSH](value: unknown) {
        validateConfig(CONFIG_KEYS.OCO_GITPUSH, typeof value === "boolean", "Must be true or false");
        return value;
    },

    [CONFIG_KEYS.OCO_AI_PROVIDER](value: unknown) {
        validateConfig(CONFIG_KEYS.OCO_AI_PROVIDER, value === "azure", `${value} is not supported, use 'azure'`);
        return value as OCO_AI_PROVIDER_ENUM;
    },

    [CONFIG_KEYS.OCO_ONE_LINE_COMMIT](value: unknown) {
        validateConfig(CONFIG_KEYS.OCO_ONE_LINE_COMMIT, typeof value === "boolean", "Must be true or false");

        return value as boolean;
    },

    [CONFIG_KEYS.OCO_WHY](value: unknown) {
        validateConfig(CONFIG_KEYS.OCO_WHY, typeof value === "boolean", "Must be true or false");
        return value as boolean;
    },
};

export const OCO_AI_PROVIDER_ENUM = {
    AZURE: "azure",
} as const;
export type OCO_AI_PROVIDER_ENUM = (typeof OCO_AI_PROVIDER_ENUM)[keyof typeof OCO_AI_PROVIDER_ENUM];

export type ConfigType = {
    [CONFIG_KEYS.OCO_API_KEY]?: string;
    [CONFIG_KEYS.OCO_TOKENS_MAX_INPUT]: number;
    [CONFIG_KEYS.OCO_TOKENS_MAX_OUTPUT]: number;
    [CONFIG_KEYS.OCO_API_URL]?: string;
    [CONFIG_KEYS.OCO_API_CUSTOM_HEADERS]?: string;
    [CONFIG_KEYS.OCO_DESCRIPTION]: boolean;
    [CONFIG_KEYS.OCO_EMOJI]: boolean;
    [CONFIG_KEYS.OCO_WHY]: boolean;
    [CONFIG_KEYS.OCO_MODEL]: string;
    [CONFIG_KEYS.OCO_MESSAGE_TEMPLATE_PLACEHOLDER]: string;
    [CONFIG_KEYS.OCO_AI_PROVIDER]: OCO_AI_PROVIDER_ENUM;
    [CONFIG_KEYS.OCO_GITPUSH]: boolean;
    [CONFIG_KEYS.OCO_ONE_LINE_COMMIT]: boolean;
    [CONFIG_KEYS.OCO_OMIT_SCOPE]: boolean;
};

export const defaultConfigPath = pathJoin(homedir(), ".opencommit");
export const defaultEnvPath = pathResolve(process.cwd(), ".env");

// assertConfigsAreValid removed

export const DEFAULT_CONFIG = {
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
    OCO_GITPUSH: true, // todo: deprecate
};

const initGlobalConfig = (configPath: string = defaultConfigPath) => {
    writeFileSync(configPath, iniStringify(DEFAULT_CONFIG), "utf8");
    return DEFAULT_CONFIG;
};

const parseConfigVarValue = (value?: unknown) => {
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
        OCO_AI_PROVIDER: process.env.OCO_AI_PROVIDER as OCO_AI_PROVIDER_ENUM,

        OCO_TOKENS_MAX_INPUT: parseConfigVarValue(process.env.OCO_TOKENS_MAX_INPUT),
        OCO_TOKENS_MAX_OUTPUT: parseConfigVarValue(process.env.OCO_TOKENS_MAX_OUTPUT),

        OCO_DESCRIPTION: parseConfigVarValue(process.env.OCO_DESCRIPTION),
        OCO_EMOJI: parseConfigVarValue(process.env.OCO_EMOJI),
        OCO_MESSAGE_TEMPLATE_PLACEHOLDER: process.env.OCO_MESSAGE_TEMPLATE_PLACEHOLDER,
        OCO_ONE_LINE_COMMIT: parseConfigVarValue(process.env.OCO_ONE_LINE_COMMIT),
        OCO_OMIT_SCOPE: parseConfigVarValue(process.env.OCO_OMIT_SCOPE),

        OCO_GITPUSH: parseConfigVarValue(process.env.OCO_GITPUSH), // todo: deprecate
    };
};

export const setGlobalConfig = (config: ConfigType, configPath: string = defaultConfigPath) => {
    writeFileSync(configPath, iniStringify(config), "utf8");
};

export const getIsGlobalConfigFileExist = (configPath: string = defaultConfigPath) => {
    return existsSync(configPath);
};

export const getGlobalConfig = (configPath: string = defaultConfigPath) => {
    let globalConfig: ConfigType;

    const isGlobalConfigFileExist = getIsGlobalConfigFileExist(configPath);
    if (isGlobalConfigFileExist) {
        const configFile = readFileSync(configPath, "utf8");
        globalConfig = iniParse(configFile) as ConfigType;
    } else globalConfig = initGlobalConfig(configPath);

    return globalConfig;
};

/**
 * Merges two configs.
 * Env config takes precedence over global ~/.opencommit config file
 * @param main - env config
 * @param fallback - global ~/.opencommit config file
 * @returns merged config
 */
const mergeConfigs = (main: Partial<ConfigType>, fallback: ConfigType) => {
    const allKeys = new Set([...Object.keys(main), ...Object.keys(fallback)]);
    return Array.from(allKeys).reduce((acc, key) => {
        (acc as Record<string, unknown>)[key] = parseConfigVarValue(
            main[key as keyof ConfigType] ?? fallback[key as keyof ConfigType]
        );
        return acc;
    }, {} as ConfigType);
};

interface GetConfigOptions {
    globalPath?: string;
    setDefaultValues?: boolean;
}

const cleanUndefinedValues = (config: ConfigType) => {
    return Object.fromEntries(
        Object.entries(config).map(([_, v]) => {
            try {
                if (typeof v === "string") {
                    if (v === "undefined") return [_, undefined];
                    if (v === "null") return [_, null];

                    const parsedValue = JSON.parse(v);
                    return [_, parsedValue];
                }
                return [_, v];
            } catch (error) {
                return [_, v];
            }
        })
    );
};

export const getConfig = ({ globalPath = defaultConfigPath }: GetConfigOptions = {}): ConfigType => {
    const envConfig = getEnvConfig();
    const globalConfig = getGlobalConfig(globalPath);

    const config = mergeConfigs(envConfig, globalConfig);

    const cleanConfig = cleanUndefinedValues(config);

    return cleanConfig as ConfigType;
};

export const setConfig = (
    keyValues: [key: string, value: string | boolean | number | null][],
    globalConfigPath: string = defaultConfigPath
) => {
    const config = getConfig({
        globalPath: globalConfigPath,
    });

    const configToSet: Partial<ConfigType> = {};

    for (const [key, value] of keyValues) {
        if (!Object.hasOwn(configValidators, key)) {
            const supportedKeys = Object.keys(configValidators).join("\n");
            throw new Error(
                `Unsupported config key: ${key}. Expected keys are:\n\n${supportedKeys}.\n\nFor more help refer to our docs: https://github.com/di-sukharev/opencommit`
            );
        }

        let parsedConfigValue: unknown;

        try {
            if (typeof value === "string") parsedConfigValue = JSON.parse(value);
            else parsedConfigValue = value;
        } catch (error) {
            parsedConfigValue = value;
        }

        const validValue = configValidators[key as CONFIG_KEYS](parsedConfigValue);

        // biome-ignore lint/suspicious/noExplicitAny: needed for dynamic assignment to partial config
        configToSet[key as keyof ConfigType] = validValue as any;
    }

    setGlobalConfig(mergeConfigs(configToSet, config), globalConfigPath);

    outro(`${chalk.green("✔")} config successfully set`);
};

// --- HELP MESSAGE GENERATION ---
function getConfigKeyDetails(key: string) {
    switch (key) {
        case CONFIG_KEYS.OCO_MODEL:
            return {
                description: "The AI model to use for generating commit messages",
                values: MODEL_LIST,
            };
        case CONFIG_KEYS.OCO_AI_PROVIDER:
            return {
                description: "The AI provider to use",
                values: Object.values(OCO_AI_PROVIDER_ENUM),
            };

        case CONFIG_KEYS.OCO_DESCRIPTION:
            return {
                description: "Postface a message with ~3 sentences description of the changes",
                values: ["true", "false"],
            };
        case CONFIG_KEYS.OCO_EMOJI:
            return {
                description: "Preface a message with GitMoji",
                values: ["true", "false"],
            };
        case CONFIG_KEYS.OCO_WHY:
            return {
                description:
                    "Output a short description of why the changes were done after the commit message (default: false)",
                values: ["true", "false"],
            };
        case CONFIG_KEYS.OCO_OMIT_SCOPE:
            return {
                description: "Do not include a scope in the commit message",
                values: ["true", "false"],
            };
        case CONFIG_KEYS.OCO_GITPUSH:
            return {
                description: "Push to git after commit (deprecated). If false, oco will exit after committing",
                values: ["true", "false"],
            };
        case CONFIG_KEYS.OCO_TOKENS_MAX_INPUT:
            return {
                description: "Max model token limit",
                values: ["Any positive integer"],
            };
        case CONFIG_KEYS.OCO_TOKENS_MAX_OUTPUT:
            return {
                description: "Max response tokens",
                values: ["Any positive integer"],
            };
        case CONFIG_KEYS.OCO_API_KEY:
            return {
                description: "API key for the selected provider",
                values: ["String (required for most providers)"],
            };
        case CONFIG_KEYS.OCO_API_URL:
            return {
                description: "Custom API URL - may be used to set proxy path to OpenAI API",
                values: ["URL string (must start with 'http://' or 'https://')"],
            };
        case CONFIG_KEYS.OCO_MESSAGE_TEMPLATE_PLACEHOLDER:
            return {
                description: "Message template placeholder",
                values: ["String (must start with $)"],
            };

        case CONFIG_KEYS.OCO_ONE_LINE_COMMIT:
            return {
                description: "One line commit message",
                values: ["true", "false"],
            };

        default:
            return {
                description: "String value",
                values: ["Any string"],
            };
    }
}

function printConfigKeyHelp(param: string) {
    if (!Object.values(CONFIG_KEYS).includes(param as CONFIG_KEYS)) {
        console.log(chalk.red(`Unknown config parameter: ${param}`));
        return;
    }

    const details = getConfigKeyDetails(param as CONFIG_KEYS);

    const desc = details.description;
    let defaultValue: unknown;
    if (param in DEFAULT_CONFIG) {
        defaultValue = DEFAULT_CONFIG[param as keyof typeof DEFAULT_CONFIG];
    }

    console.log(chalk.bold(`\n${param}:`));
    console.log(chalk.gray(`  Description: ${desc}`));
    if (defaultValue !== undefined) {
        // Print booleans and numbers as-is, strings without quotes
        if (typeof defaultValue === "string") {
            console.log(chalk.gray(`  Default: ${defaultValue}`));
        } else {
            console.log(chalk.gray(`  Default: ${defaultValue}`));
        }
    }

    if (Array.isArray(details.values)) {
        console.log(chalk.gray("  Accepted values:"));
        for (const value of details.values) {
            console.log(chalk.gray(`    - ${value}`));
        }
    } else {
        console.log(chalk.gray("  Accepted values by provider:"));
        for (const [provider, values] of Object.entries(details.values)) {
            console.log(chalk.gray(`    ${provider}:`));
            for (const value of values as string[]) {
                console.log(chalk.gray(`      - ${value}`));
            }
        }
    }
}

function printAllConfigHelp() {
    console.log(chalk.bold("Available config parameters:"));
    for (const key of Object.values(CONFIG_KEYS).sort()) {
        const details = getConfigKeyDetails(key);
        // Try to get the default value from DEFAULT_CONFIG
        let defaultValue: unknown;
        if (key in DEFAULT_CONFIG) {
            defaultValue = DEFAULT_CONFIG[key as keyof typeof DEFAULT_CONFIG];
        }

        console.log(chalk.bold(`\n${key}:`));
        console.log(chalk.gray(`  Description: ${details.description}`));
        if (defaultValue !== undefined) {
            if (typeof defaultValue === "string") {
                console.log(chalk.gray(`  Default: ${defaultValue}`));
            } else {
                console.log(chalk.gray(`  Default: ${defaultValue}`));
            }
        }
    }
    console.log(
        chalk.yellow(
            '\nUse "oco config describe [PARAMETER]" to see accepted values and more details for a specific config parameter.'
        )
    );
}

export const configCommand = command(
    {
        name: COMMANDS.config,
        parameters: ["<mode>", "[key=values...]"],
        help: {
            description: "Configure opencommit settings",
            examples: [
                "Describe all config parameters: oco config describe",
                "Describe a specific parameter: oco config describe OCO_MODEL",
                "Get a config value: oco config get OCO_MODEL",
                "Set a config value: oco config set OCO_MODEL=gpt-4",
            ],
        },
    },
    async (argv) => {
        try {
            const { mode, keyValues } = argv._;
            intro(`COMMAND: config ${mode} ${keyValues}`);

            if (mode === CONFIG_MODES.describe) {
                if (!keyValues || keyValues.length === 0) {
                    printAllConfigHelp();
                } else {
                    for (const key of keyValues) {
                        printConfigKeyHelp(key);
                    }
                }
                process.exit(0);
            } else if (mode === CONFIG_MODES.get) {
                if (!keyValues || keyValues.length === 0) {
                    throw new Error("No config keys specified for get mode");
                }
                const config = getConfig() || {};
                for (const key of keyValues) {
                    outro(`${key}=${config[key as keyof typeof config]}`);
                }
            } else if (mode === CONFIG_MODES.set) {
                if (!keyValues || keyValues.length === 0) {
                    throw new Error("No config keys specified for set mode");
                }
                await setConfig(keyValues.map((keyValue) => keyValue.split("=") as [string, string]));
            } else {
                throw new Error(`Unsupported mode: ${mode}. Valid modes are: "set", "get", and "describe"`);
            }
        } catch (error) {
            outro(`${chalk.red("✖")} ${error}`);
            process.exit(1);
        }
    }
);
