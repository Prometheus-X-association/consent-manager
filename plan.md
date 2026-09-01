# Implementation Plan — External IDP JWT Verification (OIDC discovery + JWKS)

## Goal

The consent-manager requires JWTs on many endpoints but today only accepts
tokens **it signs itself** (symmetric HS256, shared secrets). This plan adds the
ability to **verify JWTs issued by external IDPs / OID4VP login flows**, using
signing keys fetched from JWKS endpoints that are discovered via each issuer's
`.well-known/openid-configuration` document.

## Decisions (locked)

1. **Validation site:** inside the consent-manager (its own endpoints — e.g. the
   PDI iframe and consent UI — are called directly, not only through the
   gateway).
2. **Unknown subjects:** **rejected** with `401`. A valid external token whose
   subject does not resolve to an existing user/participant is not
   auto-provisioned; onboarding stays with the existing `/users/register`
   endpoints.
3. **Library:** [`jose`](https://github.com/panva/jose) — built-in OIDC
   discovery, remote JWKS with caching + key rotation, and `ES256`/`EdDSA`
   support (needed for OID4VP). It runs alongside the existing `jsonwebtoken`
   HMAC paths, which are left unchanged.

## Current state (upstream `VisionsOfficial/consent-manager`)

All verification is symmetric HS256 via `jsonwebtoken`, at three points:

| Middleware | File | Secret / source | `sub` means |
| --- | --- | --- | --- |
| `verifyParticipantJWT` | `src/middleware/auth.ts` | `JWT_SECRET_KEY`, or per-participant `clientSecret` when a `serviceKey` claim is present | local Participant `_id` |
| `verifyUserJWT` | `src/middleware/auth.ts` | `OAUTH_SECRET_KEY`, or `x-user-key` header (DB lookup, no JWT) | local User `_id` |
| `validateAccessToken` | `src/middleware/oauth.ts` | `OAUTH_SECRET_KEY` | local User `_id` |

Tokens are issued locally in `src/libs/jwt/index.ts` and
`src/libs/OAuth/tokens.ts`; payloads carry only `sub` + name/email — **no `iss`
and no `aud`**. `axios` + `axios-cache-interceptor` are already dependencies;
`jose`/`jwks-rsa` are not.

## Why this is more than "call a JWKS library"

- **Algorithm shift** — external tokens are asymmetric (`RS256`/`ES256`/`EdDSA`);
  `jsonwebtoken` neither discovers nor caches JWKS, so a new verifier is required
  regardless.
- **Identity binding is the real work** — a local `sub` is a Mongo `_id`, but an
  external `sub` is a DID / IDP subject. After signature verification the subject
  must be mapped to an existing local User/UserIdentifier (or Participant), and
  rejected with `401` if none exists.
- **Upstream footprint** — this modifies the consent-manager itself. Land it as a
  topic branch / maintained patch and open a PR to
  `VisionsOfficial/consent-manager` so it can flow back upstream.

## Design

- **Issuer-based routing, not a try/catch cascade.** Each middleware peeks at the
  unverified `iss` claim (base64-decode the payload, the same technique already
  used in `auth.ts`). Absent `iss` or a self `iss` → the existing HMAC path,
  untouched. `iss` in the configured trusted set → the external verifier. This
  keeps all current behavior strictly additive.
- **Verifier module** builds one cached remote JWKS per issuer and validates
  signature + `iss` + `aud` + `exp` + allowed algorithms.
- **Identity mapping helper** resolves the configured subject claim to a local
  record and enforces the reject-unknown policy.

## Configuration (named constants; add to `.env.sample`)

| Env var | Meaning | Default |
| --- | --- | --- |
| `EXTERNAL_OIDC_ISSUERS` | Comma-separated list of trusted issuer URLs | *(empty = feature off)* |
| `EXTERNAL_OIDC_AUDIENCE` | Expected `aud` claim | *(required when issuers set)* |
| `EXTERNAL_OIDC_ALGS` | Allowed signing algorithms | `RS256,ES256,EdDSA` |
| `EXTERNAL_OIDC_SUBJECT_CLAIM` | Claim holding the DID / external subject | `sub` |
| `EXTERNAL_OIDC_DISCOVERY_TTL` | Discovery + JWKS cache TTL (seconds) | `3600` |

No magic literals in code — each of the above is read once into a typed config
module and referenced by name.

## Work breakdown

### Step 1 — Config & dependency
- `npm i jose`.
- New `src/config/externalIdp.ts` parsing the env vars above into a typed,
  validated config object (fails fast if issuers are set without an audience).
- Extend `.env.sample`.

### Step 2 — External verifier module
`src/libs/jwt/externalVerifier.ts` (fully JSDoc'd):
- Fetch `<issuer>/.well-known/openid-configuration` through the existing axios +
  `axios-cache-interceptor` (respecting `EXTERNAL_OIDC_DISCOVERY_TTL`); read
  `jwks_uri`.
- Build and cache a `jose.createRemoteJWKSet(jwks_uri)` per issuer (handles key
  rotation automatically).
- `verifyExternalToken(token)` → validates signature, `iss ∈ trusted set`, `aud`,
  `exp`, and allowed algs; returns the verified claim set. Throws the existing
  typed errors from `src/errors/`.

### Step 3 — Issuer routing + identity mapping
- `resolveTokenRoute(token)` → `"local" | "external"` from the unverified `iss`.
- `mapExternalSubjectToLocal(claims)` → resolve `EXTERNAL_OIDC_SUBJECT_CLAIM` to a
  `UserIdentifier`/`User` (reusing the existing identifier-search lookup) and
  Participant. **Return `401` if not found** — no JIT provisioning.

### Step 4 — Wire into the three middlewares (additive)
In `verifyUserJWT`, `validateAccessToken`, and `verifyParticipantJWT`: before the
existing HMAC verify, branch on `resolveTokenRoute`. External →
`verifyExternalToken` + `mapExternalSubjectToLocal`, then populate
`req.user` / `req.userParticipant` / `req.decodedToken` exactly as the local path
does today. The local branch is unchanged.

### Step 5 — Tests (parameterized, with a mock JWKS)
- Verifier unit tests: generate `RS256`/`ES256` keypairs with `jose`, stand up a
  mock discovery + JWKS endpoint. Parameterized cases: valid, wrong `iss`, wrong
  `aud`, expired, wrong alg, key rotation, unknown-subject → `401`.
- Middleware tests: local token still passes unchanged; external token maps to
  the correct local id; unknown subject → `401`.

### Step 6 — Docs
- Document the new env vars and an end-to-end external-IDP / OID4VP token example.

## Effort estimate

| Step | Effort |
| --- | --- |
| Config + `.env.sample` | 0.25 d |
| External verifier module (discovery + JWKS + verify) | 1 d |
| Issuer routing + identity mapping (reject-unknown) | 1 d |
| Wire the 3 middlewares | 0.5 d |
| Tests (parameterized + mock JWKS) | 1 d |
| Docs + upstream PR scaffolding | 0.5 d |
| **Total** | **~4.25 days** |

## Risks

- **Routing must not weaken the local path** — the `iss` peek happens *before*
  verification, so it is used only to select a verifier, never to trust a claim.
- **Claim → local-identity mapping** — the external `sub` shape (DID) must line up
  with how identities are stored locally; covered by the identity-mapping tests.
- **Upstream divergence** — keep the change small and PR it back to
  `VisionsOfficial/consent-manager` to avoid maintaining a long-lived fork.
