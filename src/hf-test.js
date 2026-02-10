const axios = require("axios");
const dotenv = require("dotenv");
const path = require("path");

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

console.log("HF_API_KEY:", process.env.HF_API_KEY); // debug

const testHF = async () => {
  const HF_API_KEY = process.env.HF_API_KEY;
  if (!HF_API_KEY) throw new Error("HF_API_KEY is not set");

  try {
    const response = await axios.post(
      "https://router.huggingface.co/pipeline/text-generation/gpt2", // ✅ free hosted model
      { inputs: "Hello, this is a test." },
      {
        headers: { Authorization: `Bearer ${HF_API_KEY}`, "Content-Type": "application/json" },
      }
    );
    console.log("✅ Success:", response.data[0].generated_text);
  } catch (err) {
    console.error("❌ HF API error:", err.response?.data || err.message);
  }
};

testHF();
