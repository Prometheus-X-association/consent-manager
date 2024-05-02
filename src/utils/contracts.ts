import axios from "axios";
import { randomUUID } from "crypto";
import { IConsent, IParticipant, IPrivacyNotice, IUser } from "../types/models";
import Consent from "../models/Consent/Consent.model";
import { NotFoundError } from "../errors/NotFoundError";
import { Purpose } from "../types";
import {
  bilateralContractToPrivacyNotice,
  ecosystemContractToPrivacyNotice,
} from "./privacyNotices";
import {
  contractEcosystemToExchange,
  contractToExchange,
  IExchange,
} from "./exchanges";

type Permission = {
  action: string;
  target: string;
  constraing: any[];
};

type Member = {
  participant: string;
  role: string;
  signature: string;
  date: Date;
};

type Policy = {
  uid: string;
  description: string;
  permission: Permission[];
  prohibition: Permission[];
};

export type BilateralContract = {
  _id: string;
  uid: string;
  dataProvider: string;
  dataConsumer: string;
  serviceOffering: string;
  profile: string;
  policy: Policy[];
  purpose: any[];
  signatures: any[];
  revokedSignatures: any[];
  negotiators: { did: string }[];
  status: "signed" | "revoked" | "under_negotiation" | "pending";
  terminationAndValidity: {
    effectiveDate: Date;
    terminationPeriod: Date;
  };
  limitationOfLiability: Date;
  termsAndConditions: string;
  jsonLD: string;
};

export type EcosystemContract = {
  _id: string;
  uid: string;
  profile: string;
  ecosystem: string;
  orchestrator: string;
  serviceOfferings: {
    participant: string;
    serviceOffering: string;
    policies: Policy[];
  }[];
  rolesAndObligations: {
    role: string;
    policies: Policy[];
  };
  purpose: Purpose[];
  members: Member[];
  revokedMembers: Member[];
  status: "signed" | "revoked" | "pending";
  jsonLD: string;
};

export const getDataFromPoliciesInBilateralContract = async (
  contract: BilateralContract
) => {
  const policiesMatchingServiceOffering = contract.policy.filter(
    (policy) =>
      policy.permission.find((p) =>
        (contract as BilateralContract)?.serviceOffering.includes(p.target)
      ) ||
      policy.prohibition.find((p) =>
        (contract as BilateralContract)?.serviceOffering.includes(p.target)
      )
  );

  const dataFromPermissions = policiesMatchingServiceOffering.map((policy) => {
    const result = policy.permission.map(
      () => (contract as BilateralContract)?.serviceOffering
    );
    return result;
  });

  const dataFromProhibitions = policiesMatchingServiceOffering.map((policy) => {
    const result = policy.prohibition.map(
      () => (contract as BilateralContract)?.serviceOffering
    );
    return result;
  });

  const combinedData = [...dataFromPermissions, ...dataFromProhibitions].reduce(
    (acc, curr) => acc.concat(curr),
    []
  );

  const data = [];
  for (const serviceOffering of combinedData) {
    const serviceOfferingResponse = await axios.get(serviceOffering);

    data.push(
      ...serviceOfferingResponse.data.dataResources.map((resource: string) => {
        return {
          resource,
          serviceOffering,
        };
      })
    );
  }

  return data;
};

export const getPurposeFromBilateralContract = async (
  contract: BilateralContract
) => {
  const data = [];

  for (const bilateralContract of contract.purpose) {
    const purposeResponse = await axios.get(bilateralContract.purpose);
    for (const sr of purposeResponse.data.softwareResources) {
      const softwareResourceResponse = await axios.get(sr);
      data.push({
        purpose: softwareResourceResponse?.data?.name,
        serviceOffering: bilateralContract.purpose,
        resource: sr,
      });
    }
  }
  return data;
};

/**
 * Looks for all of the targets from the service offerings inside of the ecosystem contract
 * If options is specified, will filter only the service offerings based on the specified participants
 *
 * Does not check for if the target is based off a data resource or software resource
 */
export const getDataFromPoliciesInEcosystemContract = async (
  contract: EcosystemContract,
  dataProvider?: string
) => {
  const policies = dataProvider
    ? contract.serviceOfferings
        ?.filter((so) => so.participant === dataProvider)
        .map((so) => so.policies)
    : contract.serviceOfferings?.map((so) => so.policies);

  if (policies.length > 0) {
    const combinedPolicies = [...policies].reduce(
      (acc, curr, currentIndex) => acc.concat(curr),
      []
    );

    const filteredPolicies = combinedPolicies.filter(
      (policy) =>
        policy.permission.find((p) => p.target !== null) ||
        policy.prohibition.find((p) => p.target !== null)
    );

    const dataFromPermissions = filteredPolicies.map((policy) => {
      const result = policy.permission.map((permission) => permission.target);
      return result;
    });

    const dataFromProhibitions = filteredPolicies.map((policy) => {
      const result = policy.prohibition.map(
        (prohibition) => prohibition.target
      );
      return result;
    });

    const combinedData = [
      ...dataFromPermissions,
      ...dataFromProhibitions,
    ].reduce((acc, curr) => acc.concat(curr), []);

    const data = [];
    for (const serviceOffering of combinedData) {
      const serviceOfferingResponse = await axios.get(serviceOffering);

      data.push(
        ...serviceOfferingResponse.data.dataResources.map(
          (resource: string) => {
            return {
              resource,
              serviceOffering,
            };
          }
        )
      );
    }

    return data;
  } else {
    return [];
  }
};

