import { Types, Document, Model } from "mongoose";

export interface AllSchemas {
  schema_version: string;

  /**
   * JSON-LD Self Description
   */
  jsonld?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface LegalPerson {
  /**
   * Country's registration number, which identifies one specific entity
   * Can be local / EUID / EORI / vatID / leiCode
   */
  registrationNumber: string;

  headquartersAddress: {
    /**
     * Physical location of the headquarters in ISO 3166-2 alpha2, alpha-3 or numeric format.
     */
    countryCode: string;
  };

  legalAddress: {
    /**
     * Physical location of the headquarters in ISO 3166-2 alpha2, alpha-3 or numeric format.
     */
    countryCode: string;
  };

  /**
   * A list of direct participant that this entity is a subOrganization of, if any.
   */
  parentOrganization: string[];

  /**
   * A list of direct participant with a legal mandate on this entity, e.g., as a subsidiary.
   */
  subOrganization: string[];
}

export interface IParticipant extends Document, AllSchemas {
  legalName: string;

  /**
   * DID identifier
   */
  did: string;

  /**
   * Legal information about the organisation / person
   */
  legalPerson: LegalPerson;

  /**
   * URL to the self-description of the participant in a catalog
   */
  selfDescriptionURL: string;

  endpoints: {
    dataImport?: string;
    dataExport?: string;
    consentImport?: string;
    consentExport?: string;
  };

  email: string;

  /**
   * Credentials to communicate with the Consent API
   */
  clientID: string;
  clientSecret: string;

  /**
   * URL / Endpoint for the "data space connector" of the participant
   */
  dataspaceEndpoint: string;
}

export interface IParticipantModel extends Model<IParticipant> {
  validatePassword(password: string): Promise<boolean>;
}

export type FederatedIdentifier = {
  /**
   * MongoDB id
   */
  id: Types.ObjectId | null;

  /**
   * DID identifier, useful to identify the participant
   * if coming from another instance
   */
  identifier: string;
};

export interface IUserIdentifier extends Document, AllSchemas {
  attachedParticipant: Types.ObjectId | null;
  email: string;
  /**
   * Alternative to email for decentralized identifiers
   */
  identifier: string;
  /**
   * dynamic url
   */
  url: string;
  user: Types.ObjectId | null;
}

export interface IUser extends Document, AllSchemas {
  firstName?: string;
  lastName?: string;
  email: string;
  password?: string;
  identifiers: Types.ObjectId[];
  oauth: {
    scopes: string[];
    refreshToken?: string;
  };
}

export interface IConsent extends Document, AllSchemas {
  /**
   * The ID of the user
   */
  user: Types.ObjectId | null;
  /**
   * The ID of the provider userIdentifier
   */
  providerUserIdentifier: Types.ObjectId;
  /**
   * The ID of the consumer userIdentifier
   */
  consumerUserIdentifier: Types.ObjectId;
  /**
   * deprecated
   */
  identifier: string;
  /**
   * Boolean for draft
   */
  consented: boolean;
  /**
   * The DID / Self-Description URL of the dataProvider
   */
  dataProvider: Types.ObjectId;

  /**
   * The DID / Self-Description URL of the dataConsumer
   */
  dataConsumer: Types.ObjectId;

  /**
   * Information about the recipients or categories of recipients of the personal data.
   */
  recipients: string[];

  /**
   * URIs / Identifiers poiting to the Service Offering Self-Descriptions used for data processing
   */
  purposes: {
    /**
     * Purpose name
     */
    purpose: string;
    /**
     * A broad type providing further descrip-
     * tion and context to the specified purpose
     * for PII processing.
     */
    purposeType?: string;
    /**
     * A data structure that contains one or
     * more PII type values where each type
     * represents one attribute.
     */
    piiInformation?: IPiiInformation[];
    /**
     * A description of the PII collection meth-
     * ods that will be used.
     */
    collectionMethod?: string[];
    /**
     * How the PII will be used.
     */
    processingMethod?: string[];
  }[];

