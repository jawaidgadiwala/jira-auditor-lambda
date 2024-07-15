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
      const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: S3_KEY });
      const response = await s3Client.send(command);
      const body = await streamToString(response.Body);
      const lastRunTime = JSON.parse(body);
      return DateTime.fromISO(lastRunTime.last_run);
    } catch (err) {
      if (err.name === "NoSuchKey") {
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
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: S3_KEY,
      Body: body,
    });
    await s3Client.send(command);
  }
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

module.exports = { getLastRunTime, updateLastRunTime };
