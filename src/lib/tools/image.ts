import { tool, experimental_generateImage as generateImage } from "ai";
import { xai } from "@ai-sdk/xai";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { currentDb, currentUserId } from "../scope";

/**
 * Image generation tool (xAI grok-imagine) — backed by Supabase Storage.
 *
 * Gated behind the per-request `imageGen` feature flag (see agent.ts). When the
 * user enables Image Generation in the composer, this tool is added to the
 * agent's toolset. It calls xAI's image model, uploads the PNG to the private
 * `uploads` bucket under the user's namespace (served via /api/files/<path>),
 * and returns a URL the client renders inline.
 *
 * If the model/key doesn't support image generation, it returns a clean error
 * instead of throwing — the agent reports it to the user.
 */

const IMAGE_MODEL = process.env.XAI_IMAGE_MODEL || "grok-imagine-image";
const BUCKET = "uploads";

export const imageTools = {
  generateImage: tool({
    description:
      "Generate an image from a text description. Use ONLY when the user explicitly asks to create, draw, generate, or imagine a picture/image. Returns a URL to the generated image.",
    inputSchema: z.object({
      prompt: z.string().describe("Detailed description of the image to generate."),
      aspectRatio: z
        .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
        .optional()
        .describe("Aspect ratio. Defaults to 1:1."),
    }),
    execute: async ({ prompt, aspectRatio }) => {
      try {
        // Image generation uses xAI directly (the agent's text inference runs
        // on Grok via Puter; image models aren't exposed through the Puter
        // OpenAI-compatible chat endpoint). Requires XAI_API_KEY; if it's not
        // set, report cleanly instead of throwing a confusing SDK error.
        if (!process.env.XAI_API_KEY) {
          return {
            error:
              "Image generation is not configured. Set XAI_API_KEY to enable the generateImage tool (text chat runs on Grok via Puter and needs no xAI key).",
          };
        }
        const { image } = await generateImage({
          model: xai.imageModel(IMAGE_MODEL),
          prompt,
          aspectRatio: aspectRatio ?? "1:1",
        });

        const userId = currentUserId();
        if (!userId) {
          return { error: "No authenticated user; cannot store generated image." };
        }
        const objectPath = `${userId}/${randomUUID()}__generated.png`;
        const { error } = await currentDb()
          .storage.from(BUCKET)
          .upload(objectPath, Buffer.from(image.uint8Array), {
            contentType: "image/png",
            upsert: false,
          });
        if (error) throw error;

        const url = `/api/files/${objectPath
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`;
        return { created: true, url, prompt, aspectRatio: aspectRatio ?? "1:1" };
      } catch (e) {
        return {
          error: `Image generation failed: ${
            e instanceof Error ? e.message : String(e)
          }. The configured model (${IMAGE_MODEL}) may not be available on your xAI plan.`,
        };
      }
    },
  }),
};
