import express from "express";
import fetch from "node-fetch";
import mongoose from "mongoose";
import * as cheerio from "cheerio";
import { Chat, UrlContent } from "./models/Chat.js";

/* ================= APP ================= */
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


/* ================= MONGODB ================= */
mongoose.connect("mongodb://127.0.0.1:27017/genai");

mongoose.connection.once("open", () => {
  console.log("✅ MongoDB Connected");
});

/* ================= REAL-TIME CONTEXT ================= */
function getRealtimeContext() {
  return {
    date: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

/* ================= WEBSITE FETCH ================= */
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

    const doc = await UrlContent.create({
      url,
      content: text.slice(0, 12000) // keep context small
    });

    res.json({
      message: "✅ URL content stored",
      urlId: doc._id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= ASK FROM URL ================= */
app.post("/ask-from-url", async (req, res) => {
  const { urlId, question } = req.body;

  if (!urlId || !question) {
    return res.status(400).json({ error: "urlId & question required" });
  }

  const doc = await UrlContent.findById(urlId);
  if (!doc) return res.status(404).json({ error: "URL not found" });

  const realtimeContext = getRealtimeContext();

  const systemPrompt = `
You are an AI assistant.
Answer ONLY using the website content below.
If the answer is not present, say:
"Not available in the provided website."

Website URL:
${doc.url}

Website Content:
${doc.content}

Date: ${realtimeContext.date}
Timezone: ${realtimeContext.timezone}
`;

  try {
    const response = await fetch(
      "http://127.0.0.1:11434/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "tinyllama",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question }
          ],
          stream: false,
          options: {
            temperature: 0.3,
            num_ctx: 4096
          }
        })
      }
    );

    const data = await response.json();
    const answer = data.choices[0].message.content;

    await Chat.create({
      prompt: question,
      response: answer,
      domain: "url-based",
      context: {
        url: doc.url
      }
    });

    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= FETCH CHAT HISTORY ================= */
app.get("/history", async (req, res) => {
  const chats = await Chat.find().sort({ createdAt: -1 });
  res.json(chats);
});

/* ================= START SERVER ================= */
app.listen(4000, () => {
  console.log("🚀 Server running at http://localhost:4000");
});
