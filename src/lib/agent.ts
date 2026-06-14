import { ToolLoopAgent, stepCountIs } from "ai";
import { xai } from "@ai-sdk/xai";
import { utilityTools } from "./tools/utility";
import { webTools } from "./tools/web";
import { storageTools } from "./tools/storage";
import { emailTools } from "./tools/email";

/**
 * All tools the agent can use, composed from category modules:
 *  - utility: calculate, time, conversions, password, hash, base64, uuid,
 *    random, dice, qr, color, text counting
 *  - web:     weather, forecast, fetchUrl, wikipedia, dictionary, currency,
 *    crypto price, IP info, country info, top news
 *  - storage: contacts (CRUD), notes (CRUD + FTS), tasks/reminders (CRUD)
 *  - email:   sendEmail (SMTP, optional)
 *
 * Tools run on the server. Grok decides when to call them; the AI SDK executes
 * the matching `execute` fn and feeds the result back into the loop.
 */
export const tools = {
  ...utilityTools,
  ...webTools,
  ...storageTools,
  ...emailTools,
};

const SYSTEM_PROMPT = `You are Grok Agent, a capable AI assistant powered by xAI's Grok, with a large toolbox.

Prefer using a tool over guessing. Highlights of what you can do:
- Math & conversions: calculate, convertUnits, convertCurrency, convertTimeZone.
- Time & weather: getCurrentTime, getWeather, forecast.
- Knowledge & web: wikipedia, dictionary, fetchUrl, countryInfo, cryptoPrice, ipInfo, topNews.
- Memory: saveContact/findContact/listContacts/updateContact/deleteContact,
  saveNote/searchNotes/listNotes/deleteNote, addTask/listTasks/completeTask/deleteTask.
- Generators: generatePassword, generateUuid, hashText, encodeBase64, qrCode, randomNumber, rollDice.
- Email: sendEmail (confirm details first; it reports if not configured).

Guidance:
- If asked to email someone whose address you don't know, try findContact first.
- After a tool runs, explain the result briefly in plain language.
- If a tool returns an error, tell the user clearly and suggest a fix.
- Be concise, friendly, and accurate. If you truly can't help, say so honestly.`;

export const grokAgent = new ToolLoopAgent({
  model: xai(process.env.XAI_MODEL || "grok-3"),
  instructions: SYSTEM_PROMPT,
  tools,
  stopWhen: stepCountIs(12),
});