export const getParticipantIdentifier = (participant: IParticipant) => {
  if (!participant) throw new NotFoundError("Participant not found");
  const consentManager = JSON.parse(participant.jsonld)?.consentManager;
  if (!consentManager)
    throw new NotFoundError(
      `Participant ${participant.legalName} has no consentManager information`
    );

  return encodeURIComponent(
    `${consentManager.solution}${consentManager.idInSolution}`
  );
};

export const getPrivacyNoticesFromContractsBetweenParties = async (
  dataProviderID: string,
  dataConsumerID: string
): Promise<IPrivacyNotice[]> => {
  const bilateralContractURL = `${process.env.CONTRACT_SERVICE_BASE_URL}/bilaterals/for/${dataProviderID}?hasSigned=true`;
  const ecosystemContractURL = `${process.env.CONTRACT_SERVICE_BASE_URL}/contracts/for/${dataProviderID}?hasSigned=true`;

  dataConsumerID = Buffer.from(dataConsumerID, "base64").toString();
  dataProviderID = Buffer.from(dataProviderID, "base64").toString();

  const [
    bilateralContractsRes,
    ecosystemContractsRes,
    dataProviderSDResponse,
    dataConsumerSDResponse,
  ] = await Promise.all([
    axios.get(bilateralContractURL, {
      headers: { "Content-Type": "application/json" },
    }),
    axios.get(ecosystemContractURL, {
      headers: { "Content-Type": "application/json" },
    }),
    dataProviderID.startsWith("http")
      ? axios.get(dataProviderID)
      : dataProviderID,
    dataConsumerID.startsWith("http")
      ? axios.get(dataConsumerID)
      : dataConsumerID,
  ]);

  const dataProviderSD =
    typeof dataProviderSDResponse !== "string"
      ? dataProviderSDResponse.data
      : dataProviderID;
  const dataConsumerSD =
    typeof dataConsumerSDResponse !== "string"
      ? dataConsumerSDResponse.data
      : dataConsumerID;

  const bilateralPrivacyNotices = [];
  if (
    bilateralContractsRes?.data.contracts &&
    bilateralContractsRes?.data.contracts.length > 0
  ) {
    for (const contract of bilateralContractsRes.data.contracts) {
      bilateralPrivacyNotices?.push(
        await bilateralContractToPrivacyNotice(contract)
      );
    }
  }
  let ecosystemPrivacyNotices = [];
  if (
    ecosystemContractsRes.data.contracts &&
    ecosystemContractsRes.data.contracts.length > 0
  ) {
    ecosystemPrivacyNotices = await Promise.all(
      ecosystemContractsRes.data.contracts.map(
        async (contract: EcosystemContract) => {
          // Populate the Privacy Notice
          const pn = ecosystemContractToPrivacyNotice(contract);
          const consumerServiceOfferings = contract.serviceOfferings.filter(
            (so) => so.participant === dataConsumerID
          );

          const consumerSOsThatArePurposes = await Promise.all(
            consumerServiceOfferings.map(async (so) => {
              if (so.serviceOffering.startsWith("http")) {
                const soSelfDescription = await axios.get(so.serviceOffering);
                if (soSelfDescription.data?.softwareResources?.length > 0)
                  return so;
              }
              return null;
            })
          );

          const filteredConsumerSOs = consumerSOsThatArePurposes.filter(
            (so) => so !== null
          );

          pn.dataProvider = dataProviderID;

          pn.controllerDetails.name =
            typeof dataProviderSD === "string"
              ? dataProviderSD
              : dataProviderID;

          pn.data = await getDataFromPoliciesInEcosystemContract(
            contract,
            dataProviderID
          );

          for (const serviceOffering of filteredConsumerSOs) {
            const serviceOfferingResponse = await axios.get(
              serviceOffering.serviceOffering
            );

            for (const sf of serviceOfferingResponse.data.softwareResources) {
              const softwareResourceResponse = await axios.get(sf);
              pn.purposes.push({
                purpose: softwareResourceResponse?.data?.name,
                serviceOffering: serviceOffering.serviceOffering,
                resource: sf,
              });
            }
          }

          pn.recipients.push(
            typeof dataConsumerSD === "string" ? dataConsumerSD : dataConsumerID
          );

          return pn;
        }
      )
    );
  }

  return [...bilateralPrivacyNotices, ...ecosystemPrivacyNotices];
};

