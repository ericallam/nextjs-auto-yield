import { eventTrigger, intervalTrigger } from "@trigger.dev/sdk";
import { client } from "@/trigger";
import { OpenAI } from "@trigger.dev/openai";

const openai = new OpenAI({
  id: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
});

client.defineJob({
  id: "auto-yield-1",
  name: "Auto Yield 1",
  version: "1.0.0",
  trigger: eventTrigger({
    name: "auto.yield.1",
  }),
  run: async (payload, io, ctx) => {
    await io.runTask("initial-long-task", async (task) => {
      await new Promise((resolve) => setTimeout(resolve, payload.timeout));

      return {
        message: "initial-long-task",
      };
    });

    for (let i = 0; i < payload.iterations; i++) {
      await io.runTask(`task.${i}`, async (task) => {
        // Create a random number between 250 and 1250
        const random = Math.floor(Math.random() * 1000) + 250;

        await new Promise((resolve) => setTimeout(resolve, random));

        return {
          message: `task.${i}`,
          random,
        };
      });
    }
  },
});

client.defineJob({
  id: "schedule-auto-yield",
  name: "Schedule Auto Yield",
  version: "1.0.0",
  trigger: intervalTrigger({
    seconds: 60,
  }),
  run: async (payload, io, ctx) => {
    await io.sendEvent("send-event", {
      name: "auto.yield.1",
      payload: {
        timeout: 5000,
        iterations: 25,
      },
    });
  },
});

client.defineJob({
  id: "perplexity-job",
  name: "Perplexity Job",
  trigger: eventTrigger({
    name: "perplexity.job",
  }),
  version: "1.0.0",
  integrations: { openai },
  run: async (payload, io, ctx) => {
    const messages = [
      {
        role: "user" as const,
        content:
          "If you were a programming language, what would you be and why?",
      },
    ];

    const openaiResponse = await io.openai.chat.completions.create(
      "openai-completion",
      {
        model: "gpt-3.5-turbo",
        messages,
      }
    );

    return {
      openai: openaiResponse.choices[0].message.content,
    };
  },
});
