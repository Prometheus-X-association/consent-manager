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
unchanged.

### How routing works

Each of the three auth middlewares (`verifyUserJWT`, `validateAccessToken`,
`verifyParticipantJWT`) inspects the token's **unverified** `iss` claim only to
_select_ a verifier — never to trust a claim:

- No `iss`, a self-issued `iss`, or an `iss` that is not in the trusted set →
  the existing local HMAC verification (unchanged).
- An `iss` in `EXTERNAL_OIDC_ISSUERS` → the external verifier, which validates
  the signature and enforces `iss`, `aud`, `exp` and the allowed algorithms via
  OIDC discovery + remote JWKS (with caching and automatic key rotation).

After verification, the external subject (a DID / IDP subject taken from
`EXTERNAL_OIDC_SUBJECT_CLAIM`) is mapped to a local identity:

- a `UserIdentifier` whose DID `identifier` equals the subject (and its owning
  `User`), and/or
- a `Participant` whose `did` equals the subject.

There is **no just-in-time provisioning**: a valid external token whose subject
does not resolve to an existing local record is rejected with `401`. Onboarding
stays with the existing `/users/register` endpoints.

### Configuration

| Env var | Meaning | Default |
| --- | --- | --- |
| `EXTERNAL_OIDC_ISSUERS` | Comma-separated list of trusted issuer URLs (must match the token `iss`) | _(empty = feature off)_ |
| `EXTERNAL_OIDC_AUDIENCE` | Expected `aud` claim | _(required when issuers set)_ |
| `EXTERNAL_OIDC_ALGS` | Allowed (asymmetric) signing algorithms | `RS256,ES256,EdDSA` |
| `EXTERNAL_OIDC_SUBJECT_CLAIM` | Claim holding the DID / external subject | `sub` |
| `EXTERNAL_OIDC_DISCOVERY_TTL` | Discovery + JWKS cache TTL (seconds) | `3600` |

If `EXTERNAL_OIDC_ISSUERS` is set without `EXTERNAL_OIDC_AUDIENCE`, startup fails
fast to avoid accepting a trusted issuer's token for any relying party.

```.dotenv
# Example: trust one external IDP
EXTERNAL_OIDC_ISSUERS=https://idp.example.org
EXTERNAL_OIDC_AUDIENCE=consent-manager
EXTERNAL_OIDC_ALGS=RS256,ES256,EdDSA
EXTERNAL_OIDC_SUBJECT_CLAIM=sub
EXTERNAL_OIDC_DISCOVERY_TTL=3600
```

### End-to-end example

1. A user logs in through an external IDP / OID4VP flow and receives an access
   token, e.g. with the (decoded) payload:

   ```json
   {
     "iss": "https://idp.example.org",
     "aud": "consent-manager",
     "sub": "did:example:123456789abcdefghi",
     "exp": 1755600000
   }
   ```

2. The token must correspond to an existing local identity: a `UserIdentifier`
   whose `identifier` is `did:example:123456789abcdefghi` (linked to a `User`),
   or a `Participant` whose `did` is that value.

3. The client calls a protected endpoint with the token:

   ```sh
   curl -H "Authorization: Bearer <external-token>" \
     http://localhost:3000/v1/users/me
   ```

4. The consent manager discovers
   `https://idp.example.org/.well-known/openid-configuration`, fetches the
   `jwks_uri`, verifies the signature and claims, maps the subject to the local
   user, and processes the request. An unknown subject yields `401`.

## Contributing

We welcome contributions to the Prometheus-X Consent Manager. If you encounter a bug or wish to propose a new feature, kindly open an issue in the GitHub repository. For code contributions, fork the repository, create a new branch, make your changes, and submit a pull request.

## License

The Prometheus-X Consent Manager is open-source software licensed under the [MIT License](LICENSE).
