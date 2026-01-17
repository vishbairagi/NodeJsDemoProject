import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import mongoose from "mongoose";
import crypto from "crypto";

const app = express();
app.use(express.json());

/* ================= MODELS ================= */
const CHAT_MODEL = "tinyllama";
const EMBED_MODEL = "nomic-embed-text";

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
    sessionId: String,
    prompt: String,
    response: String,
    followUps: [String],
    domain: String,
    sources: [String]
  },
  { timestamps: true }
);

const UrlChunk = mongoose.model("UrlChunk", UrlChunkSchema);
const Chat = mongoose.model("Chat", ChatSchema);

/* ================= HELPERS ================= */
function isMathQuestion(q) {
  return /[\+\-\*\/\^]/.test(q);
}

/* ================= DUCKDUCKGO SEARCH ================= */
async function duckSearch(query) {
  try {
    console.log("🔍 DuckDuckGo search:", query);

    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];

    $(".result").each((i, el) => {
      if (i >= 5) return;

      const title = $(el).find(".result__title").text().trim();
      const snippet = $(el).find(".result__snippet").text().trim();
      const link = $(el).find("a").attr("href");

      if (title && snippet && link) {
        results.push({ title, snippet, link });
      }
    });

    return results;
  } catch (err) {
    console.error("❌ Search failed:", err.message);
    return [];
  }
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
    console.log("🌐 Fetching:", url);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    $("script, style, nav, header, footer, aside, noscript").remove();

    const text = $("p")
      .map((i, el) => $(el).text())
      .get()
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return text.length > 300 ? text : null;
  } catch {
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
  return chunks;
}

/* ================= EMBEDDINGS ================= */
async function getEmbedding(text) {
  const res = await fetch("http://127.0.0.1:11434/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBED_MODEL,
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
  const res = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  return data.choices[0].message.content;
}

/* ================= FOLLOW UPS ================= */
async function generateFollowUps(question, answer) {
  const prompt = `
Generate exactly 4 relevant follow-up questions.
One per line.
No numbering.
Do not repeat the original question.

Question:
${question}

Answer:
${answer}
`;

  const res = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  return data.choices[0].message.content
    .split("\n")
    .map(q => q.trim())
    .filter(q => q.endsWith("?"))
    .slice(0, 4);
}

/* ================= ASK API ================= */
app.post("/ask", async (req, res) => {
  const { question, sessionId } = req.body;
  if (!question) return res.status(400).json({ error: "Question required" });

  const activeSession = sessionId || crypto.randomUUID();
  console.log("❓ Question:", question);

  /* ===== MATH ===== */
  if (isMathQuestion(question)) {
    const answer = await askTinyLlama(
      `Solve step by step:\n${question}`
    );

    await Chat.create({
      sessionId: activeSession,
      prompt: question,
      response: answer,
      followUps: [],
      domain: "math-direct",
      sources: []
    });

    return res.json({ sessionId: activeSession, answer });
  }

  /* ===== RAG ===== */
  const searchResults = await duckSearch(question);
  const questionEmbedding = await getEmbedding(question);
  let scoredChunks = [];

  for (const r of searchResults) {
    const url = normalizeDuckLink(r.link);
    if (!url) continue;

    const text = await extractWebsiteContent(url);
    if (!text) continue;

    const chunks = chunkText(text).slice(0, 2);

    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      if (!embedding) continue;

      const score = cosineSimilarity(questionEmbedding, embedding);
      if (score > 0.25) {
        scoredChunks.push({ text: chunk, score, source: url });
        await UrlChunk.create({ url, content: chunk, embedding });
      }
    }
  }

  if (!scoredChunks.length) {
    return res.json({ answer: "Information not found.", followUps: [] });
  }

  scoredChunks.sort((a, b) => b.score - a.score);
  const topChunks = scoredChunks.slice(0, 1);

  const prompt = `
You are a factual assistant.

Rules:
- Use ONLY the context.
- Do NOT add external knowledge.
- If missing, say "Not mentioned in the sources".
- Be concise.

Context:
${topChunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")}

Question:
${question}

Answer:
`;

  const answer = await askTinyLlama(prompt);
  const followUps = await generateFollowUps(question, answer);
  const sources = [...new Set(topChunks.map(c => c.source))];

  await Chat.create({
    sessionId: activeSession,
    prompt: question,
    response: answer,
    followUps,
    domain: "rag-url",
    sources
  });

  res.json({ sessionId: activeSession, answer, sources, followUps });
});

/* ================= HISTORY ================= */
app.get("/history", async (req, res) => {
  const chats = await Chat.find().sort({ createdAt: -1 });
  res.json(chats);
});

/* ================= SERVER ================= */
app.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
});
