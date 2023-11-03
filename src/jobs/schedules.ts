import { client } from "@/trigger";
import { intervalTrigger } from "@trigger.dev/sdk";

client.defineJob({
  id: "schedule-example-1",
  name: "Schedule Example 1",
  version: "1.0.0",
  enabled: true,
  trigger: intervalTrigger({
    seconds: 60 * 3, // 3 minutes
  }),
  run: async (payload, io, ctx) => {
    const value = await io.random("random-native");

    await io.runTask("task-example-1", async () => {
      return {
        message: "Hello World",
        value,
      };
    });

    await io.wait("wait-1", 1);

    await io.logger.info("Hello World", { ctx });
  },
});
