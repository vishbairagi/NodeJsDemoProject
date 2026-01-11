import express from "express";
import fetch from "node-fetch";
import mongoose from "mongoose";
import * as cheerio from "cheerio";

/* ================= APP ================= */
const app = express();
app.use(express.json());

/* ================= MONGODB ================= */
mongoose.connect("mongodb://127.0.0.1:27017/genai");

mongoose.connection.once("open", () => {
  console.log("✅ MongoDB Connected");
});

/* ================= SCHEMAS ================= */
const UrlChunkSchema = new mongoose.Schema(
  {
    url: String,
    content: String,
    embedding: [Number]
  },
  { timestamps: true }
);

const ChatSchema = new mongoose.Schema(
  {
    prompt: String,
    response: String,
    domain: String,
    context: Object
  },
  { timestamps: true }
);

const UrlChunk = mongoose.model("UrlChunk", UrlChunkSchema);
const Chat = mongoose.model("Chat", ChatSchema);

/* ================= HELPERS ================= */
function chunkText(text, size = 500, overlap = 100) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + size));
    start += size - overlap;
  }
  return chunks;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length !== b.length) return 0;

  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/* ================= EMBEDDINGS ================= */
async function getEmbedding(text) {
  try {
    const res = await fetch("http://127.0.0.1:11434/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text",
        input: text   // MUST be 'input'
      })
    });

    const data = await res.json();
    const embedding = data?.data?.[0]?.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      console.error("❌ Embedding response invalid:", data);
      return null;
    }
    return embedding;
  } catch (err) {
    console.error("❌ Embedding request failed:", err);
    return null;
  }
}

/* ================= SCRAPER ================= */
async function fetchWebsiteText(url) {
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, noscript").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

/* ================= ADD URL ================= */
app.post("/add-url", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });

  try {
    const text = await fetchWebsiteText(url);
    const chunks = chunkText(text);

    await UrlChunk.deleteMany({ url });

    let stored = 0;
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      if (!embedding) continue;

      await UrlChunk.create({ url, content: chunk, embedding });
      stored++;
    }

    res.json({ message: "✅ URL indexed using RAG", chunks: stored });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= ASK FROM URL ================= */
app.post("/ask-from-url", async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "Question required" });

  try {
    const qEmbedding = await getEmbedding(question);
    if (!qEmbedding) return res.json({ answer: "Failed to generate question embedding." });

    const chunks = await UrlChunk.find();
    const scored = [];

    for (const c of chunks) {
      if (!Array.isArray(c.embedding)) continue;
      const score = cosineSimilarity(qEmbedding, c.embedding);
      scored.push({ content: c.content, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 4);

    if (top.length === 0) return res.json({ answer: "Not available in the provided website." });

    const context = top.map(t => t.content).join("\n\n");
    const prompt = `
Answer ONLY using the context below.
If not found, say "Not available in the provided website."

Context:
${context}

Question:
${question}
`;

    const response = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tinyllama",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3
      })
    });

    const data = await response.json();
    const answer = data.choices[0].message.content;

    await Chat.create({
      prompt: question,
      response: answer,
      domain: "rag-url",
      context: { chunksUsed: top.length }
    });

    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= HISTORY ================= */
app.get("/history", async (req, res) => {
  const chats = await Chat.find().sort({ createdAt: -1 });
  res.json(chats);
});

/* ================= START ================= */
app.listen(4000, () => {
  console.log("🚀 RAG Server running at http://localhost:4000");
});
