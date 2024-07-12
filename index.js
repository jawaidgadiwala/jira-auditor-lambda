const { getLastRunTime, updateLastRunTime } = require("./s3");
const {
  getWorklogUpdates,
  getStatusTransitions,
  checkWorklogConditions,
  checkStatusConditions,
} = require("./jira");
const { sendEmail, logAlerts } = require("./email");
const { DateTime } = require("luxon");
const { isDebugMode } = require("./utils");

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
    const statusAlerts = checkStatusConditions(statusIssues);

    const alerts = [...worklogAlerts, ...statusAlerts];

    if (alerts.length > 0) {
      if (isDebugMode()) {
        logAlerts(alerts);
      } else {
        await sendEmail(alerts);
      }
    }

    await updateLastRunTime(currentTime);

    return {
      statusCode: 200,
      body: JSON.stringify("Script executed successfully!"),
    };
  } catch (error) {
    console.error("Error in handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify("Internal Server Error"),
    };
  }
};

// Uncomment for local testing
if (require.main === module) {
  exports.handler().then(console.log).catch(console.error);
}
