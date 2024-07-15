const {
  getLastRunTime,
  updateLastRunTime,
  getOffsetDuration,
  getCurrentTime,
} = require("./time");
const {
  getWorklogUpdates,
  getStatusTransitions,
  getProjectLead,
  getDevelopmentData,
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
    const currentTime = getCurrentTime();

    console.log(`Last run time: ${lastRunTime.toISO()}`);
    console.log(`Current time: ${currentTime.toISO()}`);

    const worklogIssues = await getWorklogUpdates(lastRunTime);
    const statusIssues = await getStatusTransitions(lastRunTime);

    const worklogAlerts = await checkWorklogConditions(
      worklogIssues,
      lastRunTime
    );
    const statusAlerts = await checkStatusConditions(statusIssues);

    const alerts = [...worklogAlerts, ...statusAlerts];

    if (alerts.length > 0) {
      if (SES_EMAIL_TO) {
        if (isDebugMode()) {
          logAlerts(alerts);
        } else {
          await sendEmail(alerts, SES_EMAIL_TO);
        }
      } else {
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
