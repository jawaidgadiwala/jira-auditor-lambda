const { getLastRunTime, updateLastRunTime, getCurrentTime } = require("./time");
const {
  getWorklogUpdates,
  getStatusTransitionUpdates,
  getProjectInfo,
  checkWorklogConditions,
  checkStatusTransitionConditions,
} = require("./jira");
const { sendEmail, logAlerts } = require("./email");
require("dotenv").config();

exports.handler = async (event, context) => {
  try {
    const lastRunTime = await getLastRunTime();
    const currentTime = getCurrentTime();

    console.log(`Last run time: ${lastRunTime.toISO()}`);
    console.log(`Current time: ${currentTime.toISO()}`);

    const worklogAlerts = await getWorklogUpdates(lastRunTime);
    const statusAlerts = await getStatusTransitionUpdates(lastRunTime);

    const allAlerts = [...worklogAlerts, ...statusAlerts];

    console.log("All Alerts", allAlerts);

    const alertsByProject = allAlerts.reduce((acc, alert) => {
      if (!acc[alert.projectKey]) {
        acc[alert.projectKey] = [];
      }
      acc[alert.projectKey].push(alert);
      return acc;
    }, {});

    if (Object.keys(alertsByProject).length > 0) {
      const projectAlertsMap = {};

      for (const [projectKey, alerts] of Object.entries(alertsByProject)) {
        const project = await getProjectInfo(projectKey);

        const leadEmail = project.leadEmail || process.env.SES_EMAIL_TO;
        if (!projectAlertsMap[leadEmail]) {
          projectAlertsMap[leadEmail] = {};
        }
        projectAlertsMap[leadEmail][projectKey] = {
          alerts,
          leadName: project.leadName,
          projectName: project.projectName,
        };
      }

      for (const leadEmail of Object.keys(projectAlertsMap)) {
        const alertsMap = projectAlertsMap[leadEmail];
        const emailContent = [];

        emailContent.push("<h1>Jira Audit Alerts</h1>");

        for (const [
          projectKey,
          { alerts, projectName, leadName },
        ] of Object.entries(alertsMap)) {
          const worklogCommentsMissing = alerts.filter(
            (alert) => alert.alertType === "worklogCommentMissing"
          ).length;
          const worklogExceeding16Hours = alerts.filter(
            (alert) => alert.alertType === "worklogExceeding16Hours"
          ).length;
          const storyPointsMissing = alerts.filter(
            (alert) => alert.alertType === "storyPointsMissing"
          ).length;
          const noDevelopmentLink = alerts.filter(
            (alert) => alert.alertType === "noDevelopmentLink"
          ).length;

          let summary = "";

          if (
            worklogCommentsMissing ||
            worklogExceeding16Hours ||
            storyPointsMissing ||
            noDevelopmentLink
          ) {
            summary += `<li>Project: ${projectName}</li>`;
            summary += `<li>Project Lead: ${leadName}</li>`;
            summary += `<ul>`;
            summary +=
              worklogCommentsMissing > 0
                ? `<li>Worklog comments missing: ${worklogCommentsMissing}</li>`
                : "";
            summary +=
              worklogExceeding16Hours > 0
                ? `<li>Worklog exceeding 16 hours: ${worklogExceeding16Hours}</li>`
                : "";
            summary +=
              storyPointsMissing > 0
                ? `<li>Story points missing: ${storyPointsMissing}</li>`
                : "";
            summary +=
              noDevelopmentLink > 0
                ? `<li>No development link: ${noDevelopmentLink}</li>`
                : "";
            summary += `</ul>`;
          }

          emailContent.push("<ul>");

          if (summary) {
            emailContent.push(summary);
          }

          alerts.forEach((alert) => {
            emailContent.push(`<li>${alert.alertMessage}</li>`);
          });
          emailContent.push("</ul>");
        }

        // emailContent.push("</ul>");

        // if (summary) {
        //   emailContent.unshift("<h2>Summary</h2><ul>" + summary + "</ul>");
        // }

        await sendEmail(emailContent.join("<br/>"), leadEmail);
      }
    }

    await updateLastRunTime(currentTime);

    return {
      statusCode: 200,
      body: JSON.stringify("Script executed successfully!"),
    };
  } catch (error) {
    console.error(error);
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
