require("dotenv").config({ path: __dirname + "/../../.env" });
const { QdrantClient } = require("@qdrant/js-client-rest");
  console.log("QDRANT_API_KEY:", process.env.QDRANT_API_KEY);
  console.log("OLLAMA_URL:", process.env.QDRANT_URL);
const client = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
  timeout: 5000,
    checkCompatibility: false,
});

module.exports = client;
