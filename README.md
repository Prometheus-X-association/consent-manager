# Consent Manager

The Prometheus-X Consent Manager is a service for managing consent within the Prometheus-X ecosystem. It empowers ecosystem administrators to oversee and enforce consent agreements, data/service providers to adhere to consent regulations, and users to manage their consent preferences seamlessly.

## Prerequisites

Before you begin, ensure you have met the following requirements:

- [pnpm](https://pnpm.io/) package manager installed
- [mongodb with replicaset](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set/)

## Installation

### Locally

```sh
git clone https://github.com/Prometheus-X-association/consent-manager.git
cd consent-manager
npm install --unsafe-perm
cp .env.sample .env
# Configure your environment variables in .env
```

### Docker

1. Clone the repository from GitHub: `git clone https://github.com/Prometheus-X-association/consent-manager.git`
2. Navigate to the project directory: `cd consent-manager` and copy the .env.sample to .env `cp .env.sample .env`
3. Configure the application by setting up the necessary environment variables. You will need to specify database connection details and other relevant settings.

```.dotenv
#Example
NODE_ENV=development
PORT=3000
APP_ENDPOINT=http://localhost:3000
MONGO_URI=mongodb://consent-manager-mongodb:27017/consent-manager
MONGO_URI_TEST=mongodb://consent-manager-mongodb:27017/consent-manager-test
API_PREFIX=/v1
SALT_ROUNDs=10
PDI_ENDPOINT=http://localhost:3331

APPLICATION_NAME=consentmanager-pdi
FEDERATED_APPLICATION_IDENTIFIER=http://localhost:3000

SESSION_COOKIE_NAME=consentmanagersessid
SESSION_SECRET=secret123
JWT_SECRET_KEY=secret123

OAUTH_SECRET_KEY=abc123secret
OAUTH_TOKEN_EXPIRES_IN=1h

CONTRACT_SERVICE_BASE_URL=http://localhost:3000/contracts

# Logs
WINSTON_LOGS_MAX_FILES=14d
WINSTON_LOGS_MAX_SIZE=20m

# Nodemailer
NODEMAILER_HOST=
NODEMAILER_PORT=
NODEMAILER_USER=abc@domain.com
NODEMAILER_PASS=pass
NODEMAILER_FROM_NOREPLY="abc <abc@domain.com>"

#MANDRILL
MANDRILL_ENABLED=false
MANDRILL_API_KEY="yourkey"
MANDRILL_FROM_EMAIL="noreply@visionstrust.com"
MANDRILL_FROM_NAME="noreply"

#Consent
#add multiple by adding ","
PRIVACY_RIGHTS=

WITHDRAWAL_METHOD=
CODE_OF_CONDUCT=
IMPACT_ASSESSMENT=
AUTHORITY_PARTY=
```

4. Create a docker network using `docker network create ptx`
5. Start the application: `docker-compose up -d --build`
6. If you don't want to use the mongodb container from the docker compose you can use the command `docker run -d -p your-port:your-port --name consent-manager consent-manager` after running `docker-compose build`

The consent manager is a work in progress, evolving alongside developments of the Contract and Catalog components of the Prometheus-X Ecosystem.

## Terraform

1. Install Terraform: Ensure Terraform is installed on your machine.
2. Configure Kubernetes: Ensure you have access to your Kubernetes cluster and kubectl is configured.
3. Initialize Terraform: Run the following commands from the terraform directory.

```sh
cd terraform
terraform init
```

4. Apply the Configuration: Apply the Terraform configuration to create the resources.

```sh
terraform apply
```

5. Retrieve Service IP: After applying the configuration, retrieve the service IP.

```sh
terraform output consent_manager_service_ip
```

> - Replace placeholder values in the `kubernetes_secret` resource with actual values from your `.env`.
> - Ensure the `server_port` value matches the port used in your application.
> - Adjust the `host_path` in the `kubernetes_persistent_volume` resource to an appropriate path on your Kubernetes nodes.

### Deployment with Helm

1. **Install Helm**: Ensure Helm is installed on your machine. You can install it following the instructions [here](https://helm.sh/docs/intro/install/).

2. **Package the Helm chart**:

   ```sh
   helm package ./path/to/consent-manager
   ```

3. **Deploy the Helm chart**:

   ```sh
   helm install consent-manager ./path/to/consent-manager
   ```

4. **Verify the deployment**:

   ```sh
   kubectl get all -n consent-manager
   ```

5. **Retrieve Service IP**:

   ```sh
   kubectl get svc -n consent-manager
   ```

> - Replace placeholder values in the `values.yaml` file with actual values from your `.env`.
> - Ensure the `port` value matches the port used in your application.
> - Configure your MongoDB connection details in the values.yaml file to point to your managed MongoDB instance.

## Endpoints

For a complete list of all available endpoints, along with their request and response schemas, refer to the [JSON Swagger Specification](./docs/swagger.json) provided or visit the [github-pages](https://prometheus-x-association.github.io/consent-manager/) of this repository which displays the swagger specification with the Swagger UI.

## Consent Agent

The Consent Agent is a component of Prometheus-X that handles the preferences and recommendations of the users. It is integrated into the Consent Manager through the `ConsentAgent` class, which is responsible for setting up the agent and retrieving the service.

All endpoints, including those related to the Consent Agent, are documented in the JSON Swagger Specification provided in this repository, in the profile section.

For more information on the Consent Agent and its integration with the Consent Manager, please refer to the [Consent Agent documentation](https://github.com/Prometheus-X-association/contract-consent-agent/blob/main/README.md).

### Configuration

To use the consent agent you must configure the `consent-agent.config.sample.json`

```bash
cp consent-agent.config.sample.json consent-agent.config.json
```

After copying this file and filling in your information, the Consent Agent will be configured at startup.

#### Configuring a DataProvider (`consent-agent.config`)

The configuration file is a JSON document consisting of sections, where each section describes the configuration for a specific **DataProvider**. Below is a detailed explanation of the available attributes:

- **`source`**: The name of the target collection or table that the DataProvider connects to.
- **`url`**: The base URL of the database host.
- **`dbName`**: The name of the database to be used.
- **`watchChanges`**: A boolean that enables or disables change monitoring for the DataProvider. When enabled, events will be fired upon detecting changes.
- **`hostsProfiles`**: A boolean indicating whether the DataProvider hosts the profiles.
- **`existingDataCheck`**: A boolean that enables the creation of profiles when the module is initialized.

#### Example Configuration

Here’s an example of a JSON configuration:

```json
{
  "source": "profiles",
  "url": "mongodb://localhost:27017",
  "dbName": "contract_consent_agent_db",
  "watchChanges": false,
  "hostsProfiles": true,
  "existingDataCheck": true
}
```

#### Consent Agent Tests

##### Prerequisites for running the test agent

- .env file
- Mongodb database with [replica-set](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set/)

1. Run tests:

```bash
pnpm test-agent
```

This command will run your tests using Mocha, with test files located at `./src/tests/agent.spec.ts`.

2. Run tests in docker

```bash
docker exec -it consent-manager npm run test-agent
```

> <details><summary>Expected output</summary>
>
> ![expected output](./docs/images/test-agent-output.png)
>
> </details>

#### example endpoints

> <details><summary>Before using these endpoints you need to signup with a user to get access token</summary>
>
> POST /${API_PREFIX}/users/signup
>
> input:
>
> ```json
> {
>   "firstName": "john",
>   "lastName": "doe",
>   "email": "john@doe.com",
>   "password": "1234"
> }
> ```
>
> output :
>
> ```json
> {
>   "user": {
>     "firstName": "john",
>     "lastName": "doe",
>     "email": "john@doe.com",
>     "password": "$2b$10$Vf7EoR.Wp3GxWWb6LUNU1OSgahDppRSOCyU3X0Wan5AcR/88b6BpO",
>     "identifiers": [],
>     "oauth": {
>       "scopes": ["Read user data", "Modify user data"],
>       "refreshToken": "62025bd0886e77f1f895b0d1b9e70c82ef8af61f6232298d7c14bb630bfdf62f"
>     },
>     "jsonld": "{\n  \"@context\": \"http://schema.org\",\n  \"@type\": \"Person\",\n  \"name\": \"john doe\",\n  \"email\": \"john@doe.fr\",\n  \"url\": \"undefined:8887/v1/users/67dd2b9d389148595b049e9d\"\n}",
>     "schema_version": "v0.1.0",
>     "_id": "67dd2b9d389148595b049e9d",
>     "createdAt": "2025-03-21T09:04:29.719Z",
>     "updatedAt": "2025-03-21T09:04:29.719Z",
>     "__v": 0
>   },
>   "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2N2RkMmI5ZDM4OTE0ODU5NWIwNDllOWQiLCJlbWFpbCI6ImpvaG5AZG9lLmZyIiwic2NvcGVzIjpbIlJlYWQgdXNlciBkYXRhIiwiTW9kaWZ5IHVzZXIgZGF0YSJdLCJpYXQiOjE3NDI1NDc4NjksImV4cCI6MTc0MjU1MTQ2OX0.U67aO9mUn1ITceeQSFpHyA0WuguW9M4zg2cPlTQXNUU",
>   "refreshToken": "62025bd0886e77f1f895b0d1b9e70c82ef8af61f6232298d7c14bb630bfdf62f"
> }
> ```
>
> </details>

> <details><summary>GET /${API_PREFIX}/profile/${userId}/configurations</summary>
>
> headers: `{"Authorization": Bearer JWT}`
>
> input: -
>
> output :
>
> ```json
> {
>   "allowRecommendations": true
> }
> ```
>
> </details>

> <details><summary>POST /${API_PREFIX}/profile/${userId}/preferences</summary>
>
> headers: `{"Authorization": Bearer JWT}`
>
> input:
>
> ```json
> {
>   "preference": [
>     {
>       "participant": "65eb2661a50cb6465d41865c",
>       "asDataProvider": {
>         "authorizationLevel": "never",
>         "conditions": [
>           {
>             "time": {
>               "dayOfWeek": ["0"],
>               "startTime": "2024-03-27T14:08:19.986Z",
>               "endTime": "2025-03-27T14:08:19.986Z"
>             }
>           }
>         ]
>       },
>       "asServiceProvider": {
>         "authorizationLevel": "always",
>         "conditions": [
>           {
>             "time": {
>               "dayOfWeek": ["0"],
>               "startTime": "2024-03-27T14:08:19.986Z",
>               "endTime": "2025-03-27T14:08:19.986Z"
>             },
>             "location": {
>               "countryCode": "US"
>             }
>           }
>         ]
>       }
>     }
>   ]
> }
> ```
>
> output :
>
> ```json
> [
>   {
>     "participant": "65eb2661a50cb6465d41865c",
>     "asDataProvider": {
>       "authorizationLevel": "never",
>       "conditions": [
>         {
>           "time": {
>             "dayOfWeek": ["0"],
>             "startTime": "2024-03-27T14:08:19.986Z",
>             "endTime": "2025-03-27T14:08:19.986Z"
>           }
>         }
>       ]
>     },
>     "asServiceProvider": {
>       "authorizationLevel": "always",
>       "conditions": [
>         {
>           "time": {
>             "dayOfWeek": ["0"],
>             "startTime": "2024-03-27T14:08:19.986Z",
>             "endTime": "2025-03-27T14:08:19.986Z"
>           },
>           "location": {
>             "countryCode": "US"
>           }
>         }
>       ]
>     },
>     "_id": "67c7005c5ae3449ac23751de"
>   }
> ]
> ```
>
> </details>

For more information see the [Tests definition](https://github.com/Prometheus-X-association/consent-manager/wiki/Tests-definition).

## External IDP / OID4VP token verification

By default the consent manager only accepts JWTs it signed itself (symmetric
HS256, shared secrets). It can additionally verify JWTs issued by **external
IDPs / OID4VP login flows**, using signing keys fetched from JWKS endpoints that
are discovered through each issuer's `.well-known/openid-configuration` document.

The feature is **off by default** and fully additive: when no trusted issuers
are configured, every token continues to take the existing local HMAC path
unchanged. Nothing about how users are stored or onboarded changes — the
existing `email` key is reused as-is.

### How routing works

Each of the three auth middlewares (`verifyUserJWT`, `validateAccessToken`,
`verifyParticipantJWT`) inspects the token's **unverified** `iss` claim only to
_select_ a verifier — never to trust a claim:

- No `iss`, a self-issued `iss`, or an `iss` that is not in the trusted set →
  the existing local HMAC verification (unchanged).
- An `iss` in `EXTERNAL_OIDC_ISSUERS` → the external verifier.

A token routed to the external verifier never falls back to the local path: if
external verification fails, the request is rejected.

### What the external verifier checks

Via OIDC discovery and a cached remote JWKS (`jose`), with automatic key
rotation:

- the signature, against the discovered JWKS for that issuer;
- `iss` ∈ the configured trusted set, `aud` = `EXTERNAL_OIDC_AUDIENCE`;
- `exp` and `iat` are **required** to be present, not merely valid when present,
  so an issuer omitting `exp` cannot produce a token that never expires;
- the signing algorithm is one of `EXTERNAL_OIDC_ALGS`, which may only contain
  asymmetric algorithms — a symmetric or `none` entry is rejected at startup;
- the discovery document's own `issuer` matches the issuer it was fetched for,
  and both the issuer URL and the advertised `jwks_uri` use `https`.

### Mapping a verified token to a local identity

The value of `EXTERNAL_OIDC_SUBJECT_CLAIM` is matched against:

- `User.email` — the key the consent manager already uses for natural persons.
  The field is a plain string, so it can equally hold a DID; no schema change is
  needed to onboard wallet identities.
- `Participant.did` — for participant-issued tokens.

Two deliberate restrictions:

- The subject is **not** matched against `UserIdentifier`. Those documents are
  participant-scoped and participant-writable, so matching them would let the
  party that supplies the value also choose whose account it resolves to.
  `User.email` is only ever written when a `User` is created; no route updates it.
- When `EXTERNAL_OIDC_SUBJECT_CLAIM` is `email`, the token must also carry
  `email_verified: true`. An unverified address is self-asserted by the token
  holder and cannot carry an account binding.

There is **no just-in-time provisioning**: a valid external token whose subject
does not resolve to an existing local record is rejected with `401`. Onboarding
stays with the existing `/users/register` endpoints. A subject that resolves to
more than one record is also rejected rather than matched arbitrarily.

External identities are **not cached in the session**, so the issuer's expiry
and revocation keep applying on every request.

### Response codes

| Situation                                                                         | Status                       |
| --------------------------------------------------------------------------------- | ---------------------------- |
| Token invalid, expired, or its subject unknown                                    | `401` with a uniform message |
| Trusted issuer unreachable, timing out, or serving an unusable discovery document | `503`                        |

The `401` message is identical for every cause, so the response is not an oracle
for which check failed or whether a subject is enrolled. Specific reasons are
logged.

### Configuration

| Env var                         | Meaning                                                                                | Default                             |
| ------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| `EXTERNAL_OIDC_ISSUERS`         | Comma-separated list of trusted issuer URLs, `https` only (must match the token `iss`) | _(empty = feature off)_             |
| `EXTERNAL_OIDC_AUDIENCE`        | Expected `aud` claim                                                                   | _(required when issuers set)_       |
| `EXTERNAL_OIDC_ALGS`            | Allowed signing algorithms; asymmetric only                                            | `RS256,ES256,EdDSA`                 |
| `EXTERNAL_OIDC_SUBJECT_CLAIM`   | Claim matched against `User.email` / `Participant.did`                                 | `sub`                               |
| `EXTERNAL_OIDC_DISCOVERY_TTL`   | Discovery + JWKS cache lifetime (seconds)                                              | `3600`                              |
| `EXTERNAL_OIDC_DISCOVERY_PATH`  | Path appended to each issuer URL to fetch its discovery document                       | `/.well-known/openid-configuration` |
| `EXTERNAL_OIDC_HTTP_TIMEOUT`    | Discovery / JWKS request timeout (milliseconds)                                        | `5000`                              |
| `EXTERNAL_OIDC_CLOCK_TOLERANCE` | Leeway on `exp` / `nbf` (seconds)                                                      | `30`                                |

Not every issuer serves discovery at the well-known location — a FIWARE
VCVerifier, for instance, exposes it under a per-service path — hence
`EXTERNAL_OIDC_DISCOVERY_PATH`. A value without a leading slash is normalised.

The JWKS fetch goes through `node:https` inside `jose` rather than the axios
instance, so it honours the standard `HTTPS_PROXY` / `HTTP_PROXY` and `NO_PROXY`
environment variables directly. This matters for an in-cluster deployment whose
verifier is only reachable through a forward proxy.

The configuration is parsed and validated during `startServer`, so a bad value
fails the process at startup rather than on the first authenticated request.
Setting `EXTERNAL_OIDC_ISSUERS` without `EXTERNAL_OIDC_AUDIENCE` is rejected, as
is a cleartext issuer URL, a symmetric algorithm, or a non-numeric timeout.

```.dotenv
# Example: trust one external IDP
EXTERNAL_OIDC_ISSUERS=https://idp.example.org
EXTERNAL_OIDC_AUDIENCE=consent-manager
EXTERNAL_OIDC_ALGS=RS256,ES256,EdDSA
EXTERNAL_OIDC_SUBJECT_CLAIM=sub
EXTERNAL_OIDC_DISCOVERY_TTL=3600
EXTERNAL_OIDC_DISCOVERY_PATH=/.well-known/openid-configuration
EXTERNAL_OIDC_HTTP_TIMEOUT=5000
EXTERNAL_OIDC_CLOCK_TOLERANCE=30
```

### End-to-end example

1. A user logs in through an external IDP / OID4VP flow and receives an access
   token, e.g. with the (decoded) payload:

   ```json
   {
     "iss": "https://idp.example.org",
     "aud": "consent-manager",
     "sub": "user@example.org",
     "iat": 1755596400,
     "exp": 1755600000
   }
   ```

2. The subject must correspond to an existing local identity: a `User` whose
   `email` is `user@example.org`, or a `Participant` whose `did` is that value.
   To key a user on a DID instead, store the DID in that user's `email` field
   and set `EXTERNAL_OIDC_SUBJECT_CLAIM=sub` with the wallet's DID as `sub`.

3. The client calls a protected endpoint with the token:

   ```sh
   curl -H "Authorization: Bearer <external-token>" \
     http://localhost:3000/v1/users/me
   ```

4. The consent manager discovers
   `https://idp.example.org/.well-known/openid-configuration`, checks that the
   document describes that issuer, fetches the `jwks_uri`, verifies the signature
   and claims, maps the subject to the local user, and processes the request. An
   unknown subject yields `401`; an unreachable issuer yields `503`.

### Known limitations

`Participant.did` is a pre-existing field that was never queried before this
feature, and nothing populates it with a DID today — the schema declares it
`required: true, default: ""`, `POST /participants` accepts whatever the caller
supplies, and existing data holds catalogue URLs or empty strings. So the
participant branch matches nothing until a convention for that field is agreed.

`registerParticipant` now rejects a `did` that is already taken, but that check
is application-level: it does not cover rows that already share a value, and two
concurrent registrations can still both pass it. The field wants a unique index
before anything relies on it. Until then an ambiguous match is rejected rather
than resolved arbitrarily.

The subject is matched on its own, not on the `(issuer, subject)` pair. With more
than one entry in `EXTERNAL_OIDC_ISSUERS`, any trusted issuer can assert a subject
belonging to another. Until the identity model carries the issuer, configure a
single trusted issuer, or only issuers that are authoritative for disjoint
subject namespaces.

## Contributing

We welcome contributions to the Prometheus-X Consent Manager. If you encounter a bug or wish to propose a new feature, kindly open an issue in the GitHub repository. For code contributions, fork the repository, create a new branch, make your changes, and submit a pull request.

## License

The Prometheus-X Consent Manager is open-source software licensed under the [MIT License](LICENSE).
