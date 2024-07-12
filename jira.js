const axios = require("axios");
const { DateTime } = require("luxon");
require("dotenv").config();

const { JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;

const jiraHeaders = {
  Authorization: `Basic ${Buffer.from(
    `${JIRA_EMAIL}:${JIRA_API_TOKEN}`
  ).toString("base64")}`,
  "Content-Type": "application/json",
};

async function getWorklogUpdates(updatedSince) {
  try {
    const minutesSinceLastRun = Math.round(
      (DateTime.utc().toMillis() - DateTime.fromISO(updatedSince).toMillis()) /
        60000
    );
    const formattedDate = `-${minutesSinceLastRun}m`;
    console.log(`Fetching worklog updates since: ${formattedDate}`);

    const response = await axios.get(`${JIRA_URL}/rest/api/3/search`, {
      headers: jiraHeaders,
      params: {
        jql: `worklogDate >= "${formattedDate}"`,
        fields: "summary,comment,worklog,status,development",
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

async function getStatusTransitions(updatedSince) {
  try {
    const minutesSinceLastRun = Math.round(
      (DateTime.utc().toMillis() - DateTime.fromISO(updatedSince).toMillis()) /
        60000
    );
    const formattedDate = `-${minutesSinceLastRun}m`;
    console.log(`Fetching status transitions since: ${formattedDate}`);

    const response = await axios.get(`${JIRA_URL}/rest/api/3/search`, {
      headers: jiraHeaders,
      params: {
        jql: `status changed to ("Done", "Ready for QA") after "${formattedDate}"`,
        fields: "summary,status,development",
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

function checkWorklogConditions(issues, updatedSince) {
  const alerts = [];
  const updatedSinceDateTime = DateTime.fromISO(updatedSince);

  issues.forEach((issue) => {
    const { key, fields } = issue;
    const { worklog } = fields;

    (worklog.worklogs || []).forEach((log) => {
      const logUpdated = DateTime.fromISO(log.updated);

      if (logUpdated >= updatedSinceDateTime) {
        if (!log.comment) {
          alerts.push(`Issue ${key} has a worklog without a comment.`);
        }

        if (log.timeSpentSeconds > 57600) {
          // 16 hours in seconds
          alerts.push(`Issue ${key} has a worklog exceeding 16 hours.`);
        }
      }
    });
  });

  return alerts;
}

function checkStatusConditions(issues) {
  const alerts = [];
  issues.forEach((issue) => {
    const { key, fields } = issue;
    const { status, development } = fields;

    if (["Done", "Ready for QA"].includes(status.name) && !development) {
      alerts.push(
        `Issue ${key} moved to ${status.name} without a linked branch, commit, or PR.`
      );
    }
  });
  return alerts;
}

module.exports = {
  getWorklogUpdates,
  getStatusTransitions,
  checkWorklogConditions,
  checkStatusConditions,
};
