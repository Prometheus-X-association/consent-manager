import { Schema, model } from "mongoose";
import { IUser } from "../../types/models";
import bcrypt from "bcryptjs";

const userSchema = new Schema<IUser>(
  {
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    email: {
      type: String,
      required: true,
      default: "",
    },
    password: {
      type: String,
    },
    identifiers: [{ type: Schema.Types.ObjectId, ref: "UserIdentifier" }],
    oauth: {
      scopes: [{ type: String }],
      refreshToken: { type: String },
    },
    jsonld: {
      type: String,
      default: "",
    },
    schema_version: {
      type: String,
      required: true,
      default: "v0.1.0",
    },
  },
  { timestamps: true }
);

userSchema.methods.validatePassword = async function (
  password: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, this.password);
  } catch (error) {
    throw new Error("Password validation error: " + error);
  }
};

userSchema.pre<IUser>("save", async function (next) {
  try {
    if ((this.password && this.isNew) || this.isModified("password")) {
      const saltRounds = parseInt(process.env.SALT_ROUNDS || "10") || 10;
      const hashedPassword: string = await bcrypt.hash(
        this.password,
        saltRounds
      );
      this.password = hashedPassword;
    }
    next();
  } catch (error) {
    next(error);
  }
});

const User = model<
  IUser & { validatePassword(password: string): Promise<boolean> }
>("User", userSchema);

export default User;
