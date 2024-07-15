const axios = require("axios");
const { DateTime } = require("luxon");
const { getMinutesSinceLastRun } = require("./time");
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
        fields: "summary,comment,worklog,status,project,parent",
        expand: "changelog",
        maxResults: 1000,
      },
    });

    return response.data.issues;
  } catch (error) {
    console.error(
      "Error fetching Jira worklog updates:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function getStatusTransitions(lastRunTime) {
  try {
    const minutesSinceLastRun = getMinutesSinceLastRun(lastRunTime);
    const response = await axios.get(`${JIRA_URL}/rest/api/3/search`, {
      headers: jiraHeaders,
      params: {
        jql: `status changed to ("Done", "Ready for QA") after "${minutesSinceLastRun}"`,
        fields: "summary,status,project,parent",
        expand: "changelog",
        maxResults: 1000,
      },
    });

    return response.data.issues;
  } catch (error) {
    console.error(
      "Error fetching Jira status transitions:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function getProjectLead(projectKey) {
  try {
    const response = await axios.get(
      `${JIRA_URL}/rest/api/3/project/${projectKey}`,
      {
        headers: jiraHeaders,
      }
    );
    return response.data.lead.emailAddress;
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

async function checkStatusConditions(issues) {
  const alerts = [];
  console.log("Checking status conditions...");

  for (const issue of issues) {
    const { id, key, fields } = issue;
    const { status, parent } = fields;

    console.log(`Processing issue ${key} with status ${status.name}...`);

    if (["Done", "Ready for QA"].includes(status.name)) {
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
        alerts.push(
          `Issue ${key} moved to ${status.name} without a linked branch, commit, or PR.`
        );
      }
    }
  }

  console.log("Status condition checks complete. Alerts:", alerts);
  return alerts;
}

async function checkWorklogConditions(issues, lastRunTime) {
  const alerts = [];
  console.log("Checking worklog conditions...");

  for (const issue of issues) {
    const { id, key, fields } = issue;
    const { worklog } = fields;

    console.log(`Processing issue ${key} with worklogs...`);

    const allWorklogs = await getAllWorklogs(id);
    const totalTimeSpentSeconds = allWorklogs.reduce(
      (acc, log) => acc + log.timeSpentSeconds,
      0
    );

    (worklog.worklogs || []).forEach((log) => {
      const logUpdated = DateTime.fromISO(log.updated);
      if (logUpdated >= lastRunTime) {
        if (totalTimeSpentSeconds > 16 * 60 * 60) {
          alerts.push(`Issue ${key} has total worklogs exceeding 16 hours.`);
        }

        if (!log.comment) {
          alerts.push(`Issue ${key} has a worklog without a comment.`);
        }
      }
    });
  }

  console.log("Worklog condition checks complete. Alerts:", alerts);
  return alerts;
}

module.exports = {
  getWorklogUpdates,
  getStatusTransitions,
  getProjectLead,
  getDevelopmentData,
  checkWorklogConditions,
  checkStatusConditions,
};
