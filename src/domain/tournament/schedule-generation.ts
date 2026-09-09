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
  raceDoubleEliminationBracketPhase,
  sharedFinalDoubleEliminationBracketPhase,
  type RaceDoubleEliminationConfig,
  type SharedFinalDoubleEliminationConfig,
} from "./double-elimination";
import {
  singleEliminationBracketPhase,
  type SingleEliminationConfig,
} from "./single-elimination";
import type {
  PoolingPhaseKey,
  RoomSize,
  ScheduleLogicKey,
  TournamentGroup,
  TournamentRound,
} from "./types";

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

interface CommonGenerationInput {
  poolingPhase: PoolingPhaseKey;
  config: PoolingConfig;
  roster: string[];
}

export type TournamentProgressionInput =
  | (CommonGenerationInput & {
      bracketPhase: "single-elimination";
      format: PoolingFormatConfig & SingleEliminationConfig;
    })
  | (CommonGenerationInput & {
      bracketPhase: "double-elimination";
      format: PoolingFormatConfig & RaceDoubleEliminationConfig;
    })
  | (CommonGenerationInput & {
      bracketPhase: "double-elimination-shared-final";
      format: PoolingFormatConfig & SharedFinalDoubleEliminationConfig;
    });

export function getMinimumBracketUnits(
  bracketPhase: Exclude<ScheduleLogicKey, "kings-valley">,
  roomSize: RoomSize,
): number {
  return bracketPhase === "double-elimination" ? 4 : 2 * roomSize.ideal;
}

function buildPoolingPhase(
  input: CommonGenerationInput & { format: PoolingFormatConfig },
): PoolingPhaseResult {
  switch (input.poolingPhase) {
    case "qual-table":
      return qualificationTablePoolingPhase(input.config, input.format);
    case "swiss":
      return swissPoolingPhase(input.config, input.format);
    case "group-stage":
      return groupStagePoolingPhase(input.config, input.roster);
    case "none":
      return noEliminationWarmupPoolingPhase(input.config, input.format);
  }
}

export function buildTournamentProgression(
  input: TournamentProgressionInput,
): SingleEliminationProgression {
  const pooled = buildPoolingPhase(input);
  let bracket: TournamentRound[];
  switch (input.bracketPhase) {
    case "single-elimination":
      bracket = singleEliminationBracketPhase(
        pooled.seedTotal,
        pooled.nextRoundNum,
        input.format,
      );
      break;
    case "double-elimination":
      bracket = raceDoubleEliminationBracketPhase(
        pooled.seedTotal,
        pooled.nextRoundNum,
        input.format,
      );
      break;
    case "double-elimination-shared-final":
      bracket = sharedFinalDoubleEliminationBracketPhase(
        pooled.seedTotal,
        pooled.nextRoundNum,
        input.format,
      );
      break;
  }
  return {
    rounds: [...pooled.rounds, ...bracket],
    groups: pooled.groups ?? [],
  };
}

export function buildSingleEliminationProgression({
  poolingPhase,
  config,
  format,
  roster,
}: SingleEliminationGenerationInput): SingleEliminationProgression {
  return buildTournamentProgression({
    bracketPhase: "single-elimination",
    poolingPhase,
    config,
    format,
    roster,
  });
}
