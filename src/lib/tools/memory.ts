import { tool } from "ai";
import { z } from "zod";
import {
  remember,
  recall,
  listMemories,
  forget,
  type MemoryKind,
} from "../memory/store";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Deep persistent-memory tools. These let the agent durably remember and recall
 * salient facts/preferences/context across sessions, per-user and encrypted at
 * rest. Always-on (registered as the `memory` category).
 *
 * Guidance for the model lives in the descriptions: remember stable, useful
 * facts (the user's preferences, recurring context, decisions), not transient
 * chit-chat; recall before asking the user to repeat themselves.
 */
export const memoryTools = {
  rememberFact: tool({
    description:
      "Durably remember a stable, useful fact about the user or their context so you can recall it in future sessions (e.g. a preference, a recurring detail, a decision). Do NOT store transient or trivial chat. Set importance 1-5 (5 = critical) and a kind.",
    inputSchema: z.object({
      content: z.string().describe("The fact to remember, in a self-contained sentence."),
      kind: z
        .enum(["fact", "preference", "context", "event"])
        .optional()
        .describe("Category of memory. Default 'fact'."),
      importance: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe("How important to recall later (1-5). Default 3."),
    }),
    execute: async ({ content, kind, importance }) => {
      try {
        const id = remember({
          content,
          kind: kind as MemoryKind | undefined,
          importance,
        });
        return { remembered: true, id };
      } catch (e) {
        return { error: `Failed to remember: ${errMsg(e)}` };
      }
    },
  }),

  recallMemory: tool({
    description:
      "Search your durable memory for facts relevant to a topic before answering, especially when the user references something they told you before. Returns the most relevant remembered items.",
    inputSchema: z.object({
      query: z.string().describe("What to recall (a topic, name, or keywords)."),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async ({ query, limit }) => {
      try {
        const memories = recall(query, limit ?? 5);
        return { count: memories.length, memories };
      } catch (e) {
        return { error: `Failed to recall: ${errMsg(e)}` };
      }
    },
  }),

  listMemories: tool({
    description: "List recently stored memories for review.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async ({ limit }) => {
      try {
        const memories = listMemories(limit ?? 50);
        return { count: memories.length, memories };
      } catch (e) {
        return { error: `Failed to list memories: ${errMsg(e)}` };
      }
    },
  }),

  forgetMemory: tool({
    description:
      "Forget (permanently delete) a stored memory by id — e.g. when the user asks you to forget something or it's no longer true.",
    inputSchema: z.object({ id: z.number().int() }),
    execute: async ({ id }) => {
      try {
        const removed = forget(id);
        return removed
          ? { forgotten: true, id }
          : { error: `No memory with id ${id}.` };
      } catch (e) {
        return { error: `Failed to forget: ${errMsg(e)}` };
      }
    },
  }),
};
