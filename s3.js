const AWS = require("aws-sdk");
const { DateTime } = require("luxon");
const fs = require("fs").promises;
require("dotenv").config();
const { isDebugMode } = require("./utils");

const { S3_BUCKET, S3_KEY } = process.env;

const s3 = new AWS.S3();

async function getLastRunTime() {
  if (isDebugMode()) {
    try {
      const data = await fs.readFile(S3_KEY, "utf8");
      const lastRunTime = JSON.parse(data);
      return DateTime.fromISO(lastRunTime.last_run);
    } catch (err) {
      return DateTime.utc().minus({ hours: 1 });
    }
  } else {
    try {
      const response = await s3
        .getObject({ Bucket: S3_BUCKET, Key: S3_KEY })
        .promise();
      const lastRunTime = JSON.parse(response.Body.toString());
      return DateTime.fromISO(lastRunTime.last_run);
    } catch (err) {
      if (err.code === "NoSuchKey") {
        return DateTime.utc().minus({ hours: 1 });
      }
      throw err;
    }
  }
}

async function updateLastRunTime(currentTime) {
  const body = JSON.stringify({ last_run: currentTime.toISO() });
  if (isDebugMode()) {
    await fs.writeFile(S3_KEY, body, "utf8");
  } else {
    await s3
      .putObject({ Bucket: S3_BUCKET, Key: S3_KEY, Body: body })
      .promise();
  }
}

module.exports = { getLastRunTime, updateLastRunTime };