  /**
   * URIs / Identifiers pointing to the Data Resources Self-Descriptions that the user consented to
   */
  data: string[];

  /**
   * Sting that contains a child consent id
   */
  child?: Types.ObjectId;
  /**
   * String that contains a parent consent id
   */
  parent?: Types.ObjectId;

  /**
   * status of the consent
   */
  status:
    | "granted"
    | "revoked"
    | "pending"
    | "expired"
    | "terminated"
    | "refused";

  /**
   * URL / identifier pointing to the detailed privacy notice document.
   */
  privacyNotice: string;

  /**
   * URL or brief description of the withdrawal process explaining how the PII principal can withdraw their consent
   */
  withdrawalMethod?: string;

  /**
   * ISO Standard recommends using date and time format or duration according to ISO 8601
   */
  retentionPeriod?: string;

  /**
   * Country / Region code or name
   */
  processingLocations?: string[];

  /**
   * Country / region code or name
   */
  storageLocations?: string[];

  /**
   * Geographic restrictions for processing of
   * personal data.
   */
  geographicRestrictions?: string[];

  /**
   * A service or business process within
   * which the purpose of PII processing is
   * applied or interpreted.
   */
  services?: string[];

  /**
   * The legal jurisdictions governing the
   * processing of PII.
   */
  jurisdiction?: string;

  /**
   * A data structure where each entry de-
   * scribes a third party in terms of identity,
   * geo-location of data transfer, and wheth-
   * er it constitutes a jurisdictional change.
   */
  recipientThirdParties?: IDataProcessing;

  /**
   * Ex: "right to access", "right to erasure"...
   * These should correspond to the rights laid out in the applicable privacy legislation
   */
  piiPrincipalRights: string[];

  /**
   * The token generated by the provider to allow the consumer to
   * make the data request
   */
  token?: string;

  /**
   * The Contract where the consent have been generated
   */
  contract: string;

  /**
   * event of a consent
   */
  event: IEvent[];
}

export interface IDataProcessing {
  /**
   * The ID of the data processing
   */
  catalogId: string;
  /**
   * The infrastructure services used for the data processing
   */
  infrastructureServices: IInfrastructureService[];
}

export interface IInfrastructureService {
  /**
   * The ID of the participant
   */
  participant: string;
  /**
   * The ID of the service offering
   */
  serviceOffering: string;
  /**
   * configuration
   */
  configuration?: string;

  /**
   * parameters
   */
  params?: any;
}

export interface IPrivacyNotice {
  /**
   * Contract self-description.
   */
  contract: string;

  /**
   * Title of the privacy notice.
   */
  title: string;

  /**
   * Date of the latest revision of the privacy notice.
   */
  lastUpdated: string; // ISO 8601 date format

  /**
   * The DID / Self-Description URL of the dataProvider
   */
  dataProvider: string;

  /**
   * The identity and contact details of the PII controller (and, where applicable, the PII controller's representative and the data protection officer).
   */
  controllerDetails: {
    name: string;
    contact: string;
    representative?: string;
    dpo?: {
      // Data Protection Officer
      name: string;
      contact: string;
    };
  };

  /**
   * The purposes of the processing for which the personal data are intended, as well as the legal basis for the processing.
   */
  purposes: {
    purpose: string;
    serviceOffering: string;
    resource: string;
  }[];

  /**
   * Data resources available for data processing by the purposes
   */
  data: string[];

  /**
   * Description of the categories of personal data processed.
   */
  categoriesOfData: string[];

  /**
   * Information about the recipients or categories of recipients of the personal data.
   */
  recipients: string[];

  /**
   * Information about the data processing.
   */
  dataProcessings?: IDataProcessing[];

  /**
   * Details regarding transfers of personal data to third countries or international organizations, including the identification of those third countries or international organizations and, in the case of such transfers, the documentation of suitable safeguards.
   */
  internationalTransfers?: {
    countries: string[];
    safeguards: string;
  };

