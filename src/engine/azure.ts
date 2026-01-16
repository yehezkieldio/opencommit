import { outro } from "@clack/prompts";
import axios from "axios";
import chalk from "chalk";
import { AzureOpenAI, type OpenAI } from "openai";
import type { AiEngine, AiEngineConfig } from "#/engine/engine";
import { GenerateCommitMessageErrorEnum } from "#/generate-commit-message-from-git-diff";
import { removeContentTags } from "#/utils/remove-content-tags";
import { tokenCount } from "#/utils/token-count";

interface AzureAiEngineConfig extends AiEngineConfig {
    baseURL: string;
    apiKey: string;
}

export class AzureEngine implements AiEngine {
    config: AzureAiEngineConfig;
    client: AzureOpenAI;

    constructor(config: AzureAiEngineConfig) {
        this.config = config;
        this.client = new AzureOpenAI({
            endpoint: this.config.baseURL,
            apiKey: this.config.apiKey,
            apiVersion: "2024-08-01-preview",
        });
    }

    generateCommitMessage = async (
        messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ): Promise<string | undefined> => {
        try {
            const REQUEST_TOKENS = messages
                .map((msg) => tokenCount(msg.content as string) + 4)
                .reduce((a, b) => a + b, 0);

            if (REQUEST_TOKENS > this.config.maxTokensInput - this.config.maxTokensOutput) {
                throw new Error(GenerateCommitMessageErrorEnum.tooMuchTokens);
            }

            const data = await this.client.chat.completions.create({
                model: this.config.model,
                messages,
            });

            const message = data.choices[0]?.message;

            if (message?.content === null) {
                return undefined;
            }

            const content = message?.content;
            return removeContentTags(content, "think");
        } catch (error) {
            outro(`${chalk.red("✖")} ${this.config.model}`);

            const err = error as Error;
            outro(`${chalk.red("✖")} ${JSON.stringify(error)}`);

            if (axios.isAxiosError<{ error?: { message: string } }>(error) && error.response?.status === 401) {
                const openAiError = error.response.data.error;

                if (openAiError?.message) outro(openAiError.message);
                outro("For help look into README https://github.com/di-sukharev/opencommit#setup");
            }

            throw err;
        }
    };
}
