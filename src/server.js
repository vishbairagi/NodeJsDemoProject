const dotenv = require("dotenv");
const path = require("path");
const express = require("express");
const cors = require("cors");
const askRoutes = require("./routes/ask.routes");
const pdfRoutes = require("./routes/pdf.routes");

// ✅ Load .env ONLY ONCE from project root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Debug logs
console.log("PORT:", process.env.PORT);
console.log("QDRANT_URL:", process.env.QDRANT_URL);
console.log("OLLAMA_URL:", process.env.OLLAMA_URL);
console.log("MODEL:", process.env.MODEL);

// ✅ Import initCollection
const { initCollection } = require("./services/vector.service"); 
// ⚠️ Change path if your file location is different

// ROUTES
app.use("/", askRoutes);
app.use("/", pdfRoutes);

// HEALTH CHECK
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

const PORT = process.env.PORT || 4000;

// ✅ START SERVER + CREATE COLLECTION
app.listen(PORT, async () => {
  try {
    await initCollection();   // 🔥 THIS WAS MISSING
    console.log("✅ Qdrant ready");
    console.log(`SERVER running on http://localhost:${PORT}`);
  } catch (error) {
    console.error("❌ Failed to initialize Qdrant:", error.message);
  }
});
