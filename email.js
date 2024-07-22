const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
require("dotenv").config();
const { isDebugMode } = require("./utils");

const sesClient = new SESClient({ region: process.env.AWS_REGION });

const { SES_EMAIL_FROM, SES_EMAIL_BCC } = process.env;

function validateEnvVariables() {
  if (!SES_EMAIL_FROM) {
    throw new Error("SES_EMAIL_FROM is not defined in .env file");
  }

  if (!SES_EMAIL_BCC) {
    throw new Error("SES_EMAIL_BCC is not defined in .env file");
  }

  const bccAddresses = SES_EMAIL_BCC.split(",").map((email) => email.trim());
  if (bccAddresses.length === 0) {
    throw new Error("SES_EMAIL_BCC must contain at least one email address");
  }

  return bccAddresses;
}

async function sendEmail(emailContent, recipientEmail) {
  console.log(emailContent);
  const bccAddresses = validateEnvVariables();

  const params = {
    Source: SES_EMAIL_FROM,
    Destination: {
      ToAddresses: [recipientEmail],
      BccAddresses: bccAddresses,
    },
    Message: {
      Subject: {
        Data: "Jira Audit Alerts",
      },
      Body: {
        Html: {
          Data: emailContent,
        },
      },
    },
  };
  if (!isDebugMode()) {
    const command = new SendEmailCommand(params);
    await sesClient.send(command);
  } else {
    console.log("EMAIL:", JSON.stringify(params, null, 2));
  }
}

function logAlerts(alerts) {
  console.log("Alerts:");
  alerts.forEach((alert) => console.log(alert));
}

module.exports = { sendEmail, logAlerts };
