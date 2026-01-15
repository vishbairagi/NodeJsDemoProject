import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import mongoose from "mongoose";
import crypto from "crypto";

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
    sessionId: String,          // 🔹 session memory
    prompt: String,
    response: String,
    followUps: [String],        // 🔹 suggested questions
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
  } catch {
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

/* ================= FOLLOW-UP GENERATION ================= */
async function generateFollowUps(question, answer) {
  console.log("🔁 Generating follow-up questions");

  const prompt = `
Suggest 4 deep research follow-up questions.
Return ONLY a JSON array of strings.

Question: ${question}
Answer: ${answer}
`;

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

  console.log("🧪 Raw follow-up output:", data.choices[0].message.content);

  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    console.log("⚠️ Follow-up JSON parse failed");
    return [];
  }
}

/* ================= ASK API ================= */
app.post("/ask", async (req, res) => {
  const { question, sessionId } = req.body;
  if (!question) return res.status(400).json({ error: "Question required" });

  const activeSession = sessionId || crypto.randomUUID();

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

        await UrlChunk.create({ url, content: chunk, embedding });
        console.log("💾 Chunk saved to MongoDB");
      }
    }
  }

  if (!scoredChunks.length) {
    return res.json({ answer: "Information not found." });
  }

  scoredChunks.sort((a, b) => b.score - a.score);
  const topChunks = scoredChunks.slice(0, 5);

  const prompt = `
Use ONLY the context below.

${topChunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")}

Question: ${question}
Answer:
`;

  const answer = await askTinyLlama(prompt);
  const sources = [...new Set(topChunks.map(c => c.source))];
  const followUps = await generateFollowUps(question, answer);

  await Chat.create({
    sessionId: activeSession,
    prompt: question,
    response: answer,
    followUps,
    domain: "rag-url",
    sources
  });

  console.log("💬 Chat saved");

  res.json({ sessionId: activeSession, answer, sources, followUps });
});

/* ================= DEEP RESEARCH API ================= */
app.post("/deep-research", async (req, res) => {
  const { sessionId, followUpQuestion } = req.body;

  console.log("🔬 Deep research:", followUpQuestion);

  const history = await Chat.find({ sessionId }).sort({ createdAt: 1 });

  const context = history
    .map(h => `Q: ${h.prompt}\nA: ${h.response}`)
    .join("\n\n");

  const prompt = `
You are doing deep research.

Context:
${context}

New Question:
${followUpQuestion}

Answer:
`;

  const answer = await askTinyLlama(prompt);
  const followUps = await generateFollowUps(followUpQuestion, answer);

  await Chat.create({
    sessionId,
    prompt: followUpQuestion,
    response: answer,
    followUps,
    domain: "rag-deep"
  });

  res.json({ answer, followUps });
});

/* ================= HISTORY API ================= */
app.get("/history", async (req, res) => {
  console.log("📜 Fetching chat history");
  const chats = await Chat.find().sort({ createdAt: -1 });
  res.json(chats);
});

/* ================= SERVER ================= */
app.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:4000");
});
