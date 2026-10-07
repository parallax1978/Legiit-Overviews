import { assertEquals } from "@std/assert";
import { keywordProblem, matchLevel, mentionsBrand, normalizeKeyword, normalizeUrl, regDomain } from "./normalize.ts";

Deno.test("normalizeKeyword", () => {
  assertEquals(normalizeKeyword("  Best   CRM?  "), "best crm");
  assertEquals(normalizeKeyword("ＢＥＳＴ form builder!!"), "best form builder");
  assertEquals(normalizeKeyword("best crm?! ."), "best crm");
  assertEquals(normalizeKeyword("best crm。"), "best crm");
  // Symbols that change the query are kept.
  assertEquals(normalizeKeyword("Learn C#"), "learn c#");
  assertEquals(normalizeKeyword("what is f#?"), "what is f#");
  assertEquals(normalizeKeyword("increase by 10%"), "increase by 10%");
  assertEquals(normalizeKeyword("vitamin b12 (cobalamin)"), "vitamin b12 (cobalamin)");
  assertEquals(normalizeKeyword("array[0] in c++"), "array[0] in c++");
});

Deno.test("keywordProblem rejects operators", () => {
  assertEquals(keywordProblem("best crm"), null);
  assertEquals(keywordProblem("site:example.com crm") !== null, true);
  assertEquals(keywordProblem('"best crm"') !== null, true);
  assertEquals(keywordProblem("crm -free") !== null, true);
  assertEquals(keywordProblem("x".repeat(201)) !== null, true);
  // Full-width forms become ASCII operators when the keyword is normalised, so they are rejected too.
  assertEquals(keywordProblem("best crm site：hubspot.com") !== null, true);
  assertEquals(keywordProblem("＂best form builder＂") !== null, true);
  assertEquals(keywordProblem("best crm －hubspot") !== null, true);
  assertEquals(keywordProblem("learn c#"), null);
});

Deno.test("normalizeUrl", () => {
  assertEquals(normalizeUrl("https://www.Example.com/best-crm/?utm_source=x#top"), "example.com/best-crm");
  assertEquals(normalizeUrl("http://example.com/best-crm/index.html"), "example.com/best-crm");
  assertEquals(normalizeUrl("https://example.com/a?b=2&a=1&gclid=z"), "example.com/a?a=1&b=2");
  assertEquals(normalizeUrl("https://example.com/"), "example.com");
  assertEquals(normalizeUrl("https://www.autoevolution.com/cars/x.html#:~:text=The%20load"), "autoevolution.com/cars/x.html");
});

Deno.test("normalizeUrl: one YouTube video is one key whatever the start time or share link", () => {
  const key = "youtube.com/watch?v=dQw4w9WgXcQ";
  assertEquals(normalizeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), key);
  assertEquals(normalizeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=125s"), key);
  assertEquals(normalizeUrl("https://youtube.com/watch?t=42&v=dQw4w9WgXcQ&feature=youtu.be&si=AbC123"), key);
  assertEquals(normalizeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ&start=30"), "m.youtube.com/watch?v=dQw4w9WgXcQ");
  assertEquals(normalizeUrl("https://youtu.be/dQw4w9WgXcQ?si=AbC123&t=10"), "youtu.be/dQw4w9WgXcQ");
  assertEquals(normalizeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1"), "youtube.com/watch?list=PL1&v=dQw4w9WgXcQ", "other parameters stay");
  // Elsewhere t, start, si and feature can change the page, so they are kept.
  assertEquals(normalizeUrl("https://example.com/search?t=crm&start=10"), "example.com/search?start=10&t=crm");
  assertEquals(normalizeUrl("https://notyoutube.com/watch?v=1&t=5"), "notyoutube.com/watch?t=5&v=1");
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
