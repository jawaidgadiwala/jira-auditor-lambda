const axios = require("axios");
const { DateTime } = require("luxon");
const { getMinutesSinceLastRun, getTimeZone } = require("./time");
require("dotenv").config();

const { JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;

const jiraHeaders = {
  Authorization: `Basic ${Buffer.from(
    `${JIRA_EMAIL}:${JIRA_API_TOKEN}`
  ).toString("base64")}`,
  "Content-Type": "application/json",
};

async function getWorklogUpdates(lastRunTime) {
  try {
    const minutesSinceLastRun = getMinutesSinceLastRun(lastRunTime);
    const response = await axios.get(`${JIRA_URL}/rest/api/3/search`, {
      headers: jiraHeaders,
      params: {
        jql: `worklogDate >= "${minutesSinceLastRun}"`,
        fields:
          "summary,comment,worklog,status,project,parent,customfield_10049",
        expand: "changelog",
        maxResults: 1000,
      },
    });

    const issues = response.data.issues;

    const alerts = await checkWorklogConditions(issues, lastRunTime);
    return alerts;

    // const alerts = {};

    // issues.forEach((issue) => {
    //   const { key, fields } = issue;
    //   const { worklog, project } = fields;

    //   if (!alerts[project.key]) {
    //     alerts[project.key] = [];
    //   }

    //   const allWorklogs = worklog.worklogs || [];
    //   const totalTimeSpentSeconds = allWorklogs.reduce(
    //     (acc, log) => acc + log.timeSpentSeconds,
    //     0
    //   );

    //   allWorklogs.forEach((log) => {
    //     const logUpdated = DateTime.fromISO(log.updated).setZone(getTimeZone());
    //     if (logUpdated >= lastRunTime) {
    //       if (totalTimeSpentSeconds > 16 * 60 * 60) {
    //         alerts[project.key].push({
    //           projectKey: project.key,
    //           alertType: "worklogExceeding16Hours",
    //           issueKey: key,
    //           alertMessage: `Issue ${key} has total worklogs exceeding 16 hours.`,
    //         });
    //       }
    //       if (!log.comment) {
    //         alerts[project.key].push({
    //           projectKey: project.key,
    //           alertType: "worklogCommentMissing",
    //           issueKey: key,
    //           alertMessage: `Issue ${key} has a worklog without a comment.`,
    //         });
    //       }
    //     }
    //   });
    // });

    // return alerts;
  } catch (error) {
    console.error(
      "Error fetching Jira worklog updates:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function getStatusTransitionUpdates(lastRunTime) {
  try {
    const minutesSinceLastRun = getMinutesSinceLastRun(lastRunTime);
    const response = await axios.get(`${JIRA_URL}/rest/api/3/search`, {
      headers: jiraHeaders,
      params: {
        jql: `status changed to ("In Progress", "Done", "Ready for QA") after "${minutesSinceLastRun}"`, // Include "In Progress"
        fields: "summary,status,project,parent,customfield_10049",
        expand: "changelog",
        maxResults: 1000,
      },
    });

    const issues = response.data.issues;
    const alert = await checkStatusTransitionConditions(issues, lastRunTime);
    return alert;

    // const alerts = {};

    // issues.forEach((issue) => {
    //   const { key, fields } = issue;
    //   const {
    //     status,
    //     parent,
    //     project,
    //     customfield_10049: storyPoints,
    //   } = fields;

    //   if (!alerts[project.key]) {
    //     alerts[project.key] = [];
    //   }

    //   if (["In Progress", "Done", "Ready for QA"].includes(status.name)) {
    //     let hasDevelopment = fields.development
    //       ? fields.development.length > 0
    //       : false;

    //     if (!hasDevelopment && parent) {
    //       hasDevelopment = parent.fields.development
    //         ? parent.fields.development.length > 0
    //         : false;
    //     }

    //     if (!hasDevelopment) {
    //       alerts[project.key].push({
    //         projectKey: project.key,
    //         issueKey: key,
    //         alertType: "noDevelopmentLink",
    //         alertMessage: `Issue ${key} moved to ${status.name} without a linked branch, commit, or PR.`,
    //       });
    //     }

    //     if (!storyPoints) {
    //       alerts[project.key].push({
    //         projectKey: project.key,
    //         issueKey: key,
    //         alertType: "storyPointsMissing",
    //         alertMessage: `Issue ${key} moved to ${status.name} without story points.`,
    //       });
    //     }
    //   }
    // });

    // return alerts;
  } catch (error) {
    console.error(
      "Error fetching Jira status transitions:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function getProjectInfo(projectKey) {
  try {
    const projectResponse = await axios.get(
      `${JIRA_URL}/rest/api/3/project/${projectKey}`,
      {
        headers: jiraHeaders,
      }
    );
    const leadAccountId = projectResponse.data.lead.accountId;

    const userResponse = await axios.get(`${JIRA_URL}/rest/api/3/user`, {
      headers: jiraHeaders,
      params: {
        accountId: leadAccountId,
      },
    });

    return {
      leadEmail: userResponse.data.emailAddress,
      leadName: userResponse.data.displayName,
      projectName: projectResponse.data.name,
    };
  } catch (error) {
    console.error(
      "Error fetching project lead:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function getDevelopmentData(issueId) {
  try {
    const response = await axios.get(
      `${JIRA_URL}/rest/dev-status/latest/issue/summary`,
      {
        headers: jiraHeaders,
        params: {
          issueId: issueId,
        },
      }
    );
    return response.data.summary;
  } catch (error) {
    console.error(
      `Error fetching development data for issue ${issueId}:`,
      error.response ? error.response.data : error.message
    );
    return null; // Return null in case of error
  }
}

async function getAllWorklogs(issueId) {
  try {
    let allWorklogs = [];
    let startAt = 0;
    let maxResults = 100;

    while (true) {
      const response = await axios.get(
        `${JIRA_URL}/rest/api/3/issue/${issueId}/worklog`,
        {
          headers: jiraHeaders,
          params: {
            startAt,
            maxResults,
          },
        }
      );
      allWorklogs = allWorklogs.concat(response.data.worklogs);
      if (
        response.data.startAt + response.data.maxResults >=
        response.data.total
      ) {
        break;
      }
      startAt += maxResults;
    }

    return allWorklogs;
  } catch (error) {
    console.error(
      `Error fetching all worklogs for issue ${issueId}:`,
      error.response ? error.response.data : error.message
    );
    return []; // Return empty array in case of error
  }
}

async function checkStatusTransitionConditions(issues) {
  const alerts = [];
  console.log("Checking status conditions...");

  for (const issue of issues) {
    const { id, key, fields } = issue;
    const { status, parent, customfield_10049: storyPoints, project } = fields;

    console.log(`Processing issue ${key} with status ${status.name}...`);

    if (["In Progress", "Done", "Ready for QA"].includes(status.name)) {
      let developmentData = await getDevelopmentData(id);
      let hasDevelopment = developmentData?.branch?.overall?.count > 0;

      if (!hasDevelopment && parent) {
        console.log(`Fetching parent issue development data for ${key}...`);
        const parentDevelopmentData = await getDevelopmentData(parent.id);
        if (parentDevelopmentData?.branch?.overall?.count > 0) {
          hasDevelopment = true;
        }
      }

      if (!hasDevelopment) {
        alerts.push({
          projectKey: project.key,
          issueKey: key,
          alertType: "noDevelopmentLink",
          alertMessage: `Issue ${key} moved to ${status.name} without a linked branch, commit, or PR.`,
        });
      }

      if (!storyPoints) {
        alerts.push({
          projectKey: project.key,
          issueKey: key,
          alertType: "storyPointsMissing",
          alertMessage: `Issue ${key} moved to ${status.name} without story points.`,
        });
      }
    }
  }

  // console.log("Status condition checks complete. Alerts:", alerts);
  return alerts;
}

async function checkWorklogConditions(issues, lastRunTime) {
  const alerts = [];
  console.log("Checking worklog conditions...");

  for (const issue of issues) {
    const { id, key, fields } = issue;
    const { worklog, project } = fields;

    console.log(`Processing issue ${key} with worklogs...`);

    const allWorklogs = await getAllWorklogs(id);
    const totalTimeSpentSeconds = allWorklogs.reduce(
      (acc, log) => acc + log.timeSpentSeconds,
      0
    );

    (worklog.worklogs || []).forEach((log) => {
      const logUpdated = DateTime.fromISO(log.updated).setZone(getTimeZone());
      if (logUpdated >= lastRunTime) {
        if (totalTimeSpentSeconds > 16 * 60 * 60) {
          alerts.push({
            projectKey: project.key,
            issueKey: key,
            alertType: "worklogExceeding16Hours",
            alertMessage: `Issue ${key} has total worklogs exceeding 16 hours.`,
          });
        }

        if (!log.comment) {
          alerts.push({
            projectKey: project.key,
            issueKey: key,
            alertType: "worklogCommentMissing",
            alertMessage: `Issue ${key} has a worklog without a comment.`,
          });
        }
      }
    });
  }

  // console.log("Worklog condworklogAlertsition checks complete. Alerts:", alerts);
  return alerts;
}

module.exports = {
  getWorklogUpdates,
  getStatusTransitionUpdates,
  getProjectInfo,
  getDevelopmentData,
  checkWorklogConditions,
  checkStatusTransitionConditions,
};
