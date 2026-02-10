const axios = require("axios");
const cheerio = require("cheerio");

const extractContent = async (urls) => {
  const contents = [];

  for (const url of urls) {
    try {
      const { data } = await axios.get(url, { timeout: 5000 });
      const $ = cheerio.load(data);

      $("script, style, nav, footer, header").remove();
      const text = $("body").text().replace(/\s+/g, " ").trim();

      contents.push(text.slice(0, 3000));
    } catch (err) {
      console.warn("⚠️ Failed to extract:", url);
    }
  }

  return contents.join("\n\n");
};

module.exports = extractContent;
