# Code review — `wistefan/consent-manager` PR #1

**Title:** feat: verify external IDP / OID4VP JWTs via OIDC discovery + JWKS
**Branch:** `topic/external-idp-jwt-verification` → `main`
**Size:** 12 files, +1221 / −12
**Reviewed at commit:** `cffa6c5`

---

## Summary

The shape of the change is right, and the security posture of the *crypto* layer is
mostly sound: asymmetric-only defaults, a fail-closed design, the unverified `iss`
used only to pick a verifier (never to trust a claim), no JIT provisioning, and the
local HS256 paths genuinely left untouched. Docs, `.env.sample` and JSDoc are above
the bar for this repo.

What is *not* ready is the layer around it. Three things I would block a merge on:

1. **The external subject is mapped onto `UserIdentifier.identifier`** — a field that
   is participant-supplied (`internalID`), non-unique and unindexed. That turns a
   trusted-IDP login into an account-takeover primitive.
2. **The subject is not scoped by issuer.** With more than one trusted issuer, issuer
   A can mint a token for a subject that belongs to issuer B.
3. **Config validation throws inside an `async` Express 4 middleware**, so the
   documented "startup fails fast" is actually "first authenticated request crashes
   the process".

Plus one correctness gap that undermines the stated guarantees: **`exp` is not
required**, so a trusted issuer emitting a token without `exp` yields a token that
never expires.

Details, ordered by severity, below.

---

## Blocking

### B1 — External subject maps to a participant-controlled field (`UserIdentifier.identifier`)

`src/libs/jwt/externalIdentity.ts:88`

```ts
const userIdentifier = await UserIdentifier.findOne({ identifier: subject }).lean();
```

The README describes `identifier` as "a `UserIdentifier` whose DID `identifier` equals
the subject". It is not a DID field. In this codebase `identifier` is written from
participant-supplied input:

- `src/controllers/usersController.ts:150` — `identifier: req.body.internalID`
- `src/controllers/usersController.ts:277` — `identifier: user.internalID`
- `src/controllers/consentsController.ts:1613` — `identifier: internalID`
- `src/controllers/consentsController.ts:1671` — `identifier: providerUserIdentifierDocument.email`

So it holds a *participant-scoped opaque internal ID*, and sometimes an email address.
The schema (`src/models/UserIdentifier/UserIdentifier.model.ts:12`) declares it
`{ type: String }` — not required, not unique, not indexed.

Consequences:

- **Impersonation via a participant.** Any participant that can update a user
  identifier can set `internalID` to a DID it controls. The next external login with
  that DID resolves to the victim's `User` and `verifyUserJWT` calls `next()` with
  `req.user.id` = victim.
- **Non-deterministic mapping.** `identifier` is not unique and not scoped to
  `attachedParticipant`. Two participants can legitimately use the same internal ID
  for different people; `findOne` then returns whichever document Mongo hands back
  first.
- **`Participant.did` has the same problem** (`Participant.model.ts:6`:
  `required: true, default: ""`, no unique index) — `findOne({ did: subject })` is
  equally non-deterministic.

**Recommendation:** do not overload `identifier`. Add a dedicated, uniquely-indexed
binding for external identities, e.g. a collection or sub-document keyed on the pair
`{ issuer, subject }`, populated only through an explicit, authenticated linking flow
— never through the generic user-update endpoint. Until that exists, this feature
should not be enabled against a multi-participant deployment.

### B2 — Subject is not scoped by issuer

`src/libs/jwt/externalIdentity.ts:83-121`

`mapExternalSubjectToLocal(claims)` looks the subject up on its own. The verified
`claims.iss` is available and discarded. The identity of an OIDC principal is the
`(iss, sub)` pair, not `sub` alone; `sub` is only unique *within* an issuer.

`EXTERNAL_OIDC_ISSUERS` is explicitly a list, so multi-issuer is a supported
configuration. With two trusted issuers, whichever one is more permissive about what
`sub` values it will mint can impersonate any principal of the other. DIDs make this
less acute than opaque subjects would, but the invariant is a property of the issuer,
not something this code can assume.

**Recommendation:** persist and match on `(issuer, subject)`, and reject a stored
binding whose issuer does not match the verified `iss`. This falls out naturally if
B1 is fixed with a dedicated binding record.

