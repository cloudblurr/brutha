import { tool } from "ai";
import { z } from "zod";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function getJson(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "GrokAgent/1.0", Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function geocode(place: string) {
  const geo = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1`
  );
  return geo?.results?.[0] ?? null;
}

export const extraTools = {
  getJoke: tool({
    description: "Get a random clean joke.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const data = await getJson(
          "https://official-joke-api.appspot.com/random_joke"
        );
        return { setup: data.setup, punchline: data.punchline };
      } catch (e) {
        return { error: `Failed to fetch joke: ${errMsg(e)}` };
      }
    },
  }),

  getQuote: tool({
    description: "Get a random inspirational quote.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const data = await getJson("https://zenquotes.io/api/random");
        const q = Array.isArray(data) ? data[0] : null;
        if (!q) return { error: "No quote available." };
        return { quote: q.q, author: q.a };
      } catch (e) {
        return { error: `Failed to fetch quote: ${errMsg(e)}` };
      }
    },
  }),

  sunriseSunset: tool({
    description: "Get today's sunrise and sunset times for a place.",
    inputSchema: z.object({ location: z.string() }),
    execute: async ({ location }) => {
      try {
        const place = await geocode(location);
        if (!place) return { error: `Could not find location: ${location}` };
        const wx = await getJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=sunrise,sunset&timezone=auto`
        );
        const d = wx?.daily;
        if (!d) return { error: "Data unavailable." };
        return {
          location: `${place.name}, ${place.country ?? ""}`.trim(),
          sunrise: d.sunrise?.[0],
          sunset: d.sunset?.[0],
        };
      } catch (e) {
        return { error: `Failed: ${errMsg(e)}` };
      }
    },
  }),

  distanceBetween: tool({
    description: "Calculate the great-circle distance between two places (by name).",
    inputSchema: z.object({ from: z.string(), to: z.string() }),
    execute: async ({ from, to }) => {
      try {
        const a = await geocode(from);
        const b = await geocode(to);
        if (!a) return { error: `Could not find: ${from}` };
        if (!b) return { error: `Could not find: ${to}` };
        const toRad = (x: number) => (x * Math.PI) / 180;
        const R = 6371; // km
        const dLat = toRad(b.latitude - a.latitude);
        const dLon = toRad(b.longitude - a.longitude);
        const lat1 = toRad(a.latitude);
        const lat2 = toRad(b.latitude);
        const h =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        const km = R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
        return {
          from: a.name,
          to: b.name,
          kilometers: Math.round(km),
          miles: Math.round(km * 0.621371),
        };
      } catch (e) {
        return { error: `Failed: ${errMsg(e)}` };
      }
    },
  }),

  calculateBmi: tool({
    description: "Calculate Body Mass Index (BMI) and category from weight (kg) and height (cm).",
    inputSchema: z.object({
      weightKg: z.number().positive(),
      heightCm: z.number().positive(),
    }),
    execute: async ({ weightKg, heightCm }) => {
      const m = heightCm / 100;
      const bmi = weightKg / (m * m);
      const r = Math.round(bmi * 10) / 10;
      const category =
        bmi < 18.5 ? "Underweight"
        : bmi < 25 ? "Normal weight"
        : bmi < 30 ? "Overweight"
        : "Obese";
      return { bmi: r, category };
    },
  }),

  activitySuggestion: tool({
    description: "Get a random suggestion for something to do when bored.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const data = await getJson("https://bored-api.appbrewery.com/random");
        return {
          activity: data.activity,
          type: data.type,
          participants: data.participants,
        };
      } catch (e) {
        return { error: `Failed to fetch activity: ${errMsg(e)}` };
      }
    },
  }),
};
