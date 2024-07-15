const { getLastRunTime, updateLastRunTime } = require("./s3");
const {
  getWorklogUpdates,
  getStatusTransitions,
  getProjectLead,
  checkWorklogConditions,
  checkStatusConditions,
} = require("./jira");
const { sendEmail, logAlerts } = require("./email");
const { DateTime } = require("luxon");
const { isDebugMode } = require("./utils");
require("dotenv").config();

const { SES_EMAIL_TO } = process.env;

exports.handler = async (event, context) => {
  try {
    const lastRunTime = await getLastRunTime();
    const currentTime = DateTime.utc();

    console.log(`Last run time: ${lastRunTime.toISO()}`);
    console.log(`Current time: ${currentTime.toISO()}`);

    const worklogIssues = await getWorklogUpdates(lastRunTime.toISO());
    const statusIssues = await getStatusTransitions(lastRunTime.toISO());

    const worklogAlerts = checkWorklogConditions(
      worklogIssues,
      lastRunTime.toISO()
    );
    const statusAlerts = await checkStatusConditions(statusIssues);
    console.log(statusAlerts);

    const alerts = [...worklogAlerts, ...statusAlerts];

    if (alerts.length > 0) {
      if (SES_EMAIL_TO) {
        // Send email to the fixed recipient
        if (isDebugMode()) {
          logAlerts(alerts);
        } else {
          logAlerts(alerts);
          await sendEmail(alerts, SES_EMAIL_TO);
        }
      } else {
        // Send email to project lead
        const projectKeys = new Set(
          alerts
            .map((alert) => alert.project && alert.project.key)
            .filter(Boolean)
        );
        for (const projectKey of projectKeys) {
          const projectLeadEmail = await getProjectLead(projectKey);
          if (isDebugMode()) {
            logAlerts(alerts);
          } else {
            logAlerts(alerts);
            await sendEmail(alerts, projectLeadEmail);
          }
        }
      }
    }

    await updateLastRunTime(currentTime);

    return {
      statusCode: 200,
      body: JSON.stringify("Script executed successfully!"),
    };
  } catch (error) {
    console.error("Error in handler:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify(`Internal Server Error: ${error.message}`),
    };
  }
};

// Uncomment for local testing
if (require.main === module) {
  exports.handler().then(console.log).catch(console.error);
}
