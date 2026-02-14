const express = require("express");
const { generateEmbedding } = require("../services/embed.service");
const { searchVector } = require("../services/vector.service");
const { generateAnswer } = require("../services/llm.service");

const router = express.Router();

router.post("/askrag", async (req, res) => {
  const { question } = req.body;

  const questionEmbedding = await generateEmbedding(question);
  const results = await searchVector(questionEmbedding);

  const context = results.map(r => r.payload.text).join("\n");

  const answer = await generateAnswer(question, context);

  res.json({ answer });
});

module.exports = router;
