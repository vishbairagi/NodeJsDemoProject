// ───────── Load environment variables ─────────
const dotenv = require("dotenv");
dotenv.config(); // MUST be first, before any access to process.env

const axios = require("axios");

const generateAnswer = async (question, context) => {
  // Debug logs to verify env is loaded
  console.log("OLLAMA_URL:", process.env.OLLAMA_URL);
  console.log("MODEL:", process.env.MODEL);

  if (!process.env.OLLAMA_URL) {
    throw new Error("OLLAMA_URL is not set");
  }

  const prompt = `
Answer the question using the context below.
If the answer is not in the context, say "I don't know".

Context:
${context}

Question:
${question}

Answer:
`;

  const response = await axios.post(
    `${process.env.OLLAMA_URL}/v1/completions`,
    {
      model: process.env.MODEL || "tinyllama",
      prompt,
      stream: false
    }
  );

  return response.data.choices[0].text.trim();
};

module.exports = { generateAnswer };
