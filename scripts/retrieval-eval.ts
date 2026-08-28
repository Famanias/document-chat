import nextEnv from "@next/env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  createCredentialedEmbeddingSource,
  createCredentialedEvidenceSelector,
} from "@/evaluation/retrieval/credentialed";
import {
  DEFAULT_RETRIEVAL_DATASET_PATH,
  loadRetrievalDataset,
} from "@/evaluation/retrieval/load-dataset";
import {
  createControlledEmbeddingSource,
  createThresholdEvidenceSelector,
  runRetrievalEvaluation,
  toComparableRetrievalReport,
  type RetrievalEvaluationReport,
} from "@/evaluation/retrieval/runner";

const DEFAULT_BASELINE_PATH = resolve(
  process.cwd(),
  "evaluation/retrieval/baselines/vector-only-v1.json",
);
const { loadEnvConfig } = nextEnv;

function optionValue(args: string[], option: string) {
  const inline = args.find((argument) => argument.startsWith(`${option}=`));
  if (inline) {
    const value = inline.slice(option.length + 1);
    if (!value) throw new Error(`${option} requires a value.`);
    return value;
  }
  const index = args.indexOf(option);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function assertKnownOptions(args: string[]) {
  const flags = new Set(["--check", "--credentialed", "--help"]);
  const valueOptions = new Set(["--dataset", "--output", "--baseline"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (flags.has(argument)) continue;
    if ([...valueOptions].some((option) => argument.startsWith(`${option}=`))) {
      continue;
    }
    if (valueOptions.has(argument)) {
      index += 1;
      continue;
    }
    throw new Error(`Unknown retrieval evaluation option: ${argument}`);
  }
}

function requireCredential(name: "OPENROUTER_API_KEY") {
  const value = process.env[name]?.replace(/^\uFEFF/, "").trim();
  if (!value) {
    throw new Error(
      `Credentialed retrieval evaluation requires ${name}. The credential-free check does not.`,
    );
  }
  return value;
}

async function writeReport(path: string, report: RetrievalEvaluationReport) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function checkBaseline(
  baselinePath: string,
  report: RetrievalEvaluationReport,
) {
  const absolutePath = resolve(baselinePath);
  const baseline = JSON.parse(
    await readFile(absolutePath, "utf8"),
  ) as RetrievalEvaluationReport;
  if (baseline.artifactSchemaVersion !== 1) {
    throw new Error(`Baseline ${absolutePath} has an unsupported artifact schema.`);
  }

  const expected = JSON.stringify(toComparableRetrievalReport(baseline));
  const actual = JSON.stringify(toComparableRetrievalReport(report));
  if (actual !== expected) {
    throw new Error(
      `Retrieval baseline changed. Inspect the report before recording a new immutable baseline; do not edit ${absolutePath} to hide a regression.`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  assertKnownOptions(args);
  if (args.includes("--help")) {
    process.stdout.write(`Usage: npm run eval:retrieval -- [options]\n\n--dataset <path>       Use another dataset\n--output <path>        Write the full JSON report\n--check                Compare controlled results with the committed baseline\n--baseline <path>      Override the baseline used by --check\n--credentialed         Use production OpenRouter embeddings, answers, and semantic judge\n`);
    return;
  }

  const credentialed = args.includes("--credentialed");
  const check = args.includes("--check");
  if (credentialed && check) {
    throw new Error("--credentialed and --check are separate workflows.");
  }

  const dataset = await loadRetrievalDataset(
    optionValue(args, "--dataset") ?? DEFAULT_RETRIEVAL_DATASET_PATH,
  );
  let embeddings;
  let selector;

  if (credentialed) {
    loadEnvConfig(process.cwd());
    const apiKey = requireCredential("OPENROUTER_API_KEY");
    const { modelConfig } = await import("@/lib/ai/model-config");
    const judgeModelId = process.env.OPENROUTER_JUDGE_MODEL ?? modelConfig.chat;
    embeddings = createCredentialedEmbeddingSource({
      apiKey,
      modelId: modelConfig.embedding,
      dimensions: modelConfig.embeddingDimensions,
    });
    selector = createCredentialedEvidenceSelector({
      apiKey,
      answerModelId: modelConfig.chat,
      judgeModelId,
    });
  } else {
    embeddings = createControlledEmbeddingSource(dataset);
    selector = createThresholdEvidenceSelector(
      dataset.definition.controlledRun.selectionSimilarityThreshold,
      dataset.definition.controlledRun.selectionLimit,
    );
  }

  const report = await runRetrievalEvaluation(dataset, embeddings, selector);
  if (check) {
    await checkBaseline(
      optionValue(args, "--baseline") ?? DEFAULT_BASELINE_PATH,
      report,
    );
    process.stdout.write(
      `Retrieval dataset and deterministic baseline are valid (${report.dataset.caseCount} cases, ${report.dataset.documentCount} documents).\n`,
    );
    return;
  }

  const outputPath = optionValue(args, "--output");
  if (outputPath) await writeReport(outputPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Retrieval evaluation failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
