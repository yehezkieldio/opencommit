import { getConfig, OCO_AI_PROVIDER_ENUM } from "#/commands/config";
import { AzureEngine } from "#/engine/azure";
import type { AiEngine } from "#/engine/engine";

export function parseCustomHeaders(headers: unknown): Record<string, string> {
    let parsedHeaders = {};

    if (!headers) {
        return parsedHeaders;
    }

    try {
        if (typeof headers === "object" && !Array.isArray(headers)) {
            parsedHeaders = headers;
        } else {
            parsedHeaders = JSON.parse(headers as string);
        }
    } catch (error) {
        console.warn("Invalid OCO_API_CUSTOM_HEADERS format, ignoring custom headers");
    }

    return parsedHeaders;
}

export function getEngine(): AiEngine {
    const config = getConfig();
    const provider = config.OCO_AI_PROVIDER;

    const customHeaders = parseCustomHeaders(config.OCO_API_CUSTOM_HEADERS);

    const DEFAULT_CONFIG = {
        model: config.OCO_MODEL,
        maxTokensOutput: config.OCO_TOKENS_MAX_OUTPUT,
        maxTokensInput: config.OCO_TOKENS_MAX_INPUT,
        baseURL: config.OCO_API_URL ?? "",
        apiKey: config.OCO_API_KEY ?? "",
        customHeaders,
    };

    if (provider === OCO_AI_PROVIDER_ENUM.AZURE) {
        return new AzureEngine(DEFAULT_CONFIG);
    }

    throw new Error(`Unsupported provider: ${provider}. Only 'azure' is supported.`);
}
