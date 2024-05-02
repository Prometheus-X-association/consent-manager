import nodemailer, { Transporter, SendMailOptions } from "nodemailer";
import { Logger } from "../../../loggers";
import { EmailTemplates } from "../../templates";
import { NodemailerEmailClientError } from "./NodemailerEmailClientError";

export class NodemailerEmailClient {
  transporter: Transporter;

  /**
   * If the env config for EMAIL_PROVIDER is Nodemailer
   * then this client will be activated, otherwise, it wont
   */
  activated: boolean;

  constructor() {
    const user = process.env.NODEMAILER_USER;
    const pass = process.env.NODEMAILER_PASS;
    const host = process.env.NODEMAILER_HOST;
    const port = process.env.NODEMAILER_PORT;
    this.activated = !!user && !!pass;

    if (!this.activated) {
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: host,
      port: parseInt(port),
      secure: false,
      auth: {
        user: user,
        pass: pass,
      },
    });
  }

  /**
   * Send email through nodemailer with provided options
   */
  async sendMessage(options: SendMailOptions) {
    if (!this.activated) return;

    try {
      const res = await this.transporter.sendMail(options);
      return res;
    } catch (err) {
      Logger.error({
        location: "MailchimpEmailClient.sendMessage",
        message: err.message,
      });
      const nodemailerErr = new NodemailerEmailClientError(err.message);
      nodemailerErr.name = err.name;
      nodemailerErr.stack = err.stack;
      throw nodemailerErr;
    }
  }

  /**
   * Send email through nodemailer using a local template and
   * populating with any variables existing in the template
   */
  async sendMessageFromLocalTemplate(
    options: SendMailOptions,
    templateName: keyof typeof EmailTemplates,
    variables?: { [key: string]: string }
  ) {
    if (!this.activated) return;

    try {
      const html = EmailTemplates[templateName](variables) || "";
      options.html = html;
    } catch (err) {
      Logger.error({
        location: "MailchimpEmailClient.sendMessageFromLocalTemplate",
        message: err.message,
      });
      const nodemailerErr = new NodemailerEmailClientError(err.message);
      nodemailerErr.name = err.name;
      nodemailerErr.stack = err.stack;
      throw nodemailerErr;
    }

    return await this.sendMessage(options);
  }
}
