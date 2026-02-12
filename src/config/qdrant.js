require("dotenv").config({ path: __dirname + "/../../.env" });
const { QdrantClient } = require("@qdrant/js-client-rest");
  console.log("QDRANT_URL:", process.env.QDRANT_URL);
console.log("QDRANT_API_KEY:", process.env.QDRANT_API_KEY);

const client = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
  timeout: 30000,   // 🔥 increase to 30 seconds
    checkCompatibility: false,
});

module.exports = client;
