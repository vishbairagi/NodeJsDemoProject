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

/* ================= SCHEMA ================= */
const Chat = mongoose.model(
  "Chat",
  new mongoose.Schema({
    prompt: String,
    response: String,
    domain: String,
    context: Object,
    createdAt: { type: Date, default: Date.now }
  })
);

/* ================= DUCKDUCKGO SEARCH ================= */
async function duckSearch(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const html = await res.text();
  const $ = cheerio.load(html);

  let results = [];

  $(".result").each((i, el) => {
    if (i >= 5) return;

    const title = $(el).find(".result__title a").text().trim();
    const rawLink = $(el).find(".result__title a").attr("href");
    const snippet = $(el).find(".result__snippet").text().trim();

    if (title && rawLink && snippet) {
      results.push({
        title,
        snippet,
        link: rawLink.startsWith("http")
          ? rawLink
          : `https://duckduckgo.com${rawLink}`
      });
    }
  });

  return results;
}



/* ================= TINYLLAMA CALL ================= */
async function askTinyLlama(prompt) {
  const response = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "tinyllama",
      prompt,
      stream: false
    })
  });

  const data = await response.json();
  return data.response;
}

/* ================= API 1: ASK ================= */
app.post("/ask", async (req, res) => {
  try {
    const { question, domain = "general" } = req.body;

    // 1. Web Search
    const webContext = await duckSearch(question);
if (webContext.length === 0) {
  return res.json({
    answer: "Information not found in the provided sources.",
    sources: [],
    context: []
  });
}

    // 2. Build Prompt
const prompt = `
You are a strict question-answering system.

RULES:
- Use ONLY the information from "Web Context"
- DO NOT use prior knowledge
- DO NOT guess or assume
- If the answer is not explicitly present, reply exactly:
  "Information not found in the provided sources."

Web Context:
${webContext.map(
  (r, i) => `[${i + 1}]
Title: ${r.title}
Summary: ${r.snippet}
Source: ${r.link}`
).join("\n\n")}

Question:
${question}

Answer (cite sources like [1], [2]):
`;



    // 3. LLM Call
    const answer = await askTinyLlama(prompt);

    // 4. Save to MongoDB
    const chat = await Chat.create({
      prompt: question,
      response: answer,
      domain,
      context: webContext
    });

    res.json({
      answer,
       sources: webContext.map(r => r.link),
  context: webContext,
  id: chat._id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/* ================= API 2: HISTORY ================= */
app.get("/history", async (req, res) => {
  const chats = await Chat.find().sort({ createdAt: -1 });
  res.json(chats);
});

/* ================= SERVER ================= */
app.listen(4000, () => {
  console.log("🚀 Server running on http://localhost:4000");
});
