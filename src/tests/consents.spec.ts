import { expect } from "chai";
import supertest from "supertest";
import { Application } from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import { startServer } from "../server";
import { IncomingMessage, ServerResponse } from "http";
import * as http from "http";
import MockAdapter from "axios-mock-adapter";
import axios from "axios";
import crypto from "crypto";

let serverInstance: {
  app: Application;
  server: http.Server<typeof IncomingMessage, typeof ServerResponse>;
};
const mockAxios = new MockAdapter(axios);
let userId: string;
let providerId: string;
let consumerId: string;
let providerUserIdentifier: string;
let consumerUserIdentifier: string;
let providerJWT: string;
let consumerJWT: string;

before(async () => {
  serverInstance = startServer(9090);
  // Create Provider
  const providerData = {
    legalName: "provider",
    identifier: "656dfb3e282d47cfa6b66b2b",
    did: "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2b",
    selfDescriptionURL:
      "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2b",
    email: "provider@email.com",
    endpoints: {
      dataExport: "https://test.consent/data/export",
      dataImport: "https://test.consent/data/import",
      consentImport: "https://test.consent/consent/import",
      consentExport: "https://test.consent/consent/export",
    },
    clientID:
      "RiubBgGOCntQQkUZfwxVJMFmvDOjPHucHF2CZpWnwxGlFLDqyjgFZYelvWb3X1piXFyr45dONURbITiSupPHvsJOxggqCp7RHqJ7",
    clientSecret:
      "sAK8rnv4StsYnvLViZJZKOQLrwrIdqx5JQVE4GijO5dq9Ppb5oGJcOLmvPddYOKjNBEeFfORrnip36buMfvpbmGotiZC7xLnLgxV",
  };
  const providerResponse = await supertest(serverInstance.app)
    .post(`/v1/participants/`)
    .send(providerData);

  providerId = providerResponse.body._id;

  const providerAuthResponse = await supertest(serverInstance.app)
    .post(`/v1/participants/login`)
    .send({
      clientID:
        "RiubBgGOCntQQkUZfwxVJMFmvDOjPHucHF2CZpWnwxGlFLDqyjgFZYelvWb3X1piXFyr45dONURbITiSupPHvsJOxggqCp7RHqJ7",
      clientSecret:
        "sAK8rnv4StsYnvLViZJZKOQLrwrIdqx5JQVE4GijO5dq9Ppb5oGJcOLmvPddYOKjNBEeFfORrnip36buMfvpbmGotiZC7xLnLgxV",
    });

  providerJWT = `Bearer ${providerAuthResponse.body.jwt}`;

  // Create Consumer

  const consumerData = {
    legalName: "consumer",
    identifier: "656dfb3e282d47cfa6b66b2a",
    did: "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2a",
    selfDescriptionURL:
      "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2a",
    email: "consumer@email.com",
    endpoints: {
      dataExport: "https://test.consent/data/export",
      dataImport: "https://test.consent/data/import",
      consentImport: "https://test.consent/consent/import",
      consentExport: "https://test.consent/consent/export",
    },
    clientID:
      "BgH8XG6YFiTxlVM5xsWtKXRBuNQviwJWFkVuU4CtOPZSNS0yckvqcdeEsTNW7UkjBVQas5NQVZSmxtj7jchD8P7slhLwj6wOrLU2",
    clientSecret:
      "POG3X0NqdymBYBxuxxz4UMmmtPnYtNXBtWq4RmTic4br6Srt0DGeruhEfLIO9EeOxXpoqsb3uDW2pdx2uFqnLUbjrlONzqquxoq4",
  };
  const consumerResponse = await supertest(serverInstance.app)
    .post(`/v1/participants/`)
    .send(consumerData);

  consumerId = consumerResponse.body._id;

  const consumerAuthResponse = await supertest(serverInstance.app)
    .post(`/v1/participants/login`)
    .send({
      clientID:
        "BgH8XG6YFiTxlVM5xsWtKXRBuNQviwJWFkVuU4CtOPZSNS0yckvqcdeEsTNW7UkjBVQas5NQVZSmxtj7jchD8P7slhLwj6wOrLU2",
      clientSecret:
        "POG3X0NqdymBYBxuxxz4UMmmtPnYtNXBtWq4RmTic4br6Srt0DGeruhEfLIO9EeOxXpoqsb3uDW2pdx2uFqnLUbjrlONzqquxoq4",
    });

  consumerJWT = `Bearer ${consumerAuthResponse.body.jwt}`;

  // Create User
  const userResponse = await supertest(serverInstance.app)
    .post(`/v1/users/signup`)
    .send({
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      password: "password",
    });
  userId = userResponse.body.user._id;

  //Create UserIdentifier Provider
  const providerUserIdentifierResponse = await supertest(serverInstance.app)
    .post(`/v1/users/register`)
    .set("Authorization", providerJWT)
    .send({
      email: "john@example.com",
      identifier: "660181e9b0eb2a45540546ba",
    });

  providerUserIdentifier = providerUserIdentifierResponse.body._id;

  //Create UserIdentifier Consumer
  const consumerUserIdentifierResponse = await supertest(serverInstance.app)
    .post(`/v1/users/register`)
    .set("Authorization", consumerJWT)
    .send({
      email: "john@example.com",
      identifier: "660181e445ed86a1a9de8aac",
    });

  consumerUserIdentifier = consumerUserIdentifierResponse.body._id;
});

