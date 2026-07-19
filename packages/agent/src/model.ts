import OpenAI from "openai";
import { MODEL } from "@marlow/shared";
import { z, type ZodType } from "zod";

export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModelUsage = { inputTokens: number; outputTokens: number };

export type StructuredModelResult<T> = { value: T; usage: ModelUsage };

export interface ModelProvider {
  readonly provider: "meta" | "mock";
  readonly modelId: "muse-spark-1.1" | "mock-muse-spark-1.1";
  generateStructured<T>(input: {
    messages: ModelMessage[];
    schema: ZodType<T>;
    schemaName: string;
    temperature?: number;
  }): Promise<StructuredModelResult<T>>;
}

export class ModelUnavailableError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

function jsonFromText(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  return JSON.parse((fenced ?? text).trim()) as unknown;
}

function isTransient(error: unknown): boolean {
  if (error instanceof OpenAI.APIError)
    return (
      error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500
    );
  return error instanceof TypeError;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MuseSparkProvider implements ModelProvider {
  readonly provider = "meta" as const;
  readonly modelId = MODEL.id;
  private readonly client: OpenAI;

  constructor(options: { apiKey: string; baseUrl?: string; maxRetries?: number }) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl ?? MODEL.baseUrl,
      maxRetries: 0,
      timeout: 60_000,
    });
    this.maxRetries = options.maxRetries ?? 2;
  }

  private readonly maxRetries: number;

  async generateStructured<T>(input: {
    messages: ModelMessage[];
    schema: ZodType<T>;
    schemaName: string;
    temperature?: number;
  }): Promise<StructuredModelResult<T>> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.modelId,
          messages: input.messages,
          temperature: input.temperature ?? 0.2,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: input.schemaName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64),
              strict: true,
              schema: z.toJSONSchema(input.schema),
            },
          },
        });
        const content = response.choices[0]?.message.content;
        if (!content)
          throw new ModelUnavailableError(
            "Muse Spark returned an empty structured response.",
            true,
          );
        return {
          value: input.schema.parse(jsonFromText(content)),
          usage: {
            inputTokens: response.usage?.prompt_tokens ?? 0,
            outputTokens: response.usage?.completion_tokens ?? 0,
          },
        };
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof ModelUnavailableError ? error.retryable : isTransient(error);
        if (!retryable || attempt === this.maxRetries) break;
        await delay(Math.min(2_000, 250 * 2 ** attempt + Math.floor(Math.random() * 100)));
      }
    }
    throw new ModelUnavailableError(
      lastError instanceof Error
        ? `Muse Spark is unavailable: ${lastError.message}`
        : "Muse Spark is unavailable.",
      isTransient(lastError),
    );
  }
}

export class MockModelProvider implements ModelProvider {
  readonly provider = "mock" as const;
  readonly modelId = "mock-muse-spark-1.1" as const;
  readonly calls: string[] = [];

  constructor(private readonly fixtures: Record<string, unknown>) {}

  async generateStructured<T>(input: {
    messages: ModelMessage[];
    schema: ZodType<T>;
    schemaName: string;
  }): Promise<StructuredModelResult<T>> {
    this.calls.push(input.schemaName);
    if (!(input.schemaName in this.fixtures))
      throw new Error(`No mock model fixture for ${input.schemaName}.`);
    return {
      value: input.schema.parse(this.fixtures[input.schemaName]),
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
