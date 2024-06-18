import { IConsent, IConsentReceipt } from "../types/models";
import Participant from "../models/Participant/Participant.model";
import axios from "axios";

export const consentToConsentReceipt = async (
  consent: IConsent
): Promise<IConsentReceipt> => {
  const consumer = await Participant.findById(consent.dataConsumer);
  const provider = await Participant.findById(consent.dataProvider);

  const consumerSelfDescription = await axios.get(consumer.selfDescriptionURL);
  const providerSelfDescription = await axios.get(provider.selfDescriptionURL);

  return {
    record: {
      schemaVersion: consent.schema_version,
      recordId: consent._id,
      piiPrincipalId: consent.user.toString(),
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
