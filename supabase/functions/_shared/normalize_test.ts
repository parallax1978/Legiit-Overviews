import { assertEquals } from "@std/assert";
import { keywordProblem, matchLevel, mentionsBrand, normalizeKeyword, normalizeUrl, regDomain } from "./normalize.ts";

Deno.test("normalizeKeyword", () => {
  assertEquals(normalizeKeyword("  Best   CRM?  "), "best crm");
  assertEquals(normalizeKeyword("ＢＥＳＴ form builder!!"), "best form builder");
});

Deno.test("keywordProblem rejects operators", () => {
  assertEquals(keywordProblem("best crm"), null);
  assertEquals(keywordProblem("site:example.com crm") !== null, true);
  assertEquals(keywordProblem('"best crm"') !== null, true);
  assertEquals(keywordProblem("crm -free") !== null, true);
  assertEquals(keywordProblem("x".repeat(201)) !== null, true);
});

Deno.test("normalizeUrl", () => {
  assertEquals(normalizeUrl("https://www.Example.com/best-crm/?utm_source=x#top"), "example.com/best-crm");
  assertEquals(normalizeUrl("http://example.com/best-crm/index.html"), "example.com/best-crm");
  assertEquals(normalizeUrl("https://example.com/a?b=2&a=1&gclid=z"), "example.com/a?a=1&b=2");
  assertEquals(normalizeUrl("https://example.com/"), "example.com");
  assertEquals(normalizeUrl("https://www.autoevolution.com/cars/x.html#:~:text=The%20load"), "autoevolution.com/cars/x.html");
});

Deno.test("regDomain uses the public suffix list", () => {
  assertEquals(regDomain("blog.example.co.uk"), "example.co.uk");
  assertEquals(regDomain("customer.github.io"), "customer.github.io");
  assertEquals(regDomain("www.youtube.com"), "youtube.com");
});

Deno.test("matchLevel", () => {
  assertEquals(matchLevel("example.com/best-crm", "example.com/best-crm"), "exact_url");
  assertEquals(matchLevel("example.com/best-crm/pricing", "example.com/best-crm"), "path_prefix");
  assertEquals(matchLevel("example.com/other", "example.com/best-crm"), "same_host");
  assertEquals(matchLevel("blog.example.com/x", "example.com/best-crm"), "same_domain");
  assertEquals(matchLevel("other.com/best-crm", "example.com/best-crm"), null);
  assertEquals(matchLevel("medium.com/@someone/post", "medium.com/@me/post"), null);
  assertEquals(matchLevel("medium.com/@me/post", "medium.com/@me/post"), "exact_url");
  assertEquals(matchLevel("customer.github.io/a", "other.github.io/a"), null);
});

Deno.test("mentionsBrand is whole-word", () => {
  assertEquals(mentionsBrand("Tally Forms is great", ["Tally"]), true);
  assertEquals(mentionsBrand("Totally free", ["Tally"]), false);
});
