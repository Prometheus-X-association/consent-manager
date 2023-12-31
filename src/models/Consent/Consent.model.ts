import { Schema, model } from "mongoose";
import { IConsent } from "../../types/models";
import { NotFoundError } from "../../errors/NotFoundError";

const schema = new Schema<IConsent>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userIdentifiers: [{ type: Schema.Types.ObjectId, ref: "UserIdentifier" }],
    identifier: { type: String, required: true },
    consented: { type: Boolean, required: true },
    purposes: [{ type: String }],
    data: [{ type: String }],
    status: { type: String, enum: ["pending", "granted", "revoked"] },
    jsonld: { type: String, required: true },
    schema_version: { type: String, default: "0.1.0" },
  },
  { timestamps: true }
);

schema.virtual("jsonData", function () {
  return JSON.parse(this.jsonld);
});

schema.methods.toReceipt = function () {
  return JSON.parse(this.json);
};

schema.methods.isValid = function () {
  return this.status === "granted" && this.consented === true;
};

// This is simulated for now, as we don not yet know exactly
// how and where participant identity will be referenced
schema.methods.getParticipants = function () {
  const jsonData = JSON.parse(this.jsonld);
  if (!jsonData.permission || !jsonData.permission.length)
    throw new NotFoundError(
      "One or more participants were not found in the consent"
    );

  const { assigner, assignee } = jsonData.permission[0];

  if (!assigner || !assignee)
    throw new NotFoundError(
      "One or more participants were not found in the consent"
    );

  return { assigner, assignee };
};

schema.methods.getParticipantsIDs = function () {
  const { assigner, assignee } = this.getParticipants();
  const [assignerID, assigneeID] = [assigner, assignee].map(
    (uri) => uri?.split("/")[assigner?.split("/").length - 1]
  );
  return { assignerID, assigneeID };
};

const Consent = model<
  IConsent & {
    jsonData: any;
    isValid: () => boolean;
    getParticipants: () => { assigner: string; assignee: string };
    getParticipantsIDs: () => { assignerID: string; assigneeID: string };
  }
>("Consent", schema);

export default Consent;
