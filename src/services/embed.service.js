const axios = require("axios");

async function generateEmbedding(text) {
console.log("EMBEDDING_URL2:", process.env.EMBEDDING_URL);
console.log("EMBED_MODEL2:", process.env.EMBED_MODEL);

  const response = await axios.post(
    process.env.EMBEDDING_URL,
    {
      model: process.env.EMBED_MODEL,
      prompt: text
    },
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

  return response.data.embedding;
}

module.exports = { generateEmbedding };
