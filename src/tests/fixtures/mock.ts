import nock from "nock";

const crypto = require("crypto");

const baseURL = "http://localhost:8888";
const testUrl = "https://api.test.com";
const pdiURL = "http://localhost:5173";
export const setupnockMocks = (providerBase64: string) => {
  // Mocking provider service offerings
  nock(`${testUrl}/v1`)
    .persist()
    .get("/catalog/serviceofferings/65e04da4b37bfc192ddcbdd1")
    .reply(200, {
      "@context": "https://host.docker.internal:4040/v1/serviceoffering",
      "@type": "ServiceOffering",
      _id: "65e04da4b37bfc192ddcbdd1",
      name: "test no user interacton",
      providedBy: "656dfb3e282d47cfa6b66b2b",
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
        "https://api.com/v1/catalog/dataresources/65e71e4174f9e9026bd5dc41",
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

  // Mocking consumer service offerings
  nock(`${testUrl}/v1`)
    .get("/catalog/serviceofferings/65e04da4b37bfc192ddcbdd0")
    .reply(200, {
      "@context": "https://host.docker.internal:4040/v1/serviceoffering",
      "@type": "ServiceOffering",
      _id: "65e04da4b37bfc192ddcbdd0",
      name: "CONSUMER PAYLOAD BIL",
      providedBy: "656dfb3e282d47cfa6b66c4a",
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
  // Mocking consumer service offerings
  nock(`${testUrl}/v1`)
    .get("/catalog/serviceofferings/672c8e77870a096712ca7676")
    .reply(200, {
      "@context": "https://host.docker.internal:4040/v1/serviceoffering",
      "@type": "Infrastructure Service",
      _id: "65e04da4b37bfc192ddcbdd0",
      name: "CONSUMER PAYLOAD BIL",
      providedBy: "656dfb3e282d47cfa6b66c4a",
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

  // Mocking bilateral contracts
  nock(baseURL)
    .get(`/bilaterals/for/${providerBase64}?hasSigned=true`)
    .reply(200, { contracts: [] });

  // Mocking ecosyetem contracts signed
  nock(baseURL)
    .get(`/contracts/for/${providerBase64}?hasSigned=true`)
    .reply(200, {
      contracts: [
        {
          _id: "65e5d715c99e484e4685a964",
          ecosystem: `${testUrl}/v1/catalog/ecosystems/65e5d7152e3f7f210edcaa77`,
          orchestrator: `${testUrl}/v1/catalog/participants/656dfb3e282d47cfa6b66b2b`,
          rolesAndObligations: [],
          status: "pending",
          serviceOfferings: [
            {
              participant: `${testUrl}/v1/catalog/participants/656dfb3e282d47cfa6b66c4a`,
              serviceOffering: `${testUrl}/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd0`,
              policies: [
                {
                  description: "CAN use data without any restrictions",
                  permission: [
                    {
                      action: "use",
                      target: `${testUrl}/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd0`,
                      constraint: [],
                    },
                  ],
                  prohibition: [],
                },
              ],
              _id: "65e5d73dc99e484e4685a970",
            },
            {
              participant: `${testUrl}/v1/catalog/participants/656dfb3e282d47cfa6b66b2b`,
              serviceOffering: `${testUrl}/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd1`,
              policies: [
                {
                  description: "CAN use data without any restrictions",
                  permission: [
                    {
                      action: "use",
                      target: `${testUrl}/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd1`,
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
              participant: `${testUrl}/v1/catalog/participants/656dfb3e282d47cfa6b66b2b`,
              role: "orchestrator",
              signature: "hasSigned",
              date: "2024-03-04T14:13:47.598Z",
            },
            {
              participant: `${testUrl}/v1/catalog/participants/656dfb3e282d47cfa6b66c4a`,
              role: "participant",
              signature: "hasSigned",
              date: "2024-03-04T14:14:21.410Z",
            },
          ],
          revokedMembers: [],
          createdAt: "2024-03-04T14:13:41.616Z",
          updatedAt: "2024-03-04T14:14:21.409Z",
          infrastructureServices: [
            {
              participant: "66d18a1dee71f9f096baec07",
              infrastructureService: "672c8e77870a096712ca7676",
              status: "Signed",
            },
          ],
          dataProcessings: [
            {
              catalogId: "670e8eb6b439a2379f290fc1",
              infrastructureServices: [
                {
                  participant: `${testUrl}/v1/catalog/participants/656dfb3e282d47cfa6b66b2b`,
                  serviceOffering: `${testUrl}/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd0`,
                },
                {
                  participant: `${testUrl}/v1/catalog/participants/66d18a1dee71f9f096baec07`,
                  serviceOffering: `${testUrl}/v1/catalog/serviceofferings/672c8e77870a096712ca7676`,
                },
                {
                  participant: `${testUrl}/v1/catalog/participants/656dfb3e282d47cfa6b66c4a`,
                  serviceOffering: `${testUrl}/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd1`,
                },
              ],
              status: "active",
              _id: { $oid: "674981ed70a7d9606bb2ed42" },
            },
          ],
          __v: 1,
        },
      ],
    });

  // //Mocking ecosystem
  nock(`${testUrl}/v1`)
    .get("/catalog/ecosystems/65e5d7152e3f7f210edcaa77")
    .reply(200, {
      "@context": "https://localhost:4040/v1/ecosystem",
      "@type": "Ecosystem",
      _id: "65e5d7152e3f7f210edcaa77",
      administrator: "6564abb5d853e8e05b132057",
      orchestrator: "656dfb3e282d47cfa6b66b2b",
      name: "TEST ecosystem",
      description: "test description",
      country_or_region: "",
      target_audience: "",
      main_functionalities_needed: [],
      logo: "ecosystem_default.jpg",
      useCases: ["6477027612bef26b5efbc6b3"],
      participants: [
        {
          organization: "6564abb5d853e8e05b132057",
          participant: "656dfb3e282d47cfa6b66b2b",
          roles: ["Orchestrator"],
          _id: "6642221be0b0c017f667fb89",
          offerings: [],
        },
        {
          organization: "6564abb5d853e8e05b132056",
          participant: "656dfb3e282d47cfa6b66c4a",
          roles: ["Data Provider"],
          _id: "66422304e0b0c017f667fba1",
          offerings: [],
        },
      ],
      searchedDatatypes: [],
      searchedServices: [],
      provides: ["users", "offering data", "offering service"],
      contract: "65e5d715c99e484e4685a964",
      location: "",
      businessLogic: {
        businessModel: [],
        roles: [],
      },
      schema_version: "1.1.0",
      joinRequests: [],
      invitations: [],
      rolesAndObligations: [],
      buildingBlocks: [],
      createdAt: "2024-06-27T10:06:13.496Z",
      updatedAt: "2024-06-27T10:06:14.076Z",
      __v: 0,
    });

  // Mocking ecosystem contract
  nock(baseURL)
    .get(`/contracts/65e5d715c99e484e4685a964`)
    .reply(200, {
      _id: "65e5d715c99e484e4685a964",
      ecosystem: `${testUrl}/v1/catalog/ecosystems/65e5d7152e3f7f210edcaa77`,
      orchestrator: `${testUrl}/v1/catalog/participants/656dfb3e282d47cfa6b66b2b`,
      rolesAndObligations: [],
      status: "pending",
      serviceOfferings: [
        {
          participant: `${testUrl}/v1/catalog/participants/656dfb3e282d47cfa6b66c4a`,
          serviceOffering: `${testUrl}/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd0`,
          policies: [
            {
              description: "CAN use data without any restrictions",
              permission: [
                {
                  action: "use",
                  target: `${testUrl}/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd0`,
                  constraint: [],
                },
              ],
              prohibition: [],
            },
          ],
          _id: "65e5d73dc99e484e4685a970",
        },
        {
          participant: `${testUrl}/v1/catalog/participants/656dfb3e282d47cfa6b66b2b`,
          serviceOffering: `${testUrl}/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd1`,
          policies: [
            {
              description: "CAN use data without any restrictions",
              permission: [
                {
                  action: "use",
                  target: `${testUrl}/v1/catalog/serviceofferings/65e04da4b37bfc192ddcbdd1`,
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
          participant: `${testUrl}/v1/catalog/participants/656dfb3e282d47cfa6b66b2b`,
          role: "orchestrator",
          signature: "hasSigned",
          date: "2024-03-04T14:13:47.598Z",
        },
        {
          participant: `${testUrl}/v1/catalog/participants/656dfb3e282d47cfa6b66c4a`,
          role: "participant",
          signature: "hasSigned",
          date: "2024-03-04T14:14:21.410Z",
        },
      ],
      revokedMembers: [],
      createdAt: "2024-03-04T14:13:41.616Z",
      updatedAt: "2024-03-04T14:14:21.409Z",
      __v: 1,
    });

  // Mocking ecosystem contract not found
  nock(baseURL)
    .get(`/contracts/65d624e80e4afe01b8906e14`)
    .reply(404, { error: "Contract not found" });

  //mocking consumer in catalog
  nock(`${testUrl}`)
    .persist()
    .get("/v1/catalog/participants/656dfb3e282d47cfa6b66c4a")
    .reply(200, {
      "@context": `${testUrl}/v1/participant`,
      "@type": "Participant",
      _id: "656dfb3e282d47cfa6b66c4a",
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

  // Mocking provider in catalog
  nock(`${testUrl}`)
    .persist()
    .get(`/v1/catalog/participants/656dfb3e282d47cfa6b66b2b`)
    .reply(200, {
      "@context": `${testUrl}/v1/participant`,
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

  //mocking consumer2 in catalog
  nock(`${testUrl}`)
    .get(`/v1/catalog/participants/656dfb3e282d47cfa6b66b22`)
    .reply(200, {
      "@context": `${testUrl}/v1/participant`,
      "@type": "Participant",
      _id: "656dfb3e282d47cfa6b66b22",
      did: null,
      legalName: "consumer2",
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
      associatedOrganisation: "6564abb5d853e8e05b132066",
      schema_version: "1",
      createdAt: "2023-11-27T14:46:13.705Z",
      updatedAt: "2024-03-06T10:47:26.913Z",
      __v: 0,
      dataspaceConnectorAppKey:
        "60302602dd21b879636317d54886f0181dd409f7f962d2a40a282f8cd099dad0837c86ddaa78a82c650a6d18347767a4c8f2532568ead3d267bf78e262a89555",
      dataspaceEndpoint: "",
    });
  //mocking Infra provider in catalog
  nock(`${testUrl}`)
    .get(`/v1/catalog/participants/66d18a1dee71f9f096baec07`)
    .reply(200, {
      "@context": `${testUrl}/v1/participant`,
      "@type": "Participant",
      _id: "66d18a1dee71f9f096baec07",
      did: null,
      legalName: "infraProvider",
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
      associatedOrganisation: "66d18a1dee71f9f096baec06",
      schema_version: "1",
      createdAt: "2023-11-27T14:46:13.705Z",
      updatedAt: "2024-03-06T10:47:26.913Z",
      __v: 0,
      dataspaceConnectorAppKey:
        "60302602dd21b879636317d54886f0181dd409f7f962d2a40a282f8cd099dad0837c86ddaa78a82c650a6d18347767a4c8f2532568ead3d267bf78e262a89555",
      dataspaceEndpoint: "",
    });

  // Mocking software resources
  nock("https://api.com")
    .get(`/v1/catalog/softwareresources/65e737ed74f9e9026bd5edbb`)
    .reply(200, {
      "@context": "https://localhost:4040/v1/softwareresource",
      "@type": "SoftwareResource",
      _id: "65e737ed74f9e9026bd5edbb",
      providedBy: "656dfb3e282d47cfa6b66c4a",
      name: "Test software resources 1",
      description: "software resources Test description 1",
      aggregationOf: [],
      copyrightOwnedBy: ["Your Company"],
      license: [],
      policy: [],
      category: "5f8ed518651f1648e0d8162d",
      locationAddress: [],
      users_clients: 22,
      demo_link: "",
      relevant_project_link: "",
      schema_version: "1.1.0",
      usePII: false,
      isAPI: false,
      b2cDescription: "",
      jurisdiction: "",
      retention_period: "",
      recipient_third_parties: [],
      createdAt: "2024-06-17T08:00:54.470Z",
      updatedAt: "2024-06-17T08:00:54.470Z",
      __v: 0,
    });

  // Mocking data resources
  nock("https://api.com")
    .get(`/v1/catalog/dataresources/65e71e4174f9e9026bd5dc41`)
    .reply(200, {
      "@context": "https://localhost:4040/v1/dataresource",
      "@type": "DataResource",
      _id: "65e71e4174f9e9026bd5dc41",
      aggregationOf: [],
      name: "Test data resources 1",
      description: "data resources Test description 1",
      copyrightOwnedBy: [],
      license: [],
      policy: [],
      providedBy: "656dfb3e282d47cfa6b66b2b",
      exposedThrough: [],
      obsoleteDateTime: "",
      expirationDateTime: "",
      containsPII: true,
      anonymized_extract: "{skills: 'abcd'}",
      archived: false,
      attributes: ["skills"],
      category: "5f8ed518651f1648e0d8162d",
      isPayloadForAPI: true,
      country_or_region: "BR-BRU",
      entries: 100,
      subCategories: [],
      schema_version: "1",
      b2cDescription: "",
      createdAt: "2024-06-17T08:00:52.365Z",
      updatedAt: "2024-06-17T08:00:52.365Z",
      __v: 0,
    });

  //Mocking pdi endpoint
  // nock("${testUrl}/v1").get(`/pdi/iframe`).reply(200);
};
