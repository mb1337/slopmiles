const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const baseConfig = require("./app.json").expo;

module.exports = () => ({
  ...baseConfig,
  extra: {
    ...baseConfig.extra,
    convexUrl: process.env.CONVEX_URL || "",
  },
});
