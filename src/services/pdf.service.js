const fs = require("fs");
const pdfParse = require("pdf-parse"); // ✅ renamed
const { generateEmbedding } = require("./embed.service");
const { insertVector, initCollection } = require("./vector.service");

function chunkText(text, chunkSize = 500, overlap = 100) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

async function ingestPDF(path) {
  try {
    await initCollection();

    const dataBuffer = fs.readFileSync(path);

    // ✅ FIXED
    const pdfData = await pdfParse(dataBuffer);

    const cleanedText = pdfData.text.replace(/\s+/g, " ").trim();

    const chunks = chunkText(cleanedText, 500, 100);

    console.log("Total chunks:", chunks.length);

    for (let i = 0; i < chunks.length; i++) {
const embedding = await generateEmbedding(chunks[i]);
      await insertVector(embedding, chunks[i]);
    }

    console.log("✅ PDF ingestion completed");
  } catch (error) {
    console.error("❌ PDF Ingest Error:", error.message);
    throw error;
  }
}

module.exports = { ingestPDF };