export const validate = async (
  dataProviderID: string,
  dataConsumerID: string
) => {
  const contractURL = `${process.env.CONTRACT_SERVICE_BASE_URL}/verify/${dataProviderID}/${dataConsumerID}`;
  const res = await axios.get(contractURL, {
    headers: { "Content-Type": "application/json" },
  });
  return res;
};

export const buildConsentsFromContracts = async (
  contracts: any[],
  user: IUser
) => {
  const consents: any[] = [];
  const toSave: IConsent[] = [];

  contracts.forEach((contract) => {
    const consentId = randomUUID();
    const consent: any = {
      version: "KI-CR-v1.1.O",
      consentReceiptID: consentId,
      collectionMethod: "", // Is this how the user gave consent ?
      jurisdiction: contract?.jurisdiction || "", // Is this dc:coverage ?
      consentTimestamp: null, // Until given by the user
      publicKey: "", // What is it ? How to get it ?
      language: contract?.language || "", // Unsure
      piiPrincipalId: `${user.firstName} ${user.lastName}`,
      piiControllers: [
        {
          id: process.env.FEDERATED_APPLICATION_IDENTIFIER,
          name: process.env.APPLICATION_NAME,
        },
      ], // Unsure but could be the PDI
      policyUrl: contract?.policyUrl || "",
      data: contract.data, // This property does not exist on the Kantara Consent Receipt
      services: [],
      sensitive: true, // How can we establish ?
      spiCat: contract?.spiCat,
      contract: contract.uri,
    };

    consent.services.push(
      contract.purpose.map((purpose: any) => {
        return {
          service: purpose.purpose,
          purposes: [{ ...purpose }],
        };
      })
    );

    consents.push(consent);

    // Save current stage of the consent to be able to compare
    // it later when the user grants consent
    const savedConsent = new Consent();
    savedConsent.user = user.id;
    savedConsent.identifier = consentId;
    savedConsent.consented = false;
    const purposes: string[] = [];
    consent.services.forEach((s: any) => {
      if (s?.purposes?.length) {
        purposes.push(...s.purposes.map((p: any) => p.purpose));
      }
    });
    savedConsent.purposes = purposes.map((purpose) => ({
      purpose: purpose,
    }));
    savedConsent.data = consent.data.map((data: any) => JSON.stringify(data));
    savedConsent.jsonld = JSON.stringify(consent);
    savedConsent.status = "pending";
    toSave.push(savedConsent);
  });

  await Consent.insertMany(toSave);

  return consents;
};

export const sendConsent = async (consentSD: any) => {
  const res = await axios.get("/");
  res.data = {
    success: true,
    consent: consentSD,
  };
};

export const getAvailableExchangesForParticipant = async (
  participantSD: string,
  as: string
): Promise<IExchange[]> => {
  const participantSD64 = Buffer.from(participantSD).toString("base64");

  const bilateralContractURL = `${process.env.CONTRACT_SERVICE_BASE_URL}/bilaterals/for/${participantSD64}?hasSigned=true`;
  const ecosystemContractURL = `${process.env.CONTRACT_SERVICE_BASE_URL}/contracts/for/${participantSD64}?hasSigned=true`;

  const [bilateralContractsRes, ecosystemContractsRes] = await Promise.all([
    axios.get(bilateralContractURL, {
      headers: { "Content-Type": "application/json" },
    }),
    axios.get(ecosystemContractURL, {
      headers: { "Content-Type": "application/json" },
    }),
  ]);

  const bilateralExchanges = <IExchange[]>[];
  if (
    bilateralContractsRes?.data.contracts &&
    bilateralContractsRes?.data.contracts.length > 0
  ) {
    bilateralContractsRes?.data.contracts.map((contract: BilateralContract) => {
      if (as === "provider" && contract.dataProvider === participantSD) {
        bilateralExchanges.push(
          contractToExchange(contract, contract.dataConsumer)
        );
      } else if (as === "consumer" && contract.dataConsumer === participantSD) {
        bilateralExchanges.push(
          contractToExchange(contract, contract.dataProvider)
        );
      }
    });
  }
  const ecosystemExchanges = <IExchange[]>[];
  if (
    ecosystemContractsRes.data.contracts &&
    ecosystemContractsRes.data.contracts.length > 0
  ) {
    ecosystemContractsRes.data.contracts.map((contract: EcosystemContract) => {
      return contract.serviceOfferings.map((serviceOffering) => {
        if (serviceOffering.participant !== participantSD) {
          ecosystemExchanges.push(
            contractEcosystemToExchange(contract, serviceOffering.participant)
          );
        }
      });
    });
  }

  return [...bilateralExchanges, ...ecosystemExchanges];
};
