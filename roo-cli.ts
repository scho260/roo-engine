#!/usr/bin/env ts-node

import { IpcClient } from "./packages/ipc/src/ipc-client";
import { TaskCommandName, IpcMessageType } from "./packages/types/src/ipc";

// Get prompt from command line
const prompt = process.argv.slice(2).join(" ");
if (!prompt) {
  console.error('Usage: roo-cli "<your prompt>"');
  process.exit(1);
}

// Get socket path from env or use default
const socketPath =
  process.env.ROO_CODE_IPC_SOCKET_PATH ||
  (process.platform === "win32"
    ? "\\.\\pipe\\roo-code"
    : "/tmp/roo-code.sock");

const client = new IpcClient(socketPath, console.log);

client.on(IpcMessageType.Connect, () => {
  // Send StartNewTask command
  client.sendCommand({
    commandName: TaskCommandName.StartNewTask,
    data: {
      text: prompt,
      configuration: {},
    },
  });
});

let gotResponse = false;

client.on(IpcMessageType.TaskEvent, (event: any) => {
  if (event && event.payload && event.payload.eventName === "taskMessage") {
    const message = event.payload.payload;
    if (message && message.role === "assistant") {
      console.log("\nAI:", message.text || message.content || "[No response]");
      gotResponse = true;
      process.exit(0);
    }
  }
});

client.on(IpcMessageType.Disconnect, () => {
  if (!gotResponse) {
    console.error("Disconnected before receiving a response.");
    process.exit(2);
  }
});

// Timeout after 60 seconds
setTimeout(() => {
  if (!gotResponse) {
    console.error("Timed out waiting for AI response.");
    process.exit(3);
  }
}, 60000);

export {}; 