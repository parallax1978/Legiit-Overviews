# Own-page matcher

A standalone module in `packages/core/src/match/` with no I/O except an injected resolver. It answers: does this cited reference (or this brand term in the answer text) belong to the customer, and at what level of confidence? The same module tracks competitor domains.

## Normalisation (`url-normalize.ts`)

Applied to both the cited URL and the customer's URL:

1. Lowercase the host; convert punycode to Unicode for comparison.
2. Drop the scheme, default ports (80, 443), the fragment, and a trailing slash.
3. Drop `index.html`, `index.htm`, `default.aspx` at the end of the path.
4. Drop tracking parameters: `utm_*`, `gclid`, `fbclid`, `msclkid`, `ref`, `ref_src`, `mc_cid`, `mc_eid`; sort the remaining query parameters.
5. Percent-decode unreserved characters; collapse repeated slashes.
6. Treat `www.` and the apex host as equal at the `subdomain` level, not at `exact_url`.

## Unwrapping (`unwrap.ts`)

- `google.com/url?q=<target>` and `google.com/url?url=<target>` resolve to the target.
- AMP cache hosts (`*.cdn.ampproject.org`, `amp.` subdomains, `/amp/` path suffixes) resolve to the canonical page.
- `youtube.com/redirect?q=` and similar known wrappers resolve to the target.

## Resolution (`resolve.ts`)

- Follow up to 5 redirect hops with the etiquette fetcher; refuse private ranges (SSRF guard).
- Read `rel="canonical"` on the final page for both sides.
- Cache results for 7 days keyed by normalised URL.
- Resolution is injected so tests run with a mock.

## Registrable domain

Computed with `tldts` using the Public Suffix List. `blog.example.co.uk` and `www.example.co.uk` share the registrable domain `example.co.uk`. `user.github.io` is its own registrable domain under the PSL's private section.

## Match levels (`levels.ts`), highest first

| Level | Rule |
|---|---|
| `exact_url` | Normalised URLs are equal |
| `canonical` | Resolved canonical URLs are equal |
| `path_prefix` | Same host and the cited path starts with the customer's path (section or hub pages) |
| `subdomain` | Same registrable domain and the cited host is a subdomain of (or equal to) the customer's host |
| `registrable_domain` | Same registrable domain, any host |
| `brand_entity` | No URL match, but a brand term appears in the answer text (counted separately as a mention) |

Platform domains never match at `subdomain` or `registrable_domain`: `youtube.com`, `reddit.com`, `medium.com`, `linkedin.com`, `facebook.com`, `quora.com`, `substack.com`, `github.com`, `wikipedia.org` and any PSL private-section host. For these only `exact_url`, `canonical` and `path_prefix` count, so another author's Medium post never registers as the customer's win.

## Events

For each new snapshot and each tracked query, the highest match level found is recorded. Event rules are in `metrics.md`: `first_seen`, `lost` (3 consecutive present renders without a match), `regained`, `brand_mention`. Losses during an open model-regime window are recorded as suppressed.

## Required test cases (T4.1, at least 60)

- `https://www.example.com/best-crm/` vs `http://example.com/best-crm` → `subdomain` (www versus apex), not `exact_url`.
- `https://example.com/best-crm?utm_source=x` vs `https://example.com/best-crm` → `exact_url`.
- `https://example.com/best-crm/` vs `https://example.com/best-crm` → `exact_url`.
- `https://www.google.com/url?q=https://example.com/best-crm` → `exact_url` after unwrapping.
- `https://example-com.cdn.ampproject.org/c/s/example.com/best-crm` → `canonical` after unwrapping and resolution.
- `http://example.com/best-crm` redirecting to `https://example.com/best-crm` → `canonical`.
- `https://m.example.com/best-crm` vs `https://example.com/best-crm` → `subdomain`.
- `https://example.com/best-crm/pricing` vs customer `https://example.com/best-crm` → `path_prefix`.
- `https://blog.example.com/anything` vs customer `https://example.com/best-crm` → `registrable_domain`.
- `https://medium.com/@someone-else/post` vs customer `https://medium.com/@customer/post` → no match.
- `https://medium.com/@customer/post` vs customer `https://medium.com/@customer/post` → `exact_url`.
- `https://youtube.com/watch?v=abc` vs customer `https://youtube.com/@customerchannel` → no match.
- `https://customer.github.io/page` vs `https://other.github.io/page` → no match (private PSL section).
- Answer text contains "Tally Forms" and the customer's brand terms include "Tally" → `brand_entity`.
- Unicode and punycode hosts compare equal.
- A redirect to `169.254.169.254` is refused and recorded as unresolved.
