const axios = require("axios");

const webSearch = async (query) => {
  try {
    const url = "https://api.duckduckgo.com/";

    const { data } = await axios.get(url, {
      params: {
        q: query,
        format: "json",
        no_redirect: 1,
        no_html: 1,
        skip_disambig: 1
      },
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      timeout: 10000
    });

    const urls = [];

    // Abstract URL
    if (data.AbstractURL) {
      urls.push(data.AbstractURL);
    }

    // Related topics
    if (Array.isArray(data.RelatedTopics)) {
      data.RelatedTopics.forEach(item => {
        if (item.FirstURL) {
          urls.push(item.FirstURL);
        }
      });
    }

    return urls.slice(0, 5);

  } catch (err) {
    console.error("🔎 SEARCH ERROR:", err.message);
    return [];
  }
};

module.exports = webSearch;
