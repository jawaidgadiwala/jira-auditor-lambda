const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { DateTime } = require("luxon");
const fs = require("fs").promises;
require("dotenv").config();
const { isDebugMode } = require("./utils");

const { S3_BUCKET, S3_KEY, AWS_REGION } = process.env;

const s3Client = new S3Client({ region: AWS_REGION });

function getTimeZone() {
  const { JIRA_TIMEZONE } = process.env;
  return JIRA_TIMEZONE;
}
function getCurrentTime() {
  return DateTime.now().setZone(getTimeZone());
}

async function getLastRunTime() {
  let lastRunTime = null;

  let data = "";

  try {
    if (isDebugMode()) {
      data = await fs.readFile(S3_KEY, "utf8");
    } else {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: S3_KEY,
      });
      const response = await s3Client.send(command);
      data = await streamToString(response.Body);
    }
  } catch (err) {
    console.error("Error reading last run time:", err);
  }

  try {
    const jsonData = JSON.parse(data);
    lastRunTime = DateTime.fromISO(jsonData.last_run, {
      zone: getTimeZone(),
    });
  } catch (error) {
    //Set Default Value
    lastRunTime = DateTime.now().minus({ hours: 1 }).setZone(getTimeZone());

    console.error("Error parsing last run time:", error);
  }
  return lastRunTime;
}

async function updateLastRunTime(currentTime) {
  const body = JSON.stringify({ last_run: currentTime.toISO() });

  if (isDebugMode()) {
    await fs.writeFile(S3_KEY, body, "utf8");
  } else {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: S3_KEY,
      Body: body,
    });
    await s3Client.send(command);
  }
}

function getMinutesSinceLastRun(lastRunTime = null) {
  const currentTime = getCurrentTime();

  if (lastRunTime == null) {
    lastRunTime = getLastRunTime();
  }
  const minutesSinceLastRun = Math.round(
    (currentTime.toMillis() - lastRunTime.toMillis()) / 60000
  );

  const formattedDate = `-${minutesSinceLastRun}m`;

  return formattedDate;
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

module.exports = {
  getCurrentTime,
  getLastRunTime,
  updateLastRunTime,
  getMinutesSinceLastRun,
};
