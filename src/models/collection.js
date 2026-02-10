require("dotenv").config(); // <- must be first

const client = require("./qdrant.js");

async function createCollection() {
  try {
    await client.recreateCollection("my_collection", {
      vectors: { size: 1536, distance: "Cosine" },
    });
    console.log("Collection created!");
  } catch (err) {
    console.error("Error creating collection:", err);
  }
}

createCollection();
