const { generateEmbedding } = require("../services/embed.service");
const { searchVector, insertVector } = require("../services/vector.service");
const searchWeb = require("../services/search.service");
const { generateAnswer } = require("../services/llm.service");
const { extractBody } = require("../services/extract.service");

/* ======================================================
   🔹 Utility: Chunk Text for Better Vector Storage
====================================================== */
function chunkText(text, size = 800) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

async function askQuestion(req, res) {
  try {
    const { question } = req.body;

    /* ======================================================
       1️⃣ Validate Input
    ====================================================== */
    if (!question || question.trim().length < 3) {
      return res.status(400).json({
        error: "Question is required",
      });
    }

    console.log("📌 Question:", question);

    /* ======================================================
       2️⃣ Generate Query Embedding
    ====================================================== */
    const queryVector = await generateEmbedding(question);

    if (!queryVector || queryVector.length === 0) {
      throw new Error("Embedding generation failed");
    }

    console.log("🔢 Query vector length:", queryVector.length);

    /* ======================================================
       3️⃣ Search in Vector DB (Qdrant)
    ====================================================== */
    let results = [];

    try {
      results = await searchVector(queryVector);
      console.log("📊 Vector Results:", results);
    } catch (err) {
      console.log("⚠️ Qdrant search skipped:", err.message);
    }

    if (results && results.length > 0) {
      const topScore = results[0].score || 0;
      console.log("🎯 Top Similarity Score:", topScore);

      // 🔥 LOWERED THRESHOLD
      if (topScore > 0.45) {
        console.log("✅ Answer found in Vector DB");

        const context = results
          .map((r) => r.payload?.text || "")
          .join("\n")
          .slice(0, 4000); // limit context size

        const answer = await generateAnswer(question, context);

        return res.json({
          source: "vector_db",
          score: topScore,
          answer,
        });
      }
    }

    /* ======================================================
       4️⃣ Web Search Fallback
    ====================================================== */
    console.log("🌐 Searching web...");

const enhancedQuery = `${question} programming language`;
const urls = await searchWeb(enhancedQuery);

    if (!urls || urls.length === 0) {
      return res.json({
        source: "web_search",
        answer: "I don't know.",
      });
    }

    let context = "";
for (const url of urls) {
  try {
    const bodyText = await extractBody(url);

    if (!bodyText) continue;

    // ✅ FILTER IRRELEVANT CONTENT
    const lower = bodyText.toLowerCase();

    if (
      !lower.includes("programming") &&
      !lower.includes("software") &&
      !lower.includes("language")
    ) {
      console.log("⛔ Skipped irrelevant page:", url);
      continue;
    }

    if (bodyText.length > 800) {
      context = bodyText.slice(0, 4000);
      console.log("✅ Context extracted from:", url);
      break;
    }

  } catch (err) {
    console.log("⚠️ Extraction failed for:", url);
  }
}


    if (!context || context.length < 100) {
      return res.json({
        source: "web_search",
        answer: "I don't know.",
      });
    }

    /* ======================================================
       5️⃣ Generate Answer using LLM
    ====================================================== */
    const answer = await generateAnswer(question, context);

    /* ======================================================
       6️⃣ Store Context in Vector DB (Chunked)
    ====================================================== */
    try {
      const chunks = chunkText(context);

      for (const chunk of chunks) {
        if (chunk.length < 300) continue;

        const embedding = await generateEmbedding(chunk);

        if (embedding && embedding.length > 0) {
          await insertVector(embedding, chunk);
        }
      }

      console.log("✅ Stored chunks in Vector DB");
    } catch (err) {
      console.log("⚠️ Vector insert skipped:", err.message);
    }

    return res.json({
      source: "web_search",
      answer,
    });

  } catch (error) {
    console.log("==== FULL ERROR ====");
    console.log("Status:", error.response?.status);
    console.log("Data:", error.response?.data);
    console.log("Message:", error.message);
    console.log("====================");

    return res.status(500).json({
      error: error.response?.data || error.message,
    });
  }
}

module.exports = { askQuestion };
