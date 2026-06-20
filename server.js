const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Wikipedia summary
async function fetchWikipediaSummary(title) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      extract: data.extract,
      image: data.thumbnail?.source || null
    };
  } catch {
    return null;
  }
}

// Nutrition stub
async function getNutrition(label) {
  if (label.toLowerCase() === "banana") {
    return {
      calories: 105,
      carbs_g: 27,
      sugar_g: 14,
      protein_g: 1.3
    };
  }
  return null;
}

// OpenAI enrichment
async function enrichLabelWithAI(label, mode = "general") {
  const prompts = {
    general: `You are an AR assistant. Describe the object "${label}" in 2–3 sentences.`,
    plant: `You are a botanist. Describe the plant "${label}" in 2–3 sentences.`,
    food: `You are a nutritionist. Describe the food "${label}" in 2–3 sentences, focusing on health and usage.`
  };

  const prompt = prompts[mode] || prompts.general;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }]
  });

  const text = response.choices[0].message.content || "";

  return {
    label,
    confidence: 1.0,
    description: text,
    preview: null
  };
}

// Main API route
app.post("/analyze", async (req, res) => {
  try {
    const { label, mode } = req.body;
    if (!label) return res.status(400).json({ error: "No label provided" });

    // Step 1: OpenAI enrichment
    const base = await enrichLabelWithAI(label, mode);

    // Step 2: Wikipedia enrichment
    const wiki = await fetchWikipediaSummary(base.label);
    if (wiki) {
      base.description = wiki.extract || base.description;
      base.preview = wiki.image || base.preview;
    }

    // Step 3: Nutrition (food mode only)
    if (mode === "food") {
      base.nutrition = await getNutrition(base.label);
    }

    res.json(base);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "AI processing failed" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log("Backend running on port " + PORT);
});
