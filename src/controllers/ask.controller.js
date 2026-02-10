const webSearch = require("../services/search.service");
const extractContent = require("../services/extract.service");
const { generateAnswer } = require("../services/llm.service");

const askQuestion = async (req, res) => {
  
  try {
    const { question } = req.body;
    console.log("📥 Question:", question);

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    console.log("🔎 Calling webSearch...");
    const urls = await webSearch(question);
    console.log("🌐 URLs:", urls);

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      throw new Error("webSearch returned no URLs");
    }

    console.log("📄 Calling extractContent...");
    const documents = await extractContent(urls);
    console.log("📚 Documents length:", documents?.length);

    if (!documents || documents.length === 0) {
      throw new Error("extractContent returned no documents");
    }

    console.log("🧠 Calling generateAnswer...");
    const answer = await generateAnswer(question, documents);
    console.log("✅ Answer generated");

    res.json({
      question,
      sources: urls,
      answer
    });

  } catch (err) {
    console.error("🔥 ASK ERROR STACK:", err.stack || err);
    res.status(500).json({
      error: "Internal Server Error",
      detail: err.message
    });
  }
};


module.exports = { askQuestion };