### B3 — Config error surfaces as an unhandled rejection, not a startup failure

`src/config/externalIdp.ts:112` throws when `EXTERNAL_OIDC_ISSUERS` is set without
`EXTERNAL_OIDC_AUDIENCE`. The README states:

> If `EXTERNAL_OIDC_ISSUERS` is set without `EXTERNAL_OIDC_AUDIENCE`, startup fails
> fast […]

It does not. The config is parsed lazily on first `getExternalIdpConfig()` call, which
happens inside `resolveTokenRoute()` — called *outside* the `try` block in all three
middlewares:

- `src/middleware/auth.ts:64` (`verifyParticipantJWT`)
- `src/middleware/auth.ts:229` (`verifyUserJWT`)
- `src/middleware/oauth.ts:29` (`validateAccessToken`)

These are `async` functions and the project is on Express 4 (`express: ^4.18.2`), which
does not observe a returned rejected promise. The result on a misconfigured deployment
is: the server boots healthy, the first authenticated request never gets a response,
and the process dies on Node's default `unhandled-rejections=throw`. A crash loop that
only starts under traffic is materially worse than a boot failure.

**Recommendation:** two changes, both cheap.

1. Call `getExternalIdpConfig()` eagerly during startup (`src/index.ts` / `startServer`)
   so the documented fail-fast is real.
2. Move `resolveTokenRoute()` inside the existing `try` in each middleware (or wrap the
   middlewares in an `asyncHandler`), so no config or decode error can escape as an
   unhandled rejection.

### B4 — `exp` is not required, so non-expiring external tokens are accepted

`src/libs/jwt/externalVerifier.ts:182-186`

```ts
const { payload } = await jwtVerify(token, getKey, {
  issuer,
  audience: config.audience,
  algorithms: [...config.algorithms],
});
```

`jose` validates `exp` *if present*; it does not require it. Both the commit message
and the README claim `exp` is enforced. A trusted issuer that omits `exp` — not
hypothetical for SIOP / OID4VP-issued tokens — produces a bearer token this service
will accept forever. The test suite has an "expired token" case but no "no `exp`" case,
so the gap is invisible.

**Recommendation** (`requiredClaims` is available from jose 4.14, and this PR pins
`^4.15.9`):

```ts
const { payload } = await jwtVerify(token, getKey, {
  issuer,
  audience: config.audience,
  algorithms: [...config.algorithms],
  requiredClaims: ["exp", "iat", "sub"],
  maxTokenAge: config.maxTokenAgeSeconds,   // optional upper bound
  clockTolerance: config.clockToleranceSeconds, // see M5
});
```

### B5 — Session caching defeats external token expiry

`src/middleware/auth.ts:75`, and the short-circuit at `src/middleware/auth.ts:34-37`:

```ts
if (req.session.userParticipant) {
  req.userParticipant = { id: req.session.userParticipant.id };
  return next();
}
…
req.session.userParticipant = { id: identity.participant.id };
```

Once an external token has been verified one time, the session takes over and the
token is never looked at again: expiry, key rotation and de-provisioning at the IDP
all stop having any effect for the lifetime of the session cookie. The same pattern
exists on the local path, but the local path issues its own 1-hour tokens
(`src/libs/jwt/index.ts`), whereas an external IDP is precisely the party whose
revocation decisions this service should be honouring.

**Recommendation:** for the external branch, either skip the session write entirely and
re-verify per request (discovery and JWKS are both cached, so the cost is a signature
check plus the identity lookup), or store the token's `exp` alongside the id and
re-validate it on the short-circuit path.

---

## Medium

### M1 — Discovery fetch has no timeout, no negative caching, and reports upstream failures as 401

`src/libs/jwt/externalVerifier.ts:39-44, 76-111`

- `Axios.create()` with no `timeout` defaults to *no* timeout. A trusted IDP that
  accepts the connection and stalls will hold the request open indefinitely, and each
  such request pins a socket. This is the one external network call on the auth hot
  path; it needs a bound.
- `cachePredicate.statusCheck: (status) => status === 200` means failures are never
  cached. While an IDP is down, every single incoming request issues a fresh discovery
  fetch — the service amplifies its own traffic against an already-failing dependency
  and every caller waits the full failure time before getting a 401.
