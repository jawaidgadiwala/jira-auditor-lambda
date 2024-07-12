function isDebugMode() {
  return process.env.DEBUG_MODE === "true";
}

module.exports = { isDebugMode };
