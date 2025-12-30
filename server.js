import express from "express";
import fetch from "node-fetch";
import mongoose from "mongoose";
import Chat from "./models/Chat.js";

const app = express();
app.use(express.json());

/* ---------------- MongoDB ---------------- */
mongoose.connect("mongodb://127.0.0.1:27017/genai");

mongoose.connection.once("open", () => {
  console.log("✅ MongoDB Connected");
});

/* ---------- REAL-TIME CONTEXT ---------- */
function getRealtimeContext() {
  return {
    date: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

/* ---------- MCP CALL (NO SDK) ---------- */
async function callMCPTool(method, params) {
  const res = await fetch("http://localhost:5001/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: Date.now()
    })
  });

  const data = await res.json();
  return data?.result?.content?.[0]?.text || "";
}


/* ---------------- CHAT API ---------------- */
app.post("/ask", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt required" });

  const realtimeContext = getRealtimeContext();

  /* -------- DOMAIN-TUNED PROMPT (NEWS) -------- */
  const systemPrompt = `
You are a professional NEWS AI assistant.

Knowledge rules:
- Focus on current world news, technology, politics, economy
- Answer like ChatGPT
- Be factual and structured
- Use Mermaid.js diagrams ONLY if helpful
- Mermaid output must be valid

Context:
Date: ${realtimeContext.date}
Timezone: ${realtimeContext.timezone}

User question:
${prompt}
`;

  try {
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tinyllama:latest",
        prompt: systemPrompt,
        stream: false,
        options: {
    temperature: 1.0,     // factual
    top_p: 0.9,
    num_ctx: 4096,        // longer reasoning
    repeat_penalty: 1.1
  }
      })
    });

    const data = await response.json();
    const answer = data.response;

    /* -------- Save NEW DOCUMENT -------- */
    const chat = await Chat.create({
      prompt,
      response: answer,
      domain: "news",
      context: realtimeContext
    });

    res.json({
      id: chat._id,
      answer
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- FETCH HISTORY ---------------- */
app.get("/history", async (req, res) => {
  const chats = await Chat.find().sort({ createdAt: -1 });
  res.json(chats);
});

/* ---------------- START SERVER ---------------- */
app.listen(4000, () =>
  console.log("🚀 Server running at http://localhost:3000")
);
