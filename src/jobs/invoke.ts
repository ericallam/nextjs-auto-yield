import { client } from "@/trigger";
import { OpenAI } from "@trigger.dev/openai";
import { invokeTrigger } from "@trigger.dev/sdk";
import { z } from "zod";

const invocableJob = client.defineJob({
  id: "invoke-example-1",
  name: "Invoke Example 1",
  version: "1.0.0",
  enabled: true,
  trigger: invokeTrigger({
    schema: z.object({
      message: z.string(),
      forceError: z.boolean().default(false),
      delay: z.number().default(5),
    }),
  }),
  run: async (payload, io, ctx) => {
    const generatingMemes = await io.createStatus("status-1", {
      //the label is compulsory on this first call
      label: "Generating memes",
      //state is optional
      state: "loading",
      //data is an optional object. the values can be any type that is JSON serializable
      data: {
        progress: 0.1,
      },
    });

    await io.runTask("task-1", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    await io.wait("wait-1", payload.delay);

    await io.runTask("task-2", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return [{ hello: "there", ts: new Date() }];
    });

    await generatingMemes.update("middle-generation", {
      //label isn't specified so will remain the same
      //state will be updated to "success"
      state: "success",
      //set data, this overrides the previous value
      data: {
        progress: 1,
        urls: [
          "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZnZoMndsdWh0MmhvY2kyaDF6YjZjZzg1ZGsxdnhhYm13a3Q1Y3lkbyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/13HgwGsXF0aiGY/giphy.gif",
        ],
      },
    });

    if (payload.forceError) {
      throw new Error("Forced error");
    }

    const response = await io.runTask("fetch-json", async () =>
      fetch("https://jsonhero.io/j/PjHo1o5MVeH4.json").then((r) => r.json())
    );

    return response;
  },
});

client.defineJob({
  id: "invoke-example-2",
  name: "Invoke Example 2",
  version: "1.0.0",
  enabled: true,
  trigger: invokeTrigger(),
  run: async (payload, io, ctx) => {
    await invocableJob.invoke("invoke", {
      message: "Hello World 1",
    });

    await invocableJob.invoke(
      "invoke-with-url",
      {
        message: "Hello World 2",
      },
      {
        callbackUrl: process.env.REQUEST_BIN_URL,
      }
    );

    const result = await invocableJob.invokeAndWaitForCompletion(
      "invoke-and-wait",
      {
        message: "Hello World 3",
        forceError: true,
      }
    );

    if (result.ok) {
      await io.logger.info("Invoking job worked!", { result });
    } else {
      await io.logger.error("Invoking job failed!", { result });
    }
  },
});

const openai = new OpenAI({
  id: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
});

const perplexity = new OpenAI({
  id: "perplexity",
  apiKey: process.env.PERPLEXITY_API_KEY!,
  baseURL: "https://api.perplexity.ai",
  icon: "brand-open-source",
});

// This job performs a chat completion using either OpenAI or Perplexity, depending on the model passed in
const completionJob = client.defineJob({
  id: "openai-job",
  name: "OpenAI Job",
  version: "1.0.0",
  enabled: true,
  trigger: invokeTrigger({
    schema: z.object({
      model: z.string().default("gpt-3.5-turbo"),
      prompt: z.string(),
    }),
  }),
  integrations: {
    openai,
    perplexity,
  },
  run: async (payload, io, ctx) => {
    if (payload.model === "gpt-3.5-turbo") {
      return await io.openai.chat.completions.backgroundCreate(
        "background-chat-completion",
        {
          model: payload.model,
          messages: [
            {
              role: "user",
              content: payload.prompt,
            },
          ],
        },
        {},
        {
          // Set a timeout of 30 seconds, and retry it up to 3 times
          timeout: {
            durationInMs: 30000,
            retry: {
              limit: 3,
              minTimeoutInMs: 1000,
              factor: 2,
            },
          },
        }
      );
    } else {
      return await io.perplexity.completions.backgroundCreate(
        "background-completion",
        {
          model: payload.model,
          prompt: payload.prompt,
        },
        {},
        {
          // Set a timeout of 30 seconds, and retry it up to 3 times
          timeout: {
            durationInMs: 30000,
            retry: {
              limit: 3,
              minTimeoutInMs: 1000,
              factor: 2,
            },
          },
        }
      );
    }
  },
});

const prompts = [
  "Advantages of quantum computing over classical computing",
  "The ethical implications of advanced artificial intelligence",
  "Design a thought experiment highlighting the paradoxes in quantum mechanics",
  "Explain the Fermi Paradox, its potential solutions, and implications for humanity",
  "Analyze Shakespeare's use of iambic pentameter in his plays",
];

client.defineJob({
  id: "batch-invoke-ai-example",
  name: "Batch Invoke OpenAI Example",
  version: "1.0.0",
  trigger: invokeTrigger(),
  run: async (payload, io, ctx) => {
    // This will invoke the completionJob in parallel for each prompt, first trying OpenAI
    const runs = await completionJob.batchInvokeAndWaitForCompletion(
      "batch-invoke-and-wait",
      prompts.map((prompt) => ({
        payload: {
          model: "gpt-3.5-turbo",
          prompt,
        },
      }))
    );

    await io.logger.info("Got these runs", { runs });

    // Runs are returned in the same order as the prompts
    const failedRuns = runs
      .map((run, i) => ({ run, prompt: prompts[i] }))
      .filter((r) => !r.run.ok);

    // Run the failed runs with Perplexity by specifying the "mistral-7b-instruct" model
    const retriedRuns = await completionJob.batchInvokeAndWaitForCompletion(
      "batch-invoke-and-wait",
      failedRuns.map((failedRun) => ({
        payload: {
          model: "mistral-7b-instruct",
          prompt: failedRun.prompt,
        },
      }))
    );

    const failedPerplexityRuns = retriedRuns
      .map((run, i) => ({ run, prompt: failedRuns[i].prompt }))
      .filter((r) => !r.run.ok);

    // And so on and so forth
  },
});
