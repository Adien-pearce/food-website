// serve.js — Node/Express server to serve static files and proxy Spoonacular + OpenAI
// Usage: set environment variables in .env:
//   SPOONACULAR_KEY=your_spoonacular_key
//   OPENAI_KEY=your_openai_key
// Then: npm install express node-fetch dotenv
// Run: node serve.js

import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPOON_KEY = process.env.SPOONACULAR_KEY;
const OPENAI_KEY = process.env.OPENAI_KEY;

if (!SPOON_KEY) console.warn("Warning: SPOONACULAR_KEY not set in .env");
if (!OPENAI_KEY) console.warn("Warning: OPENAI_KEY not set in .env");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // serve static files from ./public

// If you place index.html, style.css, app.js inside ./public, they will be served automatically.
// Endpoint: /api/recipes  -> POST { ingredients: ["a","b"] }
app.post("/api/recipes", async (req, res) => {
  const ingredients = req.body?.ingredients;
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: "ingredients required" });
  }
  try {
    // Spoonacular: Find by ingredients
    const q = new URLSearchParams({
      ingredients: ingredients.join(","),
      number: "4",
      ranking: "1",
      ignorePantry: "true",
      apiKey: SPOON_KEY
    });
    const url = `https://api.spoonacular.com/recipes/findByIngredients?${q.toString()}`;
    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({ error: "Spoonacular error", details: txt });
    }
    const list = await r.json();

    // For convenience, enrich each result by fetching used/missed details already present,
    // and return a trimmed result.
    const trimmed = list.map(item => ({
      id: item.id,
      title: item.title,
      image: item.image,
      usedIngredients: item.usedIngredients?.map(u=>({ name: u.name, amount: u.amount })) || [],
      missedIngredients: item.missedIngredients?.map(m=>({ name: m.name, amount: m.amount })) || []
    }));

    res.json(trimmed);
  } catch (err) {
    console.error("recipes error", err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: /api/chat -> POST { prompt: "..." } proxies to OpenAI Chat Completions
app.post("/api/chat", async (req, res) => {
  const prompt = req.body?.prompt;
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // or gpt-4o if you have access
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 600
      })
    });

    if (!response.ok) {
      const txt = await response.text();
      return res.status(502).json({ error: "OpenAI error", details: txt });
    }
    const json = await response.json();
    const text = json?.choices?.[0]?.message?.content ?? "";
    res.json({ text });
  } catch (err) {
    console.error("chat error", err);
    res.status(500).json({ error: err.message });
  }
});

// Fallback: serve index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`Server running on http://localhost:${PORT}`));
