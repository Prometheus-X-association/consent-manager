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

## Guardianship

### 1. Purpose

A minor cannot validly give consent for the processing of their personal data. The consent manager therefore allows a **legal guardian** to:

- be attached to one or more **child accounts**;
- give, view and manage consents **on behalf of** those children.
  A consent given on behalf of a child belongs to the **child**, never to the guardian, while keeping a trace of the guardian who performed it.

---

### 2. Concepts

| Concept               | Description                                                                                                                   |
| :-------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| **Guardian**          | A regular Consent user who is the legal guardian of one or more children.                                                     |
| **Child**             | A **managed account** (no password) representing a minor. Created only through the dataspace connector.                       |
| **Guardianship**      | The relationship between a guardian and a child. Created as **pending**, becomes **validated** once the guardian confirms it. |
| **Consent on behalf** | A consent stored on the child (`user = childId`) whose event records `onBehalf = true` and `performedBy = guardianId`.        |

> There is no endpoint or screen to create a child from PDI. Child accounts are created by the connector only.

---

### 3. Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Pending: Connector registers child (202)
    Pending --> Validated: Guardian confirms via email link
    Validated --> Consenting: Guardian selects child in consent screen
    Consenting --> Validated: Consent recorded on the child
    Validated --> ManagedWithPassword: "Invite to complete account" (optional)
