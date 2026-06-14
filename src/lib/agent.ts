import { ToolLoopAgent, stepCountIs } from "ai";
import { xai } from "@ai-sdk/xai";
import { utilityTools } from "./tools/utility";
import { webTools } from "./tools/web";
import { storageTools } from "./tools/storage";
import { emailTools } from "./tools/email";
import { dateTools } from "./tools/datetime";
import { textTools } from "./tools/text";
import { extraTools } from "./tools/extras";

/**
 * All tools the agent can use, composed from category modules:
 *  - utility:  calculate, conversions, password, hash, base64, uuid, random,
 *              dice, qr, color, text counting
 *  - web:      weather, forecast, fetchUrl, wikipedia, dictionary, currency,
 *              crypto price, IP info, country info, top news
 *  - storage:  contacts (CRUD), notes (CRUD + FTS), tasks/reminders (CRUD)
 *  - email:    sendEmail (SMTP, optional; defaults to TEST_EMAIL_TO)
 *  - datetime: dateDiff, daysUntil, addToDate, dayOfWeek, ICS calendar event
 *  - text:     translate, slugify, changeCase, regexExtract, numberToWords,
 *              formatJson, csvToJson, parseUrl, sortList
 *  - extras:   jokes, quotes, sunrise/sunset, distance, BMI, activity
 *
 * Tools run on the server. Grok decides when to call them; the AI SDK executes
 * the matching `execute` fn and feeds the result back into the loop.
 */
export const tools = {
  ...utilityTools,
  ...webTools,
  ...storageTools,
  ...emailTools,
  ...dateTools,
  ...textTools,
  ...extraTools,
};

const SYSTEM_PROMPT = `You are Grok Agent, a highly capable AI assistant powered by xAI's Grok, with a large toolbox.

Prefer using a tool over guessing. Highlights of what you can do:
- Math & conversions: calculate, convertUnits, convertCurrency, convertTimeZone, numberToWords.
- Dates: dateDiff, daysUntil, addToDate, dayOfWeek, createCalendarEvent (.ics).
- Time & weather: getCurrentTime, getWeather, forecast, sunriseSunset.
- Knowledge & web: wikipedia, dictionary, fetchUrl, countryInfo, cryptoPrice, ipInfo, topNews, translate.
- Geo: distanceBetween, sunriseSunset.
- Memory: contacts (save/find/list/update/delete), notes (save/search/list/delete),
  tasks (add/list/complete/delete).
- Text & data: slugify, changeCase, regexExtract, formatJson, csvToJson, parseUrl, sortList.
- Generators: generatePassword, generateUuid, hashText, encodeBase64, qrCode, randomNumber, rollDice.
- Health/fun: calculateBmi, getJoke, getQuote, activitySuggestion.
- Email: sendEmail (defaults to the configured test recipient; reports if not configured).

Guidance:
- If asked to email someone whose address you don't know, try findContact first.
- After a tool runs, explain the result briefly in plain language.
- If a tool returns an error, tell the user clearly and suggest a fix.
- Be concise, friendly, and accurate. If you truly can't help, say so honestly.`;

export const grokAgent = new ToolLoopAgent({
  model: xai(process.env.XAI_MODEL || "grok-3"),
  instructions: SYSTEM_PROMPT,
  tools,
  stopWhen: stepCountIs(14),
});
