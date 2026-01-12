import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import mongoose from "mongoose";

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
    sources: [String]
  },
  { timestamps: true }
);

const UrlChunk = mongoose.model("UrlChunk", UrlChunkSchema);
const Chat = mongoose.model("Chat", ChatSchema);

/* ================= DUCKDUCKGO SEARCH ================= */
async function duckSearch(query) {
  console.log("🔍 DuckDuckGo search:", query);

  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const html = await res.text();
  const $ = cheerio.load(html);
  const results = [];

  $(".result").each((i, el) => {
    if (i >= 7) return;

    const title = $(el).find(".result__title").text().trim();
    const snippet = $(el).find(".result__snippet").text().trim();
    const link = $(el).find("a").attr("href");

    if (title && snippet && link) {
      results.push({ title, snippet, link });
    }
  });

  console.log("🔍 Search results found:", results.length);
  return results;
}

function normalizeDuckLink(link) {
  if (!link) return null;

  if (link.startsWith("//")) link = "https:" + link;

  if (link.includes("duckduckgo.com/l/?uddg=")) {
    const urlParam = new URL(link).searchParams.get("uddg");
    if (urlParam) return decodeURIComponent(urlParam);
  }

  return link;
}

/* ================= WEBSITE EXTRACTION ================= */
async function extractWebsiteContent(url) {
  try {
    console.log("🌐 Fetching website:", url);

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow"
    });

    if (!res.ok) {
      console.log("❌ Failed to fetch:", url);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    $("script, style, nav, header, footer, aside, noscript").remove();

    const text = $("body").text().replace(/\s+/g, " ").trim();
    console.log("📄 Extracted length:", text.length);

    return text.length > 300 ? text : null;
  } catch (err) {
    console.error("❌ Fetch failed:", url);
    return null;
  }
}

/* ================= CHUNKING ================= */
function chunkText(text, size = 500, overlap = 100) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size - overlap) {
    const chunk = text.slice(i, i + size);
    if (chunk.length > 200) chunks.push(chunk);
  }
  console.log("✂️ Total chunks:", chunks.length);
  return chunks;
}

/* ================= EMBEDDINGS ================= */
async function getEmbedding(text) {
  const res = await fetch("http://127.0.0.1:11434/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "nomic-embed-text",
      input: text
    })
  });

  const data = await res.json();
  return data?.data?.[0]?.embedding || null;
}

/* ================= COSINE SIMILARITY ================= */
function cosineSimilarity(a, b) {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / (magA * magB);
}

/* ================= LLM ================= */
async function askTinyLlama(prompt) {
  console.log("🤖 Asking TinyLlama");

  const res = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "tinyllama",
      messages: [{ role: "user", content: prompt }],
      stream: false
    })
  });

  const data = await res.json();
  return data.choices[0].message.content;
}

/* ================= ASK API ================= */
app.post("/ask", async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "Question required" });

  console.log("❓ Question received:", question);

  const searchResults = await duckSearch(question);
  const questionEmbedding = await getEmbedding(question);

  let scoredChunks = [];

  for (const r of searchResults) {
    const url = normalizeDuckLink(r.link);
    console.log("🌐 Normalized URL:", url);

    const text = await extractWebsiteContent(url);
    if (!text) continue;

    const chunks = chunkText(text).slice(0, 4);

    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      if (!embedding) continue;

      const score = cosineSimilarity(questionEmbedding, embedding);

      if (score > 0.25) {
        console.log("✅ Relevant chunk score:", score.toFixed(3));

        scoredChunks.push({ text: chunk, score, source: url });

        // ✅ Save chunk in MongoDB
        await UrlChunk.create({
          url,
          content: chunk,
          embedding
        });

        console.log("💾 Chunk saved to MongoDB");
      }
    }
  }

  console.log("📊 Total scored chunks:", scoredChunks.length);

  if (!scoredChunks.length) {
    return res.json({ answer: "Information not found." });
  }

  scoredChunks.sort((a, b) => b.score - a.score);
  const topChunks = scoredChunks.slice(0, 5);

  const prompt = `
Use ONLY the context below. Do NOT guess.

Context:
${topChunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")}

Question:
${question}

Answer:
`;

  const answer = await askTinyLlama(prompt);
  const sources = [...new Set(topChunks.map(c => c.source))];

  // ✅ Save chat history
  await Chat.create({
    prompt: question,
    response: answer,
    domain: "rag-url",
    sources
  });

  console.log("💬 Chat saved");

  res.json({ answer, sources });
});

/* ================= HISTORY API ================= */
app.get("/history", async (req, res) => {
  console.log("📜 Fetching chat history");

  const chats = await Chat.find().sort({ createdAt: -1 });
  res.json(chats);
});

/* ================= SERVER ================= */
app.listen(4000, () => {
  console.log("🚀 Server running on http://localhost:4000");
});