```

1. **Pending** — the connector registers the child with a `legalGuardian`. The consent manager returns `202` and emails the guardian a validation link.
2. **Validated** — the guardian confirms; the child appears in the guardian's _Associated users_ list with the **Managed account** badge.
3. **Consenting** — the guardian can now consent on behalf of the child.
4. _(Optional)_ **Invite to complete account** lets an existing managed child set their own password. It does not create a child.

---

### 4. Child registration (from the connector)

The connector calls the consent manager to register the child and attach the guardian.

**Payload received from the connector:**

```json
{
  "firstName": "Test",
  "lastName": "Child1",
  "internalID": "child-001",
  "legalGuardian": "<guardian PDI user id or guardian email>"
}
```

| Field           | Required | Description                                          |
| :-------------- | :------- | :--------------------------------------------------- |
| `firstName`     | yes      | Child's first name.                                  |
| `lastName`      | yes      | Child's last name. Displayed as "First Last" in PDI. |
| `internalID`    | yes      | Child identifier in the participant's own system.    |
| `legalGuardian` | yes      | Guardian identifier: PDI user id **or** email.       |

**Behaviour:**

- The child account is created as a managed account (no password).
- A **pending** guardianship is created between the child and the guardian.
- A validation email containing a tokenized link is sent to the guardian.
- **Response:** `202 Accepted` (pending).
  > **TODO:** document the exact consent-manager route called by the connector and the error responses (unknown guardian, duplicate `internalID`, etc.).

---

### 5. Guardianship validation

**Link sent by email:** `<PDI_URL>/validate-guardianship?token=<TOKEN>`

| Case                   | PDI behaviour                                                                                                                    |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| Guardian not logged in | Shows _"You must be logged in to validate the guardianship."_ with a **Log in** link. The guardian logs in and reopens the link. |
| Guardian logged in     | Shows **Validate guardianship** with a **Confirm** button.                                                                       |
| After **Confirm**      | Notification _"Guardianship validated. The child now appears in your list."_ and redirect to `/private/children`.                |

The token must be validated against the **logged-in guardian**: only the guardian targeted by the pending guardianship can confirm it.

> **TODO:** document the validation route, token expiry and behaviour on an expired/already-used token.

---

### 6. Consent on behalf of a child

#### Endpoint

```http
POST /guardianship/children/:childId/consents
```

Called by PDI when the guardian selects a child in the **Give this consent for** selector and clicks **Accept**.

#### Rules

- The caller must be authenticated as a guardian.
- A **validated** guardianship must exist between the caller and `:childId`.
- The consent is created with `user = childId`, not the guardian.
- The consent event records the guardian as performer (see [section 7](#7-consent-record-structure)).

#### Comparison with personal consent

| Selector value       | Endpoint used                                   | Consent owner (`user`) | `onBehalf`       |
| :------------------- | :---------------------------------------------- | :--------------------- | :--------------- |
| **Myself** (default) | Standard personal consent endpoint              | Guardian               | `false` / absent |
| **A child**          | `POST /guardianship/children/:childId/consents` | Child                  | `true`           |

> **TODO:** document the request body, response, and error cases (no guardianship, pending guardianship, unknown child).

---

### 7. Consent record structure

A consent given on behalf of a child must satisfy:

| Field                  | Value        |
| :--------------------- | :----------- |
| `user`                 | `childId`    |
| `event[0].onBehalf`    | `true`       |
| `event[0].performedBy` | `guardianId` |

Illustrative excerpt:

```json
{
  "user": "<childId>",
  "event": [
    {
      "onBehalf": true,
      "performedBy": "<guardianId>"
    }
  ]
}
```

This guarantees that:

- the consent appears in the child's consent list;
- the consent does **not** appear in the guardian's personal consent list;
- the audit trail shows which guardian acted for the child.

---

### 8. PDI integration

#### Pages

| Page                  | URL                              | Purpose                                                                                                                                         |
| :-------------------- | :------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| Associated users      | `/private/children`              | List of the guardian's children (cards with **Managed account** badge). States that new child accounts are created via the dataspace connector. |
| Child consents        | `/private/children/:childId`     | **Consents of {child name}**, reached via **Manage consents** on a child card.                                                                  |
| My consents           | `/private/home`                  | Guardian's own consents only.                                                                                                                   |
| Validate guardianship | `/validate-guardianship?token=…` | Guardian confirms a pending guardianship.                                                                                                       |

#### "Give this consent for" selector

- Displayed in the consent window, just above the action buttons, with the description _"Choose whether you consent for yourself or on behalf of one of your children."_
- Only shown if the guardian has **at least one validated child**.
- Default value: **Myself**.
- Options: **Myself** + each child displayed as "First Last".
- **Hidden** on the per-child page (`/private/children/:childId`) and in edit mode: it is meant for the embedded/personal consent flow (the one used by the VisionsTrust Tech Space consent iframe).

---

### 9. Testing and verification

#### Functional test

1. Register a child via the connector with a known guardian → expect `202`.
2. Confirm the guardianship from the emailed link → child visible in `/private/children`.
3. From the VisionsTrust Tech Space consent iframe, log in as the guardian, select the child, accept.
4. Open **Associated users** → child card → **Manage consents**.
   - ✅ The consent is listed under the child.
5. Open **My consents**.
   - ✅ The consent is **not** listed for the guardian.

#### Non-regression

Repeat step 3 with **Myself** selected:

- ✅ The consent is recorded on the guardian (normal personal consent) and appears in **My consents**.

#### Database check

- ✅ `user = childId`
- ✅ `event[0].onBehalf = true`
- ✅ `event[0].performedBy = guardianId`

---

### 10. Troubleshooting

| Symptom                                                 | Likely cause                                                                                                        |
| :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------ |
| Selector **Give this consent for** not shown            | Guardian has no validated child (child not created, or guardianship still pending).                                 |
| Selector not shown on `/private/children/:childId`      | Expected: hidden on the per-child page and in edit mode.                                                            |
| Child missing from _Associated users_                   | Guardianship not confirmed yet, or `legalGuardian` did not match the guardian's id/email.                           |
| _"You must be logged in to validate the guardianship."_ | Log in as the guardian, then reopen the email link.                                                                 |
| Consent appears under the guardian instead of the child | **Myself** was selected, or the standard endpoint was called instead of `/guardianship/children/:childId/consents`. |
| Looking for "Add child" in PDI                          | By design, children are created only through the connector.                                                         |

## Contributing

We welcome contributions to the Prometheus-X Consent Manager. If you encounter a bug or wish to propose a new feature, kindly open an issue in the GitHub repository. For code contributions, fork the repository, create a new branch, make your changes, and submit a pull request.

## License

The Prometheus-X Consent Manager is open-source software licensed under the [MIT License](LICENSE).
