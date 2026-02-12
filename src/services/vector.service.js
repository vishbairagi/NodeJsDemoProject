const client = require("../config/qdrant");
const { v4: uuidv4 } = require("uuid");

const COLLECTION = "my_collection2";
const VECTOR_SIZE = 768; // nomic-embed-text output size

// 🔥 Initialize collection (create if not exists)
async function initCollection() {
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some(
      (col) => col.name === COLLECTION
    );

    if (!exists) {
      console.log("🚀 Creating collection...");

      await client.createCollection(COLLECTION, {
        vectors: {
          size: 768,
          distance: "Cosine",
        },
      });

      console.log("✅ Collection created");
    } else {
      console.log("✅ Collection already exists");
    }
  } catch (error) {
    console.error("❌ Collection init error:", error.message);
  }
}


// 🔎 Search vector
async function searchVector(queryVector) {
  try {
    console.log("Vector length:", queryVector?.length);

    const result = await client.search(COLLECTION, {
      vector: queryVector,
      limit: 3,
      with_payload: true,
    });

    return result;
  } catch (error) {
    console.log("⚠️ First attempt failed, retrying...");

    // Retry once
    const result = await client.search(COLLECTION, {
      vector: queryVector,
      limit: 3,
      with_payload: true,
    });

    return result;
  }
}


// ➕ Insert vector
async function insertVector(vector, text) {
  try {
    await client.upsert(COLLECTION, {
      points: [
        {
          id: uuidv4(),
          vector: vector,   // ✅ Correct field (NOT vectors)
          payload: { text },
        },
      ],
    });

    console.log("✅ Vector inserted");
  } catch (error) {
    console.error("❌ Qdrant Insert Error:", error.message);
    throw error;
  }
}

module.exports = {
  initCollection,
  searchVector,
  insertVector,
};