  /**
   * The period for which the personal data will be stored, or if that is not possible, the criteria used to determine that period.
   */
  retentionPeriod: string;

  /**
   * Information about the rights of the PII principal such as access, rectification, erasure, restriction on processing, objection to processing, and data portability.
   */
  piiPrincipalRights: string[];

  /**
   * If the processing is based on consent, the existence of the right to withdraw consent at any time, without affecting the lawfulness of processing based on consent before its withdrawal.
   */
  withdrawalOfConsent: string;

  /**
   * The right to lodge a complaint with a supervisory authority.
   */
  complaintRights: string;

  /**
   * Whether the provision of personal data is a statutory or contractual requirement, or a requirement necessary to enter into a contract, as well as whether the data subject is obliged to provide the personal data and the possible consequences of failure to provide such data.
   */
  provisionRequirements: string;

  /**
   * The existence of automated decision-making, including profiling, and meaningful information about the logic involved, as well as the significance and the envisaged consequences of such processing for the data subject.
   */
  automatedDecisionMaking?: {
    details: string;
  };

  /**
   * timestamp to archived a privacy notice
   */
  archivedAt?: string;
}

export interface IConsentReceipt {
  record: {
    /**
     * A unique reference for the implementation documenta-
     * tion describing interpretation of the record structure and
     * contents in conformance with this document.
     */
    schemaVersion: string;
    /**
     * A unique reference for a record.
     */
    recordId: string;
    /**
     * The identifier or reference to the PII principal whose PII
     * will be processed.
     */
    piiPrincipalId: string;
  };
  piiProcessing: {
    /**
     * Identifier or reference to the PII control-
     * ler’s privacy notice and applicable terms
     * of use in effect when the consent was
     * obtained, and the record was created.
     */
    privacyNotice: string;
    /**
     * Language of notice and interface related
     * to consent.
     */
    language: string;
    /**
     * PII can be associated with multiple pur-
     * poses that do not share the same lawful
     * basis.
     */
    purposes: IPurpose[];
  };
  /**
   * event of a consent
   */
  event: IEvent[];
  partyIdentification: IPartyIdentification[];
}

export interface IPurpose {
  /**
   * The purpose for which PII is processed.
   */
  purpose: string;
  /**
   * A broad type providing further descrip-
   * tion and context to the specified purpose
   * for PII processing.
   */
  purposeType: string;
  /**
   * The lawful basis for processing personal
   * data associated with the purpose.
   */
  lawfulBasis: string;
  /**
   * A data structure that contains one or
   * more PII type values where each type
   * represents one attribute.
   */
  piiInformation: IPiiInformation[];
  /**
   * A data structure that contains one or
   * more party_identifier values where each
   * identifier represents one PII controller.
   */
  piiControllers: string[];
  /**
   * A description of the PII collection meth-
   * ods that will be used.
   */
  collectionMethod?: string[];
  /**
   * How the PII will be used.
   */
  processingMethod?: string[];
  /**
   * The geo-locations of where the data will
   * be physically stored.
   */
  storageLocation: string[];
  /**
   * The PII controller shall provide informa-
   * tion about the retention period and/or
   * disposal schedule of PII that it is collect-
   * ed and processed.
   */
  retentionPeriod: string;
  /**
   * The locations or geo-locations of where
   * the PII will be processed if different from
   * storage_location.
   */
  processingLocations?: string[];
  /**
   * Geographic restrictions for processing of
   * personal data.
   */
  geographicRestrictions?: string[];
  /**
   * A service or business process within
   * which the purpose of PII processing is
   * applied or interpreted.
   */
  services?: string[];
  /**
   * The legal jurisdictions governing the
   * processing of PII.
   */
  jurisdiction: string;
  /**
   * A data structure where each entry de-
   * scribes a third party in terms of identity,
   * geo-location of data transfer, and wheth-
   * er it constitutes a jurisdictional change.
   */
  recipientThirdParties: IDataProcessing;
  /**
   * Indicates information or link on how and
   * where the PII principal can withdraw
   * this consent.
   */
  withdrawalMethod: string;
  /**
   * Indicates information or location on how
   * and where the PII principal can exercise
   * their privacy rights.
   */
  privacyRights?: any;
  /**
   * The PII controller may follow a code of
   * conduct which sets the proper applica-
   * tion of privacy regulation taking into
   * account specific features within a sector.
   */
  codeOfConduct?: string;
  /**
   * The PII controller may perform a pri-
   * vacy assessment in order to determine
   * privacy risks and potential impacts of
   * non-compliance on the PII principals.
   */
  impactAssessment?: string;
  /**
   * Information about the authority or
   * authorities to whom the PII principal
   * can issue an inquiry or complaint with
   * regards to the processing of their data
   * and exercising of rights.
   */
  authorityParty?: string;
}

export interface IPartyIdentification {
  /**
   * An unambiguous identifier indicating the party within
   * the record.
   */
  partyId: string;
  /**
   * Contact information in the form of a postal address.
   */
  partyAddress: string;
  /**
   * Contact information in the form of an email address.
   */
  partyEmail?: string;
  /**
   * An url of a website or resource containing information
   * about the party and/or its services, policies, and contact
   * information.
   */
  partyUrl?: string;
  /**
   * Contact information in the form of a phone number.
   */
  partyPhone?: string;
  /**
   * The name of the party through which it is identified as a
   * legal entity.
   */
  partyName: string;
  /**
   * Indicates the role of party in context of the record it is
   * specified in.
   */
  partyRole?: string;
  /**
   * Unbounded form of communication mediums.
   */
  partyContact: any;
  /**
   * The type or category with which the party is relevant
   * for the specific processing.
   */
  partyType: string;
}

export interface IPiiInformation {
  /**
   * An explicit list of PII types, categories or elements to be
   * processed for the specified purpose. The PII types shall be
   * defined using language meaningful to the users and consist-
   * ent with the purposes of processing.
   */
  piiType?: string;
  /**
   * An unambiguous identifier to the attribute relating to the PII
   * type.
   */
  piiAttributeId?: string;
  /**
   * This field is used to indicate whether it was mandatory or op-
   * tional for the PII principal to release the PII type for specified
   * purposes.
   */
  piiOptional?: string;
  /**
   * A PII controller may explicitly note if the PII type is consid-
   * ered sensitive where this has an impact on the consent or its
   * use for the specified purpose, or in other contexts such as the
   * sharing with other parties.
   */
  sensitivePiiCategory?: string;
  /**
   * A PII controller may explicitly note if the PII type is con-
   * sidered special where it falls under the special category of
   * highly impactful personal data based on requirements in the
   * jurisdiction.
   */
  specialPiiCategory?: string;
}

export interface IEvent {
  /**
   * Date and time that the associated event took place, for
   * example, when consent was obtained expressed using
   * the date and time format specified in the ISO 8601 se-
   * ries using the UTC time zone.
   */
  eventTime: string;
  /**
   * The duration for which the consent is considered valid
   * for justification of processing based on it, and after
   * which it is no longer considered valid. The PII controller
   * should "refresh", "confirm" or "re-affirm" consent peri-
   * odically, where the period is considered the duration of
   * that consent.
   */
  validityDuration: string;

  /**
   * The PII controller shall indicate the event type associat-
   * ed with the event state change, for example, when con-
   * sent is used to justify the validity of expressing consent.
   */
  eventType: string;
  /**
   * The state of an event specifies its existence and applica-
   * bility within a life cycle. For consent, state refers to the
   * events related to the request (e.g. notice), provision of or
   * obtaining consent, or termination due to withdrawal.
   */
  eventState: string;
}

export interface IPrivacyNoticeDocument
  extends Document,
    IPrivacyNotice,
    AllSchemas {}
