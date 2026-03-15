export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5-mini";
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export function describeAiError(error: unknown): string {
  if (error && typeof error === "object") {
    const candidate = error as {
      message?: unknown;
      statusCode?: unknown;
      responseBody?: unknown;
      data?: unknown;
      url?: unknown;
    };
    const message =
      typeof candidate.message === "string" && candidate.message.trim().length > 0
        ? candidate.message.trim()
        : String(error);
    const details: string[] = [];

    if (typeof candidate.statusCode === "number") {
      details.push(`status ${candidate.statusCode}`);
    }
    if (typeof candidate.url === "string" && candidate.url.trim().length > 0) {
      details.push(candidate.url.trim());
    }
    if (typeof candidate.responseBody === "string" && candidate.responseBody.trim().length > 0) {
      details.push(candidate.responseBody.trim().slice(0, 400));
    } else if (typeof candidate.data !== "undefined") {
      try {
        details.push(JSON.stringify(candidate.data).slice(0, 400));
      } catch {
        details.push(String(candidate.data));
      }
    }

    return details.length > 0 ? `${message} (${details.join(" | ")})` : message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function parseJsonPayloadFromModel(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("AI returned an empty response.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("AI response was not valid JSON.");
  }
}
