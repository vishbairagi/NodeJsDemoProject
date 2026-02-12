const axios = require("axios");
const cheerio = require("cheerio");

async function searchWeb(query) {
  try {
    console.log("🌐 Searching (HTML) DuckDuckGo...");

    const searchUrl = "https://html.duckduckgo.com/html/";

    const { data } = await axios.post(
      searchUrl,
      new URLSearchParams({ q: query }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0",
        },
        timeout: 15000,
      }
    );

    const $ = cheerio.load(data);
    const urls = new Set();

    $(".result__a").each((_, element) => {
      const link = $(element).attr("href");

      if (
        link &&
        link.startsWith("http") &&
        !link.includes("duckduckgo.com") &&
        !link.includes("youtube.com")
      ) {
        urls.add(link);
      }
    });

    const results = Array.from(urls).slice(0, 5);

    console.log("🔎 Top URLs:", results);

    return results;
  } catch (error) {
    console.error("❌ DuckDuckGo HTML Search Error:", error.message);
    return [];
  }
}

module.exports = searchWeb;
