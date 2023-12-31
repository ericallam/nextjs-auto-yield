import { TriggerClient } from "@trigger.dev/sdk";

export const client = new TriggerClient({
  id: "auto-yield-v551",
  apiKey: process.env.TRIGGER_API_KEY,
  apiUrl: process.env.TRIGGER_API_URL,
});

client.on("runSucceeeded", (run) => {
  console.log("[client] Run succeeded", run);
});

client.on("runFailed", (run) => {
  console.log("[client] Run failed", run);
});
