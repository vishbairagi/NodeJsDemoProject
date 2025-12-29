import express from "express";
import mysql from "mysql2";
import fetch from "node-fetch";

const app = express();
const PORT = 3000;

app.use(express.json());

// ---------------- MySQL ----------------
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Mithla12",
  database: "genai_db"
});

db.connect(err => {
  if (err) {
    console.error("❌ MySQL Connection Failed:", err);
    return;
  }
  console.log("✅ MySQL Connected");
});

// ---------------- Generate Mermaid Diagram with MCP ----------------
app.post("/generate-diagram", async (req, res) => {
  const { prompt, contextId } = req.body;

  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  try {
    // 1️⃣ Call SLM with optional MCP context
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tinyllama:latest",
        prompt: `Convert the following into a Mermaid.js diagram:\n${prompt}`,
        stream: false,
        mcp_context: contextId || null
      })
    });

    const data = await response.json();
    const diagram = data.response; // Mermaid syntax
    const newContextId = contextId || data.contextId || null;

    // 2️⃣ Save everything in MySQL
    const sql = "INSERT INTO diagrams (prompt, diagram, context_id) VALUES (?, ?, ?)";
    db.query(sql, [prompt, diagram, newContextId], (err, result) => {
      if (err) {
        console.error("❌ DB Insert Error:", err);
        return res.status(500).json({ error: "Database insert failed" });
      }

      // 3️⃣ Return saved data
      res.json({
        id: result.insertId,
        prompt,
        mermaid: diagram,
        contextId: newContextId,
        created_at: new Date()
      });
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------- Fetch All Diagrams ----------------
app.get("/diagrams", (req, res) => {
  db.query("SELECT * FROM diagrams ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ---------------- START SERVER ----------------
app.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 Server running at http://127.0.0.1:${PORT}`);
});
