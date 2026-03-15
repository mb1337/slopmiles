import { Agent } from "@convex-dev/agent";
import { openrouter as openrouterProvider, createOpenRouter } from "@openrouter/ai-sdk-provider";

import { components } from "./_generated/api";
import { DEFAULT_EMBEDDING_MODEL, DEFAULT_OPENROUTER_MODEL } from "./aiHelpers";

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

function getOpenRouterApiKey(): string | undefined {
  return process?.env?.OPENROUTER_API_KEY?.trim();
}

function getOpenRouterBaseURL(): string | undefined {
  return process?.env?.OPENROUTER_BASE_URL?.trim();
}

function getOpenRouterReferer(): string | undefined {
  return process?.env?.OPENROUTER_REFERER?.trim() || process?.env?.CONVEX_SITE_URL?.trim();
}

function getOpenRouterTitle(): string {
  return process?.env?.OPENROUTER_TITLE?.trim() || "SlopMiles";
}

function createProvider() {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    return openrouterProvider;
  }

  return createOpenRouter({
    apiKey,
    baseURL: getOpenRouterBaseURL(),
    headers: {
      ...(getOpenRouterReferer() ? { "HTTP-Referer": getOpenRouterReferer() } : {}),
      "X-Title": getOpenRouterTitle(),
    },
  });
}

const provider = createProvider();

function getModelName(name?: string): string {
  return name?.trim() || process?.env?.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
}

export function buildCoachInstructions(): string {
  return [
    "You are SlopMiles, an expert running coach.",
    "Be practical, concise, and collaborative.",
    "Use the runner's personality preference for tone without becoming unsafe or vague.",
    "Prefer concrete suggestions over generic motivation.",
  ].join(" ");
}

export function buildPlanBuilderInstructions(): string {
  return [
    "You are SlopMiles, helping the user collaboratively shape a running plan.",
    "Respond conversationally, explain tradeoffs, and keep track of requested changes.",
    "The structured plan draft is generated separately, so your text should focus on what changed and why.",
    "Treat the user's structured seed fields as the starting point, not the final answer.",
  ].join(" ");
}

export function buildWeekBuilderInstructions(): string {
  return [
    "You are SlopMiles, helping the user collaboratively adapt one training week.",
    "Respond conversationally, explain how the week is changing, and preserve continuity with the current training block.",
    "The structured week draft is generated separately, so use text to summarize adjustments and tradeoffs.",
  ].join(" ");
}

export function buildAssessmentInstructions(): string {
  return [
    "You are SlopMiles, preparing an end-of-block assessment.",
    "Be direct, constructive, and grounded in the supplied training data.",
  ].join(" ");
}

export const coachAgent = new Agent(components.agent, {
  name: "Coach",
  languageModel: provider(getModelName()),
  textEmbeddingModel: provider.textEmbeddingModel(DEFAULT_EMBEDDING_MODEL),
  instructions: buildCoachInstructions(),
  maxSteps: 5,
});

export const planBuilderAgent = new Agent(components.agent, {
  name: "Plan Builder",
  languageModel: provider(getModelName()),
  textEmbeddingModel: provider.textEmbeddingModel(DEFAULT_EMBEDDING_MODEL),
  instructions: buildPlanBuilderInstructions(),
});

export const weekBuilderAgent = new Agent(components.agent, {
  name: "Week Builder",
  languageModel: provider(getModelName()),
  textEmbeddingModel: provider.textEmbeddingModel(DEFAULT_EMBEDDING_MODEL),
  instructions: buildWeekBuilderInstructions(),
});

export const assessmentAgent = new Agent(components.agent, {
  name: "Assessment",
  languageModel: provider(getModelName()),
  instructions: buildAssessmentInstructions(),
});