after(async () => {
  serverInstance.server.close();
});

describe("Consent Controller Tests", () => {
  let privacyNoticeId: string;
  let consentId: string;
  let consent: any;
  let token: string;

  describe("getUserConsents", () => {
    it("should get user consents", async () => {
      const response = await supertest(serverInstance.app)
        .get(`/v1/consents/me`)
        .set("x-user-key", providerUserIdentifier);
      expect(response.status).to.be.equal(200);
      expect(response.body).to.have.property("consents");
      // Add more assertions as needed
    });

    it("should handle errors gracefully", async () => {
      const response = await supertest(serverInstance.app).get(
        `/v1/consents/me`
      );
      expect(response.status).to.be.equal(401);
      expect(response.body).to.have.property(
        "message",
        "Authorization header missing or invalid"
      );
    });
  });

  describe("getAvailableExchanges", () => {
    it("should get available exchanges", async () => {
      mockAxios
        .onGet(
          `${process.env.CONTRACT_SERVICE_BASE_URL}/bilaterals/for/aHR0cHM6Ly9hcGkudGVzdC5jb20vdjEvY2F0YWxvZy9wYXJ0aWNpcGFudHMvNjU2ZGZiM2UyODJkNDdjZmE2YjY2YjJi?hasSigned=true`
        )
        .reply(200, { contracts: [] });
      mockAxios
        .onGet(
          `${process.env.CONTRACT_SERVICE_BASE_URL}/contracts/for/aHR0cHM6Ly9hcGkudGVzdC5jb20vdjEvY2F0YWxvZy9wYXJ0aWNpcGFudHMvNjU2ZGZiM2UyODJkNDdjZmE2YjY2YjJi?hasSigned=true`
        )
        .reply(200, {
          contracts: [
            {
              _id: "65e5d715c99e484e4685a964",
              ecosystem:
                "https://api.test.com/v1/catalog/ecosystems/65e5d7152e3f7f210edcaa77",
              orchestrator:
                "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2b",
              rolesAndObligations: [],
              status: "pending",
              serviceOfferings: [
                {
                  participant:
                    "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2a",
                  serviceOffering:
                    "https://api.test.com/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd0",
                  policies: [
                    {
                      description: "CAN use data without any restrictions",
                      permission: [
                        {
                          action: "use",
                          target:
                            "https://api.test.com/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd0",
                          constraint: [],
                        },
                      ],
                      prohibition: [],
                    },
                  ],
                  _id: "65e5d73dc99e484e4685a970",
                },
                {
                  participant:
                    "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2b",
                  serviceOffering:
                    "https://api.test.com/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd1",
                  policies: [
                    {
                      description: "CAN use data without any restrictions",
                      permission: [
                        {
                          action: "use",
                          target:
                            "https://api.test.com/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd1",
                          constraint: [],
                        },
                      ],
                      prohibition: [],
                    },
                  ],
                  _id: "65e5d73dc99e484e4685a971",
                },
              ],
              purpose: [],
              members: [
                {
                  participant:
                    "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2b",
                  role: "orchestrator",
                  signature: "hasSigned",
                  date: "2024-03-04T14:13:47.598Z",
                },
                {
                  participant:
                    "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2a",
                  role: "participant",
                  signature: "hasSigned",
                  date: "2024-03-04T14:14:21.410Z",
                },
              ],
              revokedMembers: [],
              createdAt: "2024-03-04T14:13:41.616Z",
              updatedAt: "2024-03-04T14:14:21.409Z",
              __v: 1,
            },
          ],
        });
      const response = await supertest(serverInstance.app)
        .get(`/v1/consents/exchanges/provider`)
        .set("Authorization", providerJWT);
      expect(response.status).to.be.equal(200);
      expect(response.body).to.have.property("participant");
      expect(response.body).to.have.property("exchanges");
      expect(response.body.participant).to.have.property("selfDescription");
      expect(response.body.participant).to.have.property(
        "base64SelfDescription"
      );
      expect(response.body.exchanges).to.be.not.empty;
    });
  });

  describe("getPrivacyNotices", () => {
    it("should get the privacy notices", async () => {
      //data resources
      mockAxios
        .onGet(
          "https://api.test.com/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd1"
        )
        .reply(200, {
          "@context": "https://host.docker.internal:4040/v1/serviceoffering",
          "@type": "ServiceOffering",
          _id: "660432088020cd0ef5427e1b",
          name: "test no user interacton",
          providedBy: "6564abb5d853e8e05b132057",
          aggregationOf: [
            "https://host.docker.internal:4040/v1/catalog/dataresources/65e71e4174f9e9026bd5dc41",
          ],
          dependsOn: [],
          policy: [
            {
              "@context": {
                xsd: "https://www.w3.org/2001/XMLSchema#",
                description: {
                  "@id": "https://schema.org/description",
                  "@container": "@language",
                },
              },
              "@id":
                "https://localhost:3000/static/references/rules/rule-access-4.json",
              title: {
                "@type": "xsd/string",
                "@value": "Count",
              },
              uid: "rule-access-4",
              name: "Count",
              description: [
                {
                  "@value": "MUST not use data for more than n times",
                  "@language": "en",
                },
              ],
              policy: {
                permission: [
                  {
                    action: "use",
                    target: "@{target}",
                    constraint: [
                      {
                        leftOperand: "count",
                        operator: "lt",
                        rightOperand: "@{value}",
                      },
                    ],
                  },
                ],
              },
              requestedFields: ["target", "value"],
            },
          ],
          termsAndConditions: "",
          dataProtectionRegime: [],
          dataAccountExport: [],
          location: "World",
          description: "des",
          keywords: [],
          dataResources: [
            "https://host.docker.internal:4040/v1/catalog/dataresources/65e71e4174f9e9026bd5dc41",
          ],
          softwareResources: [],
          archived: false,
          visible: true,
          pricing: "180",
          pricingModel: [
            "https://localhost:3000/static/references/pricing-model/dataBased.json",
          ],
          businessModel: [
            "https://localhost:3000/static/references/business-model/subscription.json",
          ],
          maximumConsumption: "",
          maximumPerformance: "",
          pricingDescription: "dfezd",
          userInteraction: true,
          compliantServiceOfferingVC: "",
          serviceOfferingVC: "",
          schema_version: "1.1.0",
          createdAt: "2024-03-27T14:49:44.506Z",
          updatedAt: "2024-03-27T14:50:02.746Z",
          __v: 0,
        });
      mockAxios
        .onGet(
          "https://api.test.com/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd0"
        )
        .reply(200, {
          "@context": "https://host.docker.internal:4040/v1/serviceoffering",
          "@type": "ServiceOffering",
          _id: "65e7380074f9e9026bd5edc8",
          name: "CONSUMER PAYLOAD BIL",
          providedBy: "6564aaebd853e8e05b1317c1",
          aggregationOf: [
            "https://api.com/v1/catalog/softwareresources/65e737ed74f9e9026bd5edbb",
          ],
          dependsOn: [],
          policy: [
            {
              "@context": {
                xsd: "https://www.w3.org/2001/XMLSchema#",
                description: {
                  "@id": "https://schema.org/description",
                  "@container": "@language",
                },
              },
              "@id":
                "https://localhost:3000/static/references/rules/rule-access-4.json",
              title: {
                "@type": "xsd/string",
                "@value": "Count",
              },
              uid: "rule-access-4",
              name: "Count",
              description: [
                {
                  "@value": "MUST not use data for more than n times",
                  "@language": "en",
                },
              ],
              policy: {
                permission: [
                  {
                    action: "use",
                    target: "@{target}",
                    constraint: [
                      {
                        leftOperand: "count",
                        operator: "lt",
                        rightOperand: "@{value}",
                      },
                    ],
                  },
                ],
              },
              requestedFields: ["target", "value"],
            },
          ],
          termsAndConditions: "",
          dataProtectionRegime: [],
          dataAccountExport: [],
          location: "World",
          description: "desc",
          keywords: [],
          dataResources: [],
          softwareResources: [
            "https://api.com/v1/catalog/softwareresources/65e737ed74f9e9026bd5edbb",
          ],
          archived: false,
          visible: true,
          pricing: "150",
          pricingModel: [
            "https://localhost:3000/static/references/pricing-model/valueBased.json",
          ],
          businessModel: [
            "https://registry.visionstrust.com/static/references/business-model/freemium.json",
            "https://localhost:3000/static/references/business-model/subscription.json",
          ],
          maximumConsumption: "",
          maximumPerformance: "",
          pricingDescription: "desc",
          compliantServiceOfferingVC: "",
          serviceOfferingVC: "",
          schema_version: "1.1.0",
          createdAt: "2024-03-05T15:19:28.562Z",
          updatedAt: "2024-03-29T09:08:33.183Z",
          __v: 0,
          userInteraction: true,
        });
      mockAxios
        .onGet(
          `${process.env.CONTRACT_SERVICE_BASE_URL}/bilaterals/for/aHR0cHM6Ly9hcGkudGVzdC5jb20vdjEvY2F0YWxvZy9wYXJ0aWNpcGFudHMvNjU2ZGZiM2UyODJkNDdjZmE2YjY2YjJh?hasSigned=true`
        )
        .reply(200, { contracts: [] });
      mockAxios
        .onGet(
          `${process.env.CONTRACT_SERVICE_BASE_URL}/contracts/for/aHR0cHM6Ly9hcGkudGVzdC5jb20vdjEvY2F0YWxvZy9wYXJ0aWNpcGFudHMvNjU2ZGZiM2UyODJkNDdjZmE2YjY2YjJh?hasSigned=true`
        )
        .reply(200, {
          contracts: [
            {
              _id: "65e5d715c99e484e4685a964",
              ecosystem:
                "https://api.test.com/v1/catalog/ecosystems/65e5d7152e3f7f210edcaa77",
              orchestrator:
                "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2b",
              rolesAndObligations: [],
              status: "pending",
              serviceOfferings: [
                {
                  participant:
                    "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2a",
                  serviceOffering:
                    "https://api.test.com/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd0",
                  policies: [
                    {
                      description: "CAN use data without any restrictions",
                      permission: [
                        {
                          action: "use",
                          target:
                            "https://api.test.com/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd0",
                          constraint: [],
                        },
                      ],
                      prohibition: [],
                    },
                  ],
                  _id: "65e5d73dc99e484e4685a970",
                },
                {
                  participant:
                    "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2b",
                  serviceOffering:
                    "https://api.test.com/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd1",
                  policies: [
                    {
                      description: "CAN use data without any restrictions",
                      permission: [
                        {
                          action: "use",
                          target:
                            "https://api.test.com/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd1",
                          constraint: [],
                        },
                      ],
                      prohibition: [],
                    },
                  ],
                  _id: "65e5d73dc99e484e4685a971",
                },
              ],
              purpose: [],
              members: [
                {
                  participant:
                    "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2b",
                  role: "orchestrator",
                  signature: "hasSigned",
                  date: "2024-03-04T14:13:47.598Z",
                },
                {
                  participant:
                    "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2a",
                  role: "participant",
                  signature: "hasSigned",
                  date: "2024-03-04T14:14:21.410Z",
                },
              ],
              revokedMembers: [],
              createdAt: "2024-03-04T14:13:41.616Z",
              updatedAt: "2024-03-04T14:14:21.409Z",
              __v: 1,
            },
          ],
        });
      mockAxios
        .onGet(
          "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2b"
        )
        .reply(200, {
          "@context": "https://api.test.com/v1/participant",
          "@type": "Participant",
          _id: "656dfb3e282d47cfa6b66b2b",
          did: null,
          legalName: "provider",
          legalPerson: {
            registrationNumber: "",
            headquartersAddress: {
              countryCode: "",
            },
            legalAddress: {
              countryCode: "",
            },
            parentOrganization: [],
            subOrganization: [],
          },
          termsAndConditions: "",
          associatedOrganisation: "6564abb5d853e8e05b132057",
          schema_version: "1",
          createdAt: "2023-11-27T14:46:13.705Z",
          updatedAt: "2024-03-06T10:47:26.913Z",
          __v: 0,
          dataspaceConnectorAppKey:
            "60302602dd21b879636317d54886f0181dd409f7f962d2a40a282f8cd099dad0837c86ddaa78a82c650a6d18347767a4c8f2532568ead3d267bf78e262a89444",
          dataspaceEndpoint: "",
        });
      mockAxios
        .onGet(
          "https://api.test.com/v1/catalog/participants/656dfb3e282d47cfa6b66b2a"
        )
        .reply(200, {
          "@context": "https://api.test.com/v1/participant",
          "@type": "Participant",
          _id: "656dfb3e282d47cfa6b66b2a",
          did: null,
          legalName: "provider",
          legalPerson: {
            registrationNumber: "",
            headquartersAddress: {
              countryCode: "",
            },
            legalAddress: {
              countryCode: "",
            },
            parentOrganization: [],
            subOrganization: [],
          },
          termsAndConditions: "",
          associatedOrganisation: "6564abb5d853e8e05b132056",
          schema_version: "1",
          createdAt: "2023-11-27T14:46:13.705Z",
          updatedAt: "2024-03-06T10:47:26.913Z",
          __v: 0,
          dataspaceConnectorAppKey:
            "60302602dd21b879636317d54886f0181dd409f7f962d2a40a282f8cd099dad0837c86ddaa78a82c650a6d18347767a4c8f2532568ead3d267bf78e262a89444",
          dataspaceEndpoint: "",
        });
      mockAxios
        .onGet(
          "https://api.com/v1/catalog/softwareresources/65e737ed74f9e9026bd5edbb"
        )
        .reply(200, {
          "@context": "https://host.docker.internal:4040/v1/softwareresource",
          "@type": "SoftwareResource",
          _id: "65e737ed74f9e9026bd5edbb",
          providedBy: "6564aaebd853e8e05b1317c1",
          name: "CONSUMER PAYLOAD BIL",
          description: "desc",
          aggregationOf: [],
          copyrightOwnedBy: ["6564aaebd853e8e05b1317c1"],
          license: [],
          policy: [
            {
              "@context": {
                xsd: "https://www.w3.org/2001/XMLSchema#",
                description: {
                  "@id": "https://schema.org/description",
                  "@container": "@language",
                },
              },
              "@id":
                "https://localhost:3000/static/references/rules/rule-access-4.json",
              title: {
                "@type": "xsd/string",
                "@value": "Count",
              },
              uid: "rule-access-4",
              name: "Count",
              description: [
                {
                  "@value": "MUST not use data for more than n times",
                  "@language": "en",
                },
              ],
              policy: {
                permission: [
                  {
                    action: "use",
                    target: "@{target}",
                    constraint: [
                      {
                        leftOperand: "count",
                        operator: "lt",
                        rightOperand: "@{value}",
                      },
                    ],
                  },
                ],
              },
              requestedFields: ["target", "value"],
            },
          ],
          category: "5f8d9ea341184f59787e605a",
          locationAddress: [
            {
              countryCode: "World",
              _id: "65e737ed74f9e9026bd5edbc",
            },
          ],
          users_clients: 0,
          demo_link: "",
          relevant_project_link: "",
          schema_version: "1.1.0",
          usePII: false,
          isAPI: true,
          createdAt: "2024-03-05T15:19:09.387Z",
          updatedAt: "2024-03-05T15:19:09.426Z",
          __v: 0,
          representation: {
            _id: "65e737ed74f9e9026bd5edc3",
            resourceID: "65e737ed74f9e9026bd5edbb",
            type: "REST",
            url: "https://host.docker.internal:3332/users",
            method: "none",
            credential: "",
            createdAt: "2024-03-05T15:19:09.429Z",
            updatedAt: "2024-03-05T15:19:09.429Z",
            __v: 0,
          },
        });
      const response = await supertest(serverInstance.app)
        .get(
          `/v1/consents/${userId}/aHR0cHM6Ly9hcGkudGVzdC5jb20vdjEvY2F0YWxvZy9wYXJ0aWNpcGFudHMvNjU2ZGZiM2UyODJkNDdjZmE2YjY2YjJi/aHR0cHM6Ly9hcGkudGVzdC5jb20vdjEvY2F0YWxvZy9wYXJ0aWNpcGFudHMvNjU2ZGZiM2UyODJkNDdjZmE2YjY2YjJh`
        )
        .set("x-user-key", providerUserIdentifier);
      console.log("response", response.body);
      privacyNoticeId = response.body[0]?._id;
      expect(response.status).to.be.equal(200);
      expect(response.body).to.not.be.empty;
      expect(response.body[0]).to.have.property("_id");
    });
  });

  describe("getPrivacyNoticeById", () => {
    it("should get a privacy notice by id", async () => {
      const response = await supertest(serverInstance.app)
        .get(`/v1/consents/privacy-notices/${privacyNoticeId}`)
        .set("x-user-key", providerUserIdentifier);
      expect(response.status).to.be.equal(200);
      expect(response.body).to.not.be.empty;
      expect(response.body).to.have.property("_id");
      expect(response.body).to.have.property("contract");
    });
  });

  describe("giveConsent", () => {
    it("should give consent", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/consents`)
        .set("x-user-key", providerUserIdentifier)
        .send({
          privacyNoticeId: privacyNoticeId,
        });
      consentId = response.body._id;
      expect(response.status).to.be.equal(201);
      expect(response.body).to.not.be.empty;
      expect(response.body).to.have.property("_id");
    });
  });

  describe("triggerDataExchange", () => {
    it("should failed to communicate with endpoint", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/consents/${consentId}/data-exchange`)
        .set("x-user-key", providerUserIdentifier);
      expect(response.status).to.be.equal(424);
      expect(response.body).to.have.property(
        "error",
        "Failed to communicate with the data consumer connector"
      );
    });

    it("should trigger the data exchange", async () => {
      mockAxios
        .onPost("https://test.consent/consent/export")
        .reply(200, { message: "ok" });
      const response = await supertest(serverInstance.app)
        .post(`/v1/consents/${consentId}/data-exchange`)
        .set("x-user-key", providerUserIdentifier);
      expect(response.status).to.be.equal(200);
      expect(response.body).to.have.property(
        "message",
        "successfully sent consent to the provider's consent export endpoint to trigger the data exchange"
      );
    });

    it("should not found the consent", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/consents/6601a6265cbdad603e4e9a8c/data-exchange`)
        .set("x-user-key", providerUserIdentifier)
        .send({
          privacyNoticeId: privacyNoticeId,
        });
      expect(response.status).to.be.equal(404);
      expect(response.body).to.have.property("error", "consent not found");
    });
  });

  describe("attachTokenToConsent", () => {
    it("should attach token to consent", async () => {
      mockAxios
        .onPost("https://test.consent/consent/import")
        .reply(200, { message: "ok" });

      token = crypto.randomUUID();

      const response = await supertest(serverInstance.app)
        .post(`/v1/consents/${consentId}/token`)
        .set("Authorization", providerJWT)
        .send({
          token,
          providerDataExchangeId: "6601aa0cc344579ca63aeb9b",
        });
      expect(response.status).to.be.equal(200);
      expect(response.body).to.have.property(
        "message",
        "successfully forwarded consent to the data consumer"
      );
    });
  });

  describe("verifyToken", () => {
    it("should validate the consent", async () => {
      const response = await supertest(serverInstance.app)
        .post(`/v1/consents/${consentId}/validate`)
        .set("Authorization", providerJWT)
        .send({
          token,
        });
      expect(response.status).to.be.equal(200);
      expect(response.body).to.have.property(
        "message",
        "token matches consent token"
      );
      expect(response.body).to.have.property("verified", true);
    });
  });
});
