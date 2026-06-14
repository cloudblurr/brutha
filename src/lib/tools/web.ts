import { tool } from "ai";
import { z } from "zod";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export const webTools = {
  getWeather: tool({
    description: "Get current weather for a place by name (no API key needed).",
    inputSchema: z.object({ location: z.string() }),
    execute: async ({ location }) => {
      try {
        const geo = await getJson(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
            location
          )}&count=1`
        );
        const place = geo?.results?.[0];
        if (!place) return { error: `Could not find location: ${location}` };
        const wx = await getJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
        );
        const c = wx?.current;
        if (!c) return { error: "Weather data unavailable." };
        return {
          location: `${place.name}, ${place.country ?? ""}`.trim(),
          temperatureC: c.temperature_2m,
          humidityPercent: c.relative_humidity_2m,
          windSpeedKmh: c.wind_speed_10m,
          weatherCode: c.weather_code,
        };
      } catch (e) {
        return { error: `Failed to fetch weather: ${errMsg(e)}` };
      }
    },
  }),

  forecast: tool({
    description: "Get a multi-day daily weather forecast for a place.",
    inputSchema: z.object({
      location: z.string(),
      days: z.number().int().min(1).max(7).optional(),
    }),
    execute: async ({ location, days }) => {
      try {
        const geo = await getJson(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
            location
          )}&count=1`
        );
        const place = geo?.results?.[0];
        if (!place) return { error: `Could not find location: ${location}` };
        const wx = await getJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=${days ?? 5}&timezone=auto`
        );
        const d = wx?.daily;
        if (!d) return { error: "Forecast unavailable." };
        const out = d.time.map((date: string, i: number) => ({
          date,
          maxC: d.temperature_2m_max[i],
          minC: d.temperature_2m_min[i],
          precipProbPct: d.precipitation_probability_max?.[i],
          weatherCode: d.weather_code[i],
        }));
        return { location: `${place.name}, ${place.country ?? ""}`.trim(), forecast: out };
      } catch (e) {
        return { error: `Failed to fetch forecast: ${errMsg(e)}` };
      }
    },
  }),

  fetchUrl: tool({
    description:
      "Fetch a web page or API URL and return its text content (truncated). Use for reading articles, docs, or JSON.",
    inputSchema: z.object({ url: z.string().url() }),
    execute: async ({ url }) => {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "GrokAgent/1.0" },
          signal: AbortSignal.timeout(15000),
        });
        const ct = res.headers.get("content-type") ?? "";
        let text = await res.text();
        if (ct.includes("text/html")) {
          // Strip tags for a rough readable view.
          text = text
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
        const limit = 4000;
        return {
          url,
          status: res.status,
          contentType: ct,
          truncated: text.length > limit,
          content: text.slice(0, limit),
        };
      } catch (e) {
        return { error: `Failed to fetch URL: ${errMsg(e)}` };
      }
    },
  }),

  wikipedia: tool({
    description: "Get a summary of a topic from Wikipedia.",
    inputSchema: z.object({ topic: z.string() }),
    execute: async ({ topic }) => {
      try {
        const data = await getJson(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            topic.replace(/\s+/g, "_")
          )}`
        );
        if (data?.type === "disambiguation")
          return { topic, note: "Disambiguation page", extract: data.extract };
        return {
          title: data.title,
          extract: data.extract,
          url: data?.content_urls?.desktop?.page,
        };
      } catch (e) {
        return { error: `Wikipedia lookup failed: ${errMsg(e)}` };
      }
    },
  }),

  dictionary: tool({
    description: "Look up the definition of an English word.",
    inputSchema: z.object({ word: z.string() }),
    execute: async ({ word }) => {
      try {
        const data = await getJson(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
        );
        const entry = Array.isArray(data) ? data[0] : null;
        if (!entry) return { error: `No definition found for '${word}'.` };
        const meanings = entry.meanings?.slice(0, 3).map((m: { partOfSpeech: string; definitions: { definition: string }[] }) => ({
          partOfSpeech: m.partOfSpeech,
          definition: m.definitions?.[0]?.definition,
        }));
        return { word: entry.word, phonetic: entry.phonetic, meanings };
      } catch (e) {
        return { error: `Dictionary lookup failed for '${word}': ${errMsg(e)}` };
      }
    },
  }),

  convertCurrency: tool({
    description:
      "Convert an amount between currencies using live exchange rates (ECB via Frankfurter).",
    inputSchema: z.object({
      amount: z.number(),
      from: z.string().describe("3-letter code, e.g. 'USD'"),
      to: z.string().describe("3-letter code, e.g. 'EUR'"),
    }),
    execute: async ({ amount, from, to }) => {
      try {
        const data = await getJson(
          `https://api.frankfurter.app/latest?amount=${amount}&from=${from.toUpperCase()}&to=${to.toUpperCase()}`
        );
        const result = data?.rates?.[to.toUpperCase()];
        if (result === undefined)
          return { error: `Could not convert ${from} to ${to}.` };
        return { amount, from: from.toUpperCase(), to: to.toUpperCase(), result, date: data.date };
      } catch (e) {
        return { error: `Currency conversion failed: ${errMsg(e)}` };
      }
    },
  }),

  cryptoPrice: tool({
    description: "Get the current price of a cryptocurrency in a fiat currency.",
    inputSchema: z.object({
      coin: z.string().describe("CoinGecko id or common name, e.g. 'bitcoin', 'ethereum'"),
      currency: z.string().optional().describe("Fiat code, default 'usd'"),
    }),
    execute: async ({ coin, currency }) => {
      try {
        const cur = (currency ?? "usd").toLowerCase();
        const id = coin.toLowerCase().replace(/\s+/g, "-");
        const data = await getJson(
          `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${cur}`
        );
        const price = data?.[id]?.[cur];
        if (price === undefined) return { error: `Unknown coin '${coin}'.` };
        return { coin: id, currency: cur, price };
      } catch (e) {
        return { error: `Crypto price lookup failed: ${errMsg(e)}` };
      }
    },
  }),

  ipInfo: tool({
    description: "Get geolocation/ISP info for an IP address (or your server's IP if omitted).",
    inputSchema: z.object({ ip: z.string().optional() }),
    execute: async ({ ip }) => {
      try {
        const data = await getJson(`http://ip-api.com/json/${ip ?? ""}`);
        if (data?.status !== "success")
          return { error: data?.message ?? "Lookup failed." };
        return {
          ip: data.query,
          city: data.city,
          region: data.regionName,
          country: data.country,
          isp: data.isp,
          lat: data.lat,
          lon: data.lon,
          timezone: data.timezone,
        };
      } catch (e) {
        return { error: `IP lookup failed: ${errMsg(e)}` };
      }
    },
  }),

  countryInfo: tool({
    description: "Get facts about a country (capital, population, region, currency, languages).",
    inputSchema: z.object({ country: z.string() }),
    execute: async ({ country }) => {
      try {
        const data = await getJson(
          `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=name,capital,population,region,currencies,languages,flag`
        );
        const c = Array.isArray(data) ? data[0] : null;
        if (!c) return { error: `Country not found: ${country}` };
        return {
          name: c.name?.common,
          capital: c.capital?.[0],
          region: c.region,
          population: c.population,
          currencies: c.currencies ? Object.keys(c.currencies) : [],
          languages: c.languages ? Object.values(c.languages) : [],
          flag: c.flag,
        };
      } catch (e) {
        return { error: `Country lookup failed: ${errMsg(e)}` };
      }
    },
  }),

  topNews: tool({
    description: "Get current top tech/startup headlines from Hacker News.",
    inputSchema: z.object({
      count: z.number().int().min(1).max(15).optional(),
    }),
    execute: async ({ count }) => {
      try {
        const ids: number[] = await getJson(
          "https://hacker-news.firebaseio.com/v0/topstories.json"
        );
        const top = ids.slice(0, count ?? 8);
        const stories = await Promise.all(
          top.map((id) =>
            getJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
          )
        );
        return {
          headlines: stories.map((s) => ({
            title: s.title,
            url: s.url ?? `https://news.ycombinator.com/item?id=${s.id}`,
            score: s.score,
          })),
        };
      } catch (e) {
        return { error: `News fetch failed: ${errMsg(e)}` };
      }
    },
  }),
};
