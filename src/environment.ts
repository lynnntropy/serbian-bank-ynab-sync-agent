export default {
  isProduction: process.env.NODE_ENV === "production",
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
};
