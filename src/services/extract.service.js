const axios = require("axios");
const cheerio = require("cheerio");

async function extractBody(url) {
  try {
    console.log("Extracting:", url);

    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      timeout: 10000,
    });

    const $ = cheerio.load(data);

    // Remove unwanted tags
    $("script").remove();
    $("style").remove();
    $("noscript").remove();
    $("header").remove();
    $("footer").remove();
    $("nav").remove();

    // Get body text
    const text = $("body").text();

    // Clean extra spaces
    const cleanText = text
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000); // limit size

    return cleanText;
  } catch (error) {
    console.error("❌ Extract error:", error.message);
    return "";
  }
}

module.exports = { extractBody };
