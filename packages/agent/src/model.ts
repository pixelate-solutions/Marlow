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

type JsonSchema = Record<string, unknown>;

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveLocalReference(root: JsonSchema, reference: string): unknown {
  if (!reference.startsWith("#/")) return undefined;
  let current: unknown = root;
  for (const part of reference.slice(2).split("/")) {
    if (!isRecord(current)) return undefined;
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    current = current[key];
  }
  return current;
}

function schemaAllowsNull(
  schema: unknown,
  root: JsonSchema,
  visitedReferences = new Set<string>(),
): boolean {
  if (schema === true) return true;
  if (!isRecord(schema)) return false;
  if (schema.type === "null" || schema.const === null) return true;
  if (Array.isArray(schema.type) && schema.type.includes("null")) return true;
  if (Array.isArray(schema.enum) && schema.enum.includes(null)) return true;

  if (typeof schema.$ref === "string" && !visitedReferences.has(schema.$ref)) {
    const nextVisited = new Set(visitedReferences).add(schema.$ref);
    if (schemaAllowsNull(resolveLocalReference(root, schema.$ref), root, nextVisited)) return true;
  }

  for (const keyword of ["anyOf", "oneOf"] as const) {
    const variants = schema[keyword];
    if (
      Array.isArray(variants) &&
      variants.some((variant) => schemaAllowsNull(variant, root, visitedReferences))
    )
      return true;
  }

  const intersections = schema.allOf;
  return (
    Array.isArray(intersections) &&
    intersections.length > 0 &&
    intersections.every((variant) => schemaAllowsNull(variant, root, visitedReferences))
  );
}

function strictifyJsonSchema(schema: unknown, root: JsonSchema): unknown {
  if (!isRecord(schema)) return schema;
  const strictSchema: JsonSchema = { ...schema };

  for (const keyword of ["$defs", "definitions"] as const) {
    const definitions = schema[keyword];
    if (isRecord(definitions)) {
      strictSchema[keyword] = Object.fromEntries(
        Object.entries(definitions).map(([key, value]) => [key, strictifyJsonSchema(value, root)]),
      );
    }
  }

  const properties = schema.properties;
  if (isRecord(properties)) {
    const originallyRequired = new Set(
      Array.isArray(schema.required)
        ? schema.required.filter((key): key is string => typeof key === "string")
        : [],
    );
    strictSchema.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => {
        const strictValue = strictifyJsonSchema(value, root);
        return [
          key,
          originallyRequired.has(key) || schemaAllowsNull(value, root)
            ? strictValue
            : { anyOf: [strictValue, { type: "null" }] },
        ];
      }),
    );
    strictSchema.required = Object.keys(properties);
    strictSchema.additionalProperties = false;
  } else if (schema.type === "object" && !("additionalProperties" in schema)) {
    strictSchema.additionalProperties = false;
  }

  if (isRecord(schema.items) || typeof schema.items === "boolean")
    strictSchema.items = strictifyJsonSchema(schema.items, root);
  if (Array.isArray(schema.prefixItems))
    strictSchema.prefixItems = schema.prefixItems.map((item) => strictifyJsonSchema(item, root));

  for (const keyword of ["anyOf", "oneOf", "allOf"] as const) {
    const variants = schema[keyword];
    if (Array.isArray(variants))
      strictSchema[keyword] = variants.map((variant) => strictifyJsonSchema(variant, root));
  }

  return strictSchema;
}

export function toStrictModelJsonSchema(schema: ZodType): JsonSchema {
  const jsonSchema = z.toJSONSchema(schema, { io: "output" }) as JsonSchema;
  return strictifyJsonSchema(jsonSchema, jsonSchema) as JsonSchema;
}

function valueMatchesSchema(value: unknown, schema: unknown, root: JsonSchema): boolean {
  if (schema === true) return true;
  if (!isRecord(schema)) return false;
  if (typeof schema.$ref === "string")
    return valueMatchesSchema(value, resolveLocalReference(root, schema.$ref), root);
  if ("const" in schema && !Object.is(value, schema.const)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value)))
    return false;

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const matchesType = types.some((type) => {
    if (type === undefined) return true;
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "object") return isRecord(value);
    if (type === "integer") return typeof value === "number" && Number.isInteger(value);
    return typeof value === type;
  });
  if (!matchesType) return false;

  const anyOf = schema.anyOf;
  if (Array.isArray(anyOf) && !anyOf.some((variant) => valueMatchesSchema(value, variant, root)))
    return false;
  const oneOf = schema.oneOf;
  if (Array.isArray(oneOf) && !oneOf.some((variant) => valueMatchesSchema(value, variant, root)))
    return false;
  return true;
}

function normalizeOptionalNulls(value: unknown, schema: unknown, root: JsonSchema): unknown {
  if (!isRecord(schema)) return value;

  let normalized = value;
  if (typeof schema.$ref === "string") {
    const referenced = resolveLocalReference(root, schema.$ref);
    if (referenced !== undefined) normalized = normalizeOptionalNulls(normalized, referenced, root);
  }

  if (Array.isArray(normalized) && schema.items !== undefined) {
    normalized = normalized.map((item) => normalizeOptionalNulls(item, schema.items, root));
  } else if (isRecord(normalized) && isRecord(schema.properties)) {
    const originallyRequired = new Set(
      Array.isArray(schema.required)
        ? schema.required.filter((key): key is string => typeof key === "string")
        : [],
    );
    const result: JsonSchema = { ...normalized };
    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      if (!(key in result)) continue;
      if (
        result[key] === null &&
        !originallyRequired.has(key) &&
        !schemaAllowsNull(propertySchema, root)
      ) {
        delete result[key];
      } else {
        result[key] = normalizeOptionalNulls(result[key], propertySchema, root);
      }
    }
    normalized = result;
  }

  const allOf = schema.allOf;
  if (Array.isArray(allOf)) {
    for (const variant of allOf) normalized = normalizeOptionalNulls(normalized, variant, root);
  }
  for (const keyword of ["anyOf", "oneOf"] as const) {
    const variants = schema[keyword];
    if (!Array.isArray(variants)) continue;
    const matchingVariant = variants.find((variant) =>
      valueMatchesSchema(normalized, variant, root),
    );
    if (matchingVariant !== undefined)
      normalized = normalizeOptionalNulls(normalized, matchingVariant, root);
  }

  return normalized;
}

export function parseStructuredModelOutput<T>(text: string, schema: ZodType<T>): T {
  const jsonSchema = z.toJSONSchema(schema, { io: "output" }) as JsonSchema;
  return schema.parse(normalizeOptionalNulls(jsonFromText(text), jsonSchema, jsonSchema));
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
              schema: toStrictModelJsonSchema(input.schema),
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
          value: parseStructuredModelOutput(content, input.schema),
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
      lastError instanceof ModelUnavailableError ? lastError.retryable : isTransient(lastError),
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
