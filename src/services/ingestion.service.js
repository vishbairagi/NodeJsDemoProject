const fs = require("fs");
const pdf = require("pdf-parse");
const { getEmbedding } = require("./embed.service");
const { storeVector } = require("./vector.service");

async function ingestPDF(path) {
  const dataBuffer = fs.readFileSync(path);
  const pdfData = await pdf(dataBuffer);

  const chunks = pdfData.text.match(/.{1,500}/g);

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await getEmbedding(chunks[i]);
    await storeVector(`${Date.now()}-${i}`, embedding, {
      text: chunks[i],
    });
  }
}

module.exports = { ingestPDF };
