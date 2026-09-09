import {
  groupStagePoolingPhase,
  noEliminationWarmupPoolingPhase,
  qualificationTablePoolingPhase,
  swissPoolingPhase,
  type PoolingConfig,
  type PoolingFormatConfig,
  type PoolingPhaseResult,
} from "./pooling";
import {
  singleEliminationBracketPhase,
  type SingleEliminationConfig,
} from "./single-elimination";
import type { PoolingPhaseKey, TournamentGroup, TournamentRound } from "./types";

export interface SingleEliminationProgression {
  rounds: TournamentRound[];
  groups: TournamentGroup[];
}

export interface SingleEliminationGenerationInput {
  poolingPhase: PoolingPhaseKey;
  config: PoolingConfig;
  format: PoolingFormatConfig & SingleEliminationConfig;
  roster: string[];
}

export function buildSingleEliminationProgression({
  poolingPhase,
  config,
  format,
  roster,
}: SingleEliminationGenerationInput): SingleEliminationProgression {
  let pooled: PoolingPhaseResult;
  switch (poolingPhase) {
    case "qual-table":
      pooled = qualificationTablePoolingPhase(config, format);
      break;
    case "swiss":
      pooled = swissPoolingPhase(config, format);
      break;
    case "group-stage":
      pooled = groupStagePoolingPhase(config, roster);
      break;
    case "none":
      pooled = noEliminationWarmupPoolingPhase(config, format);
      break;
  }

  return {
    rounds: [
      ...pooled.rounds,
      ...singleEliminationBracketPhase(
        pooled.seedTotal,
        pooled.nextRoundNum,
        format,
      ),
    ],
    groups: pooled.groups ?? [],
  };
}
