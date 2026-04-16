import { createReadStream } from "node:fs";
import OpenAI from "openai";
import { Config } from "./config.js";

export async function transcribeAudio(
  client: OpenAI,
  config: Config,
  filePath: string
): Promise<string> {
  const res = await client.audio.transcriptions.create({
    file: createReadStream(filePath) as any,
    model: config.whisperModel,
    language: "zh",
    response_format: "text",
  });
  return (res as unknown as string).trim();
}
