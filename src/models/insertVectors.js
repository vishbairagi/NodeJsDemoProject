const axios = require("axios");
require("dotenv").config({ path: __dirname + "/../../.env" });

const COLLECTION_NAME = "my_collection";

const vectors = [
  { id: 1, vector: Array(1536).fill(0.1), payload: { text: "Hello world" } },
  { id: 2, vector: Array(1536).fill(0.2), payload: { text: "Another text" } },
];

async function insertVectors() {
  try {
    const url = `${process.env.QDRANT_URL}/collections/${COLLECTION_NAME}/points`;

    console.log("Using URL:", url);                    // ← debug
    console.log("API Key length:", process.env.QDRANT_API_KEY?.length || "missing!"); // ← debug

    const response = await axios.put(
      url,
      { points: vectors },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.QDRANT_API_KEY,       // ← important: "api-key"
        },
      }
    );

    console.log("Vectors inserted successfully!", response.data);
  } catch (err) {
    console.error("Error inserting vectors:");
    console.error("Status:", err.response?.status);
    console.error("Data:", err.response?.data);
    console.error("Message:", err.message);
  }
}

insertVectors();