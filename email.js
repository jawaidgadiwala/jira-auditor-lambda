const AWS = require("aws-sdk");
require("dotenv").config();
const { isDebugMode } = require("./utils");

const ses = new AWS.SES({ region: process.env.AWS_REGION });

const { SES_EMAIL_FROM, SES_EMAIL_TO } = process.env;

async function sendEmail(alerts) {
  const params = {
    Source: SES_EMAIL_FROM,
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Subject: {
        Data: "Jira Automation Alerts",
      },
      Body: {
        Text: {
          Data: alerts.join("\n"),
        },
      },
    },
  };
  await ses.sendEmail(params).promise();
}

function logAlerts(alerts) {
  console.log("Alerts:");
  alerts.forEach((alert) => console.log(alert));
}

module.exports = { sendEmail, logAlerts };