- A 5xx from the IDP, a DNS failure and a TLS error all become
  `UnauthorizedError("Unable to verify external token")` → HTTP 401. The client's
  credential is fine; the service's dependency is not. `503` with `Retry-After` is the
  honest answer, and it keeps clients from discarding valid tokens and re-running a
  login flow that cannot succeed.

**Recommendation:** set an explicit `timeout` (a few seconds), add short negative
caching or a small circuit breaker per issuer, and introduce a distinct error type for
"IDP unreachable" that maps to 503.

### M2 — `EXTERNAL_OIDC_DISCOVERY_TTL` does not control JWKS caching

`src/libs/jwt/externalVerifier.ts:131`

```ts
const getKey = createRemoteJWKSet(new URL(jwksUri));
```

No options are passed, so JWKS caching uses `jose`'s defaults (`cacheMaxAge` 10 min,
`cooldownDuration` 30 s, `timeoutDuration` 5 s) regardless of the configured TTL. The
env var, its `.env.sample` comment, the README table and the `ExternalIdpConfig` JSDoc
all describe it as "Discovery **+ JWKS** cache TTL". Only discovery is affected.

**Recommendation:** pass `{ cacheMaxAge, timeoutDuration, cooldownDuration }` through
from config, or rename the variable and correct all four descriptions to say discovery
only.

### M3 — Discovery document is not validated against the issuer

`src/libs/jwt/externalVerifier.ts:95`

Only `jwks_uri` is read. OIDC Discovery §4.3 requires the client to check that the
`issuer` value in the returned document matches the issuer it discovered from — this is
the standard mitigation for discovery-response substitution. There is also no check
that `jwks_uri` is `https` or that it shares an origin with the issuer, so a
compromised or misconfigured discovery document can point key resolution at an
arbitrary host (also a modest SSRF primitive, bounded by the trusted-issuer set).

**Recommendation:** assert `response.data.issuer === issuer`, require `https:` on both
the issuer URL and `jwks_uri`, and consider requiring same-origin for `jwks_uri`.

### M4 — Algorithm and subject-claim configuration can silently weaken the design

`src/config/externalIdp.ts:16-26, 131-143`

The JSDoc says "Symmetric algorithms are intentionally excluded so an external issuer
can never be verified with a shared secret" — true of the *default*, but
`EXTERNAL_OIDC_ALGS` is passed straight through with no validation. `HS256`, or a
typo'd value, is accepted into the allowlist. A remote JWKS makes symmetric
verification unlikely to actually succeed, but the invariant should be enforced where
it is documented, not left to a downstream accident.

Similarly, `EXTERNAL_OIDC_SUBJECT_CLAIM` is free-form. Setting it to `email` is a
plausible operator choice, and because `UserIdentifier.identifier` is *also* sometimes
populated with an email (`consentsController.ts:1671`), that configuration silently
becomes "log in as anyone whose email you know", with no `email_verified` check.

**Recommendation:** validate `EXTERNAL_OIDC_ALGS` against an asymmetric allowlist and
throw on anything else; either restrict `EXTERNAL_OIDC_SUBJECT_CLAIM` to a vetted set
or require `email_verified === true` when the claim is `email`.

### M5 — No clock tolerance

`jwtVerify` defaults to `clockTolerance: 0`. With an external IDP there is no shared
clock; a second of skew produces spurious 401s at token issuance time that are very
hard to diagnose from the client side. 30–60 s is the usual choice and should be
configurable.

### M6 — No token-type separation across the three middlewares

All three call sites verify against the same `config.audience` with the same rules.
Nothing distinguishes an ID token from an access token from a participant token, so a
token minted for one purpose is accepted at all three. In practice the identity
mapping narrows this (a subject must match a `Participant.did` to pass
`verifyParticipantJWT`), but the token-level check should not be relying on that.

**Recommendation:** at minimum check the `typ` header (`at+jwt` for access tokens) and
consider separate audience values per surface.

### M7 — Error responses leak internal detail and act as an existence oracle

`src/middleware/auth.ts:21-24` returns `UnauthorizedError.message` verbatim to the
caller. That surfaces strings such as:

