const client = require("../models/qdrant.js");

async function searchVector(queryVector) {
  try {
    const result = await client.searchPoints("my_collection", {
      vector: queryVector,
      limit: 5,
    });
    return result;
  } catch (err) {
    console.error("Error searching vectors:", err);
    return [];
  }
}
