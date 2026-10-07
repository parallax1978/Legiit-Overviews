import { assert, assertEquals } from "@std/assert";
import { z } from "zod";
import { outputSchema, structuredParams } from "./claude.ts";
import { BriefOutput, CELL_STATES, EVIDENCE_KINDS, ExtractOutput, HOW_TO_PRODUCE, PageTagOutput } from "./schemas.ts";
import { CLAIM_TYPES, FORMAT_LABELS } from "./types.ts";

type S = Record<string, any>;

function at(schema: S, path: string): S {
  return path.split(".").reduce((node, key) => node[key], schema);
}

Deno.test("outputSchema keeps every enum the API should enforce, and the description stays clean", () => {
  const extract = outputSchema(ExtractOutput);
  assertEquals(at(extract, "properties.claims.items.properties.type").enum, [...CLAIM_TYPES]);
  assertEquals(at(extract, "properties.entities.items.properties.role").enum, ["recommended", "mentioned"]);
  assertEquals(at(extract, "properties.format_labels.items").enum, [...FORMAT_LABELS]);
  assertEquals(at(extract, "properties.claims.items.properties.type").description, undefined);
  assertEquals(at(extract, "properties.claims.items").additionalProperties, false);

  const tag = outputSchema(PageTagOutput);
  assertEquals(at(tag, "properties.evidence.items.properties.kind").enum, [...EVIDENCE_KINDS]);

  const brief = outputSchema(BriefOutput);
  assertEquals(at(brief, "properties.matrix.properties.topics.items.properties.cells.items.properties.state").enum, [...CELL_STATES]);
  assertEquals(at(brief, "properties.brief.properties.new_to_cite.items.properties.how_to_produce").enum, [...HOW_TO_PRODUCE]);
  assertEquals(at(brief, "properties.brief.properties.entities.items.properties.role").enum, ["recommended", "mentioned"]);
  assert(!JSON.stringify(brief).includes("enum:"), "no enum is left as description text");
});

Deno.test("outputSchema keeps a described enum's own description and drops the SDK's enum note", () => {
  const schema = z.object({ kind: z.enum(["a", "b"]).describe("The kind."), n: z.number().int() });
  const out = outputSchema(schema);
  assertEquals(at(out, "properties.kind"), { type: "string", description: "The kind.", enum: ["a", "b"] });
  assertEquals(at(out, "properties.n").type, "integer");
});

Deno.test("structuredParams sends the schema with enums under output_config.format", () => {
  const params = structuredParams({ task: "extract", system: "s", user: "u", schema: ExtractOutput, maxTokens: 10 });
  const format = (params.output_config as S).format;
  assertEquals(format.type, "json_schema");
  assertEquals(at(format.schema, "properties.claims.items.properties.type").enum, [...CLAIM_TYPES]);
});
