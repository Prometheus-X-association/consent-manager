import crypto from "crypto";
import { ConsentGenerationOptions } from "./types";
import { ConsentReceipt } from "../../types";

/**
 * Helper to generate Kantara Consent Receipts
 */
export class ConsentGenerator {
  static readonly version: "KI-CR-v1.1.0";

  /**
   * Creates a dummy consent receipt for testing purposes
   */
  static dummy() {
    const options: ConsentGenerationOptions = {
      jurisdiction: "EU",
      collectionMethod: "Dummy data sharing receipt",
      publicKey: "",
      language: "en",
      piiPrincipalId: "johndoe@email.com",
      piiControllers: [
        {
          piiController: "Dummy Jane Doe",
          contact: "Jane Doe",
          address: { streetAddress: "ABC Street", addressCountry: "FR" },
          email: "janedoe@email.com",
          phone: "+336123456789",
        },
      ],
      policyUrl: "https://example.com/policy",
      services: [
        {
          service: "Dummy service skills analytics",
          purposes: [
            {
              serviceOffering: "https://dummy-service-offering/catalog/1",
              resource:
                "https://dummy-service-offering/catalog/softwareresource/1",
              purpose: "To provide analysis on skills",
              purposeCategory: [],
              consentType: "EXPLICIT",
              piiCategory: ["1 Biographical", "11 - Employment"],
              primaryPurpose: true,
              termination: "N/A",
              thirdPartyDisclosure: false,
            },
          ],
        },
      ],
      sensitive: true,
      spiCat: ["1 - Biographical", "11 - Employment"],
    };

    ConsentGenerator.generate(options);
  }

  /**
   * Generates a new consent receipt
   */
  static generate(options: ConsentGenerationOptions): ConsentReceipt {
    const receipt = {
      version: ConsentGenerator.version,
      consentTimestamp: Date.now(),
      consentReceiptID: crypto.randomUUID(),
      ...options,
    };
    return receipt;
  }
}
