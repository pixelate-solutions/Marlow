import { campaignProfileSchema } from "@marlow/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseStructuredModelOutput, toStrictModelJsonSchema } from "./model";

type JsonSchema = Record<string, unknown>;

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectStrictObjects(schema: unknown): void {
  if (!isRecord(schema)) return;
  if (isRecord(schema.properties)) {
    expect(schema.required).toEqual(Object.keys(schema.properties));
    expect(schema.additionalProperties).toBe(false);
    for (const property of Object.values(schema.properties)) expectStrictObjects(property);
  }
  if (isRecord(schema.items)) expectStrictObjects(schema.items);
  for (const keyword of ["$defs", "definitions"] as const) {
    const definitions = schema[keyword];
    if (isRecord(definitions))
      for (const definition of Object.values(definitions)) expectStrictObjects(definition);
  }
  for (const keyword of ["anyOf", "oneOf", "allOf", "prefixItems"] as const) {
    const variants = schema[keyword];
    if (Array.isArray(variants)) for (const variant of variants) expectStrictObjects(variant);
  }
}

describe("strict structured model output", () => {
  const schema = z.object({
    requiredText: z.string(),
    optionalText: z.string().optional(),
    nullableText: z.string().nullable(),
    optionalNullableText: z.string().nullable().optional(),
    defaultedTags: z.array(z.string()).default([]),
    nested: z.object({ minimum: z.number().optional() }),
    rows: z.array(z.object({ note: z.string().optional() })),
  });

  it("requires every object property and makes non-nullable optional fields nullable", () => {
    const jsonSchema = toStrictModelJsonSchema(schema);
    expectStrictObjects(jsonSchema);

    const properties = jsonSchema.properties as JsonSchema;
    expect(properties.optionalText).toMatchObject({
      anyOf: [{ type: "string" }, { type: "null" }],
    });
    expect(properties.defaultedTags).not.toHaveProperty("anyOf");
    expect(properties.optionalNullableText).not.toEqual({ type: "string" });
  });

  it("removes provider nulls for optional fields before Zod parsing", () => {
    const result = parseStructuredModelOutput(
      JSON.stringify({
        requiredText: "ready",
        optionalText: null,
        nullableText: null,
        optionalNullableText: null,
        defaultedTags: [],
        nested: { minimum: null },
        rows: [{ note: null }],
      }),
      schema,
    );

    expect(result).toEqual({
      requiredText: "ready",
      nullableText: null,
      optionalNullableText: null,
      defaultedTags: [],
      nested: {},
      rows: [{}],
    });
  });

  it("normalizes the complete discovery profile schema", () => {
    const discoverySchema = z.object({ profile: campaignProfileSchema.optional() });
    const jsonSchema = toStrictModelJsonSchema(discoverySchema);
    expectStrictObjects(jsonSchema);
    expect(parseStructuredModelOutput('{"profile":null}', discoverySchema)).toEqual({});
  });
});
