import { Schema, model } from "mongoose";
import { IPendingGuardianship } from "../../types/models";

const pendingGuardianshipSchema = new Schema<IPendingGuardianship>(
  {
    participantId: {
      type: Schema.Types.ObjectId,
      ref: "Participant",
      required: true,
    },
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String },
    identifier: { type: String },
    url: { type: String },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    callbackUrl: { type: String, required: true },
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

pendingGuardianshipSchema.index({ token: 1 });
// MongoDB TTL index: auto-delete expired documents 1 hour after expiry
pendingGuardianshipSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

const PendingGuardianship = model<IPendingGuardianship>(
  "PendingGuardianship",
  pendingGuardianshipSchema
);

export default PendingGuardianship;
