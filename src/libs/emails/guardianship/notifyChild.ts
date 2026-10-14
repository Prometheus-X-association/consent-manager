import { MailchimpClient } from "../mailchimp/MailchimpClient";
import { NodemailerClient } from "../nodemailer";
import { Logger } from "../../loggers";
import nodemailer from "nodemailer";

const resolveRecipient = (email: string) =>
  process.env.MANDRILL_ENABLED ? email : process.env.MANDRILL_FROM_EMAIL;

export const notifyGuardianAction = async (params: {
  childEmail: string;
  childName: string;
  parentName: string;
  action: string;
  dataConsumerName?: string;
}) => {
  try {
    if (!params.childEmail) return;

    await MailchimpClient.sendMessageFromLocalTemplate(
      {
        message: {
          to: [{ email: resolveRecipient(params.childEmail) }],
          from_email: process.env.MANDRILL_FROM_EMAIL,
          from_name: process.env.MANDRILL_FROM_NAME,
          subject: "An action was performed on your consents",
        },
      },
      "guardianAction",
      {
        childName: params.childName,
        parentName: params.parentName,
        action: params.action,
        dataConsumerName: params.dataConsumerName || "",
      }
    );
  } catch (err) {
    Logger.error({ location: "notifyGuardianAction", message: `${err}` });
  }
};

export const sendGuardianInvite = async (params: {
  childEmail: string;
  childName: string;
  parentName: string;
  claimUrl: string;
}) => {
  try {
    if (!params.childEmail) return;

    await MailchimpClient.sendMessageFromLocalTemplate(
      {
        message: {
          to: [{ email: resolveRecipient(params.childEmail) }],
          from_email: process.env.MANDRILL_FROM_EMAIL,
          from_name: process.env.MANDRILL_FROM_NAME,
          subject: "Activate your account",
        },
      },
      "guardianInvite",
      {
        childName: params.childName,
        parentName: params.parentName,
        claimUrl: params.claimUrl,
      }
    );
  } catch (err) {
    Logger.error({ location: "sendGuardianInvite", message: `${err}` });
  }
};

/**
 * Sends a guardianship validation request to the parent. The parent must click
 * the link to confirm they accept guardianship of the child account being
 * registered by the dataspace connector. Best-effort.
 */
export const sendGuardianValidationRequest = async (params: {
  parentEmail: string;
  parentName: string;
  childEmail?: string;
  childIdentifier?: string;
  validateUrl: string;
}) => {
  try {
    if (!params.parentEmail) return;

    const childLabel =
      params.childEmail || params.childIdentifier || "the account";

    if (MailchimpClient.activated) {
      await MailchimpClient.sendMessageFromLocalTemplate(
        {
          message: {
            to: [{ email: resolveRecipient(params.parentEmail) }],
            from_email: process.env.MANDRILL_FROM_EMAIL,
            from_name: process.env.MANDRILL_FROM_NAME,
            subject: "Guardianship request — action required",
          },
        },
        "guardianValidation",
        {
          parentName: params.parentName,
          childEmail: childLabel,
          validateUrl: params.validateUrl,
        }
      );
    } else {
      const info = await NodemailerClient.sendMessageFromLocalTemplate(
        {
          to: params.parentEmail,
          from: process.env.NODEMAILER_FROM_NOREPLY,
          subject: "Guardianship request — action required",
        },
        "guardianValidation",
        {
          parentName: params.parentName,
          childEmail: childLabel,
          validateUrl: params.validateUrl,
        }
      );
      if (info) {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl)
          Logger.info({
            location: "sendGuardianValidationRequest",
            message: `Preview email: ${previewUrl}`,
          });
      }
    }
  } catch (err) {
    Logger.error({
      location: "sendGuardianValidationRequest",
      message: `${err}`,
    });
  }
};
