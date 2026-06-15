import { tool, experimental_generateImage as generateImage } from "ai";
import { xai } from "@ai-sdk/xai";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Image generation tool (xAI grok-imagine).
 *
 * Gated behind the per-request `imageGen` feature flag (see agent.ts). When the
 * user enables Image Generation in the composer, this tool is added to the
 * agent's toolset. It calls xAI's image model, writes the PNG under
 * ./data/uploads (served via /api/files/<name>), and returns a URL the client
 * renders inline.
 *
 * If the model/key doesn't support image generation, it returns a clean error
 * instead of throwing — the agent reports it to the user.
 */

const IMAGE_MODEL = process.env.XAI_IMAGE_MODEL || "grok-imagine-image";
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

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
        const { image } = await generateImage({
          model: xai.imageModel(IMAGE_MODEL),
          prompt,
          aspectRatio: aspectRatio ?? "1:1",
        });
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        const stored = `${randomUUID()}__generated.png`;
        fs.writeFileSync(path.join(UPLOAD_DIR, stored), Buffer.from(image.uint8Array));
        const url = `/api/files/${stored}`;
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
