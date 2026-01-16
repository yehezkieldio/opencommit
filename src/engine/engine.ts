import type AnthropicClient from "@anthropic-ai/sdk";
import type { GoogleGenerativeAI as GeminiClient } from "@google/generative-ai";
import type { Mistral as MistralClient } from "@mistralai/mistralai";
import type { AxiosInstance as RawAxiosClient } from "axios";
import type { AzureOpenAI as AzureOpenAIClient, OpenAI as OpenAIClient } from "openai";

export interface AiEngineConfig {
    apiKey: string;
    model: string;
    maxTokensOutput: number;
    maxTokensInput: number;
    baseURL?: string;
    customHeaders?: Record<string, string>;
}

type Client = OpenAIClient | AzureOpenAIClient | AnthropicClient | RawAxiosClient | GeminiClient | MistralClient;

export interface AiEngine {
    config: AiEngineConfig;
    client: Client;
    generateCommitMessage(
        messages: OpenAIClient.Chat.Completions.ChatCompletionMessageParam[]
    ): Promise<string | null | undefined>;
}