- `Discovery document for issuer 'https://internal-idp.corp' has no jwks_uri`
  (`externalVerifier.ts:97`) — internal infrastructure naming.
- `External token subject does not resolve to a known identity`
  (`externalIdentity.ts:115`) vs. `Invalid or expired token` — distinguishes "your
  token is valid but you are not enrolled" from "your token is bad", which is a
  registration oracle for anyone holding a token from the trusted IDP.

`validateAccessToken` (`oauth.ts:39`) does the opposite and always returns a generic
message, so the two surfaces are inconsistent as well.

**Recommendation:** log the specific reason, return a generic one; if a distinguishable
"not enrolled" response is genuinely wanted for UX, make it a deliberate, documented
choice rather than a side effect of message pass-through.

### M8 — `package-lock.json` was not updated

The repo carries both `pnpm-lock.yaml` and `package-lock.json`. Only the pnpm lockfile
gained `jose`. Anyone installing with `npm ci` gets a build that fails to resolve
`jose` at runtime, and the two lockfiles drift further apart. Either update both or
delete the one that is not authoritative.

The `jose@^4` pin (rather than v5/v6) is the *right* call given `"module": "commonjs"`
in `tsconfig.json` — v5 dropped CJS — but that reasoning is not written down anywhere
and will read as an oversight to the next person to touch it. One comment in
`package.json` or the README would save that round trip.

---

## Tests

The test files are well-structured — parameterized cases, named constants, real
keypairs, a genuine mock IDP. The gaps are about *which* properties are covered.

### T1 — The central security property is untested

There is no test for **a token carrying a trusted `iss` but signed by a key that is not
in that issuer's JWKS**. The "untrusted issuer" case
(`externalVerifier.spec.ts:141-144`) is rejected by the routing check before any
cryptography runs, so nothing in the suite currently exercises signature rejection.
That is the one thing this module exists to do.

Also missing: `alg: none`; a token with no `exp` (which would expose B4); an `aud`
array; a structurally malformed token reaching `verifyExternalToken`.

### T2 — The discovery HTTP cache is never reset, so one test passes for the wrong reason

`resetExternalVerifierCaches()` clears `jwksByIssuer` but not the module-level
`discoveryHttpClient` cache, which is keyed `external-oidc-discovery:<issuer>` with a
3600 s TTL and therefore survives every test in the run.

`"fails closed when discovery has no jwks_uri"` (`externalVerifier.spec.ts:219-230`)
sets up a discovery response of `{}`, but by then the good discovery document from
earlier tests is already cached and is what gets served. The `jwks_uri` is found; the
test then passes only because `beforeEach`'s `nock.cleanAll()` left the JWKS endpoint
unmocked and nock blocks the request. Nothing about the intended code path is verified.

Same root cause: `"picks up rotated signing keys after the cache refreshes"`
(`:199-217`) calls `resetExternalVerifierCaches()` before re-verifying, so it tests
"cache reset rebuilds the JWKS", not jose's rotation handling. A real rotation test
adds a new `kid` to the JWKS response and verifies a token signed with it *without*
clearing any cache.

**Recommendation:** export a cache-reset that also clears the axios store (e.g.
`discoveryHttpClient.storage.clear()`) and call it from `beforeEach`.

### T3 — No tests for `mapExternalSubjectToLocal`

The identity mapping is where B1 and B2 live and it has zero direct coverage. It needs
tests (mongodb-memory-server, or stubbed models) for: subject matching a
`UserIdentifier` with and without an owning `User`; subject matching a `Participant`;
subject matching nothing → 401; and — once B1/B2 are addressed — subject matching
records belonging to a *different* issuer or participant → rejected.

### T4 — Middleware tests verify wiring only

`authMiddleware.spec.ts` stubs `resolveTokenRoute`, `verifyExternalToken` and
`mapExternalSubjectToLocal` at the module boundary. That is a reasonable way to test
branch selection, and the branch selection is covered well. But nothing tests the
middlewares against real verification, and in particular nothing asserts the most
important negative: **a token routed to the external verifier that fails verification
must 401 and must not fall through to the local HMAC path.** Worth one end-to-end test
per middleware with the real verifier and the mock IDP.

