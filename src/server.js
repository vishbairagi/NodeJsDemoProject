const dotenv = require("dotenv");
const path = require("path");
const express = require("express");
const cors = require("cors");
const searchRoutes = require("./routes/search.js");

// Load .env explicitly from project root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();

app.use(cors());
app.use(express.json());

console.log("PORT:", process.env.PORT);
console.log("OLLAMA_URL:", process.env.OLLAMA_URL);
console.log("MODEL:", process.env.MODEL);
console.log("HF_API_KEY:", process.env.HF_API_KEY);


// ROUTES
const askRoutes = require("./routes/ask.routes");
app.use("/", askRoutes);
app.use("/api", searchRoutes);


// HEALTH CHECK
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SERVER running on http://localhost:${PORT}`);
});
