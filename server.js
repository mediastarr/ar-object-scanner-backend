const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const OpenAI = require("openai");

const app = express();

// CORS + JSON parsing
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Wikipedia summary fetcher
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
  } catch (err) {
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

// OpenAI Vision analyzer
async function analyzeImage(imageDataUrl, mode = "general") {
  const prompts = {
    general: "Identify the main object in this image. Respond in the format: label | confidence (0-1) | description.",
    plant: "Identify the plant species in this image. Respond in the format: label | confidence (0-1) | botanical description.",
    food: "Identify the food item in this image. Respond in the format: label | confidence (0-1) | nutrition summary."
  };

  const prompt = prompts[mode] || prompts.general;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: imageDataUrl }
        ]
      }
    ]
  });

  const text = response.choices[0].message.content || "";
  const [label, conf, description] = text.split("|").map(s => s?.trim());

  return {
    label: label || "Unknown",
    confidence: parseFloat(conf) || 0.0,
    description: description || "No description available.",
    preview: null
  };
}

// Main API route
app.post("/analyze", async (req, res) => {
  try {
    const { image, mode } = req.body;
    if (!image) return res.status(400).json({ error: "No image provided" });

    // Step 1: OpenAI Vision
    const base = await analyzeImage(image, mode);

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

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log("Backend running on port " + PORT);
});