### T5 — Test isolation

- `nock(...).persist()` interceptors are installed but `nock.cleanAll()` only runs in
  the first `describe`'s `beforeEach`; the `Token routing` block leaves them in place
  for whatever spec file mocha loads next.
- `after()` calls `nock.enableNetConnect()` although nothing ever called
  `disableNetConnect()`.
- `process.env` is mutated globally and restored only in `after()`.

None of these bite today, but they are the usual source of order-dependent failures
later.

---

## Minor / polish

- **Unindexed queries on the auth hot path.** `UserIdentifier.identifier` and
  `Participant.did` have no index (`grep -rn "index(" src/models` → nothing), so every
  external-token request costs two collection scans. Add indexes alongside the B1 fix.
- **Duplicated work per request.** `resolveTokenRoute()` and `verifyExternalToken()`
  each call `getExternalIdpConfig()` and each `decodeJwt` the token. Have the router
  return the peeked issuer and pass it down.
- **The same ~14-line external branch is copy-pasted into three middlewares**
  (`auth.ts:64-80`, `auth.ts:229-246`, `oauth.ts:29-41`), each with a slightly
  different 401 body shape (`{message}`, `{success,message}`, `{error}`). Extract one
  `authenticateExternal(token)` helper returning a `LocalIdentity`, and let each
  middleware apply only its own requirement.
- **`UnauthorizedError` is not wired into `globalErrorHandler`.** The new error type is
  caught by hand at every call site; `globalErrorHandler`
  (`src/middleware/globalErrorHandler.ts:15`) still only special-cases
  `BadRequestError`, so any `UnauthorizedError` that escapes becomes a 500. Adding a
  branch there would let the middlewares `next(error)` and delete the local handling.
  Also worth setting `this.name = "UnauthorizedError"` for cleaner logs.
- **`claims as unknown as JwtPayload`** (`auth.ts:73`, `auth.ts:238`) — the double cast
  papers over a real type mismatch between jose's `JWTPayload` and jsonwebtoken's
  `JwtPayload`. Widen the `req.decodedToken` declaration instead.
- **`Number.parseInt` leniency** (`externalIdp.ts:127`): `EXTERNAL_OIDC_DISCOVERY_TTL=3600x`
  silently parses as `3600`. Prefer a strict numeric check so typos are loud.
- **Trailing-slash asymmetry** (`externalVerifier.ts:63-64`): `stripTrailingSlash` is
  applied when building the discovery URL, but issuer matching
  (`config.issuers.has(issuer)`) and the cache id use the raw string. Configuring
  `https://idp/` while the IDP emits `iss: https://idp` silently routes every token to
  the local path and yields a confusing 401. Normalize once at config-parse time.
- **`jwtVerify(..., { issuer })` passes the peeked issuer**, which makes that particular
  check tautological. The real binding comes from the JWKS selection, so it is not a
  bug — but passing `[...config.issuers]` states the intent more directly.
- **Positive note:** `oauth.ts` external branch sets `req.user = { id }`, which matches
  what every consumer actually reads (`req.user.id` in `consentsController.ts:295`,
  `dataExchangeController.ts:23`, …). The pre-existing local branch's
  `req.user = decoded as any` leaves `req.user.id` undefined. Worth fixing the local
  branch in the same PR for consistency.

---

## Suggested path to merge

1. Fix B3 and B4 — small, self-contained, no design decisions needed.
2. Redesign the identity binding for B1/B2: a dedicated `(issuer, subject)` record with
   a unique index and an explicit linking flow. This is the real work in this PR and
   probably deserves its own commit.
3. Add T1 and T3 coverage; fix the cache leak in T2.
4. M1, M3 and M5 before anything is pointed at a production IDP.
5. Correct the README/`.env.sample`/JSDoc claims that no longer hold (`exp` enforcement,
   "startup fails fast", "Discovery + JWKS cache TTL", "DID `identifier`").

The M-level items are all reasonable follow-ups if the B-level ones land first and the
feature ships disabled by default, which it does.

---

*Review performed by static reading of the branch at `cffa6c5`; the test suite was not
executed (dependencies not installed in the review environment), so the T2 analysis is
derived from the caching code rather than from an observed failure.*
