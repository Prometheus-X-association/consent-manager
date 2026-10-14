import { IConsent, IConsentReceipt } from "../types/models";
import Participant from "../models/Participant/Participant.model";
import axios from "axios";

export const consentToConsentReceipt = async (
  consent: IConsent
): Promise<IConsentReceipt> => {
  const consumer = await Participant.findById(consent.dataConsumer);
  const provider = await Participant.findById(consent.dataProvider);

  if (!consumer || !provider) {
    throw new Error("Consent references missing participants");
  }

  // Fetch self-descriptions with fallback to participant DB data if unavailable
  let consumerSelfDescription;
  let providerSelfDescription;

  try {
    const response = await axios.get(consumer.selfDescriptionURL, {
      timeout: 2000,
    });
    consumerSelfDescription = response;
  } catch {
    // Fallback: use participant data from DB if self-description URL is unreachable
    consumerSelfDescription = {
      data: {
        legalName: consumer.legalName || "Unknown",
        did: consumer.did || "",
        legalPerson: consumer.legalPerson || {
          legalAddress: { countryCode: "XX" },
          subOrganization: [],
        },
      },
    };
  }

  try {
    const response = await axios.get(provider.selfDescriptionURL, {
      timeout: 2000,
    });
    providerSelfDescription = response;
  } catch {
    // Fallback: use participant data from DB if self-description URL is unreachable
    providerSelfDescription = {
      data: {
        legalName: provider.legalName || "Unknown",
        did: provider.did || "",
        legalPerson: provider.legalPerson || {
          legalAddress: { countryCode: "XX" },
          subOrganization: [],
        },
      },
    };
  }

  const recipientSelfDescriptions: any[] = [];

  if (consent.recipientThirdParties?.catalogId) {
    for (const recipient of consent.recipientThirdParties
      .infrastructureServices) {
      try {
        const response = await axios.get(recipient.participant, {
          timeout: 2000,
        });
        recipientSelfDescriptions.push({
          participant: recipient.participant,
          data: response.data,
        });
      } catch {
        // Skip unreachable recipients
        recipientSelfDescriptions.push({
          participant: recipient.participant,
          data: null,
        });
      }
    }
  }

  return {
    record: {
      schemaVersion: consent.schema_version,
      recordId: consent._id,
      piiPrincipalId: consent.user?.toString() ?? null,
    },
    piiProcessing: {
      privacyNotice: consent.privacyNotice.toString(),
      language: "en",
      purposes: consent.purposes.map((purpose) => ({
        purpose: purpose.purpose,
        purposeType: purpose.purposeType,
        lawfulBasis: "consent",
        piiInformation: purpose.piiInformation,
        piiControllers: [
          provider.selfDescriptionURL,
          consumer.selfDescriptionURL,
        ],
        collectionMethod: purpose.collectionMethod,
        processingMethod: purpose.processingMethod,
        storageLocation: consent.storageLocations,
        retentionPeriod: consent.retentionPeriod,
        processingLocations: consent.processingLocations,
        geographicRestrictions: consent.geographicRestrictions,
        services: consent.services,
        jurisdiction: consent.jurisdiction,
        recipientThirdParties: consent.recipientThirdParties,
        withdrawalMethod: process.env.WITHDRAWAL_METHOD || "",
        privacyRights: process.env.PRIVACY_RIGHTS?.split(",") || "",
        codeOfConduct: process.env.CODE_OF_CONDUCT || "",
        impactAssessment: process.env.IMPACT_ASSESSMENT || "",
        authorityParty: process.env.AUTHORITY_PARTY || "",
      })),
    },
    event: consent.event,
    partyIdentification: [
      {
        partyId: consumer.selfDescriptionURL,
        partyAddress: consumerSelfDescription.data.legalPerson.legalAddress,
        partyName: consumerSelfDescription.data.legalName,
        partyContact: consumerSelfDescription.data.legalPerson.subOrganization,
        partyType: "consumer",
      },
      {
        partyId: provider.selfDescriptionURL,
        partyAddress: providerSelfDescription.data.legalPerson.legalAddress,
        partyName: providerSelfDescription.data.legalName,
        partyContact: providerSelfDescription.data.legalPerson.subOrganization,
        partyType: "provider",
      },
    ],
  };
};
