import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const roster = Array.from(
  { length: 16 },
  (_, index) => `Player ${String(index + 1).padStart(2, "0")}`,
).join("\n");

async function blockFirebase(context: BrowserContext) {
  await context.route(/(?:gstatic\.com\/firebasejs|firebaseio\.com)/u, (route) =>
    route.abort(),
  );
}

async function openUnlockedAdmin(context: BrowserContext, page: Page) {
  await context.addInitScript(() => {
    let randomState = 0x5eed1234;
    Math.random = () => {
      randomState = (1664525 * randomState + 1013904223) >>> 0;
      return randomState / 0x1_0000_0000;
    };
    Date.now = () => 1_735_689_600_000;
    localStorage.setItem("curveFFA_admin_unlocked", "true");
  });
  await page.goto("/");
  await page.locator('nav button[data-tab="admin"]').click();
  await expect(page.locator("#panel-setup")).toBeVisible();
}

async function startIndividualTournament(
  page: Page,
  finalsGames: "1" | "2" | "3" | "4" = "3",
) {
  await page.locator("#cfg-title").fill("Characterization Tournament");
  await page.locator("#cfg-finals-games").selectOption(finalsGames);
  await page.locator("#cfg-roster").fill(roster);
  await page.getByRole("button", { name: "Load roster & reserves" }).click();
  await page.getByRole("button", { name: /Generate Schedule/u }).click();
  await expect(page.locator("#preview-wrap")).toBeVisible();
  await page.getByRole("button", { name: /Confirm & Start/u }).click();
  await expect(page.locator("#panel-running")).toBeVisible();
}

async function scoreCurrentRoomRound(page: Page) {
  const inputs = page.locator(
    "#admin-rooms input.score-inp:not([disabled])",
  );
  const roomPositions = new Map<string, number>();
  for (let index = 0; index < (await inputs.count()); index += 1) {
    const input = inputs.nth(index);
    const room = (await input.getAttribute("data-rm")) ?? "1";
    const position = (roomPositions.get(room) ?? 0) + 1;
    roomPositions.set(room, position);
    await input.fill(String(900 - position * 100));
  }
}

async function reachFinal(page: Page) {
  for (let round = 1; round <= 4; round += 1) {
    await scoreCurrentRoomRound(page);
    await page.getByRole("button", { name: /Next Round/u }).click();
    await expect(page.locator("#hdr-round")).toHaveText(String(round + 1));
  }
}

test("fails closed with the exact offline admin-verification response", async ({
  context,
  page,
}) => {
  await blockFirebase(context);
  await page.goto("/");
  await page.locator('nav button[data-tab="admin"]').click();
  await page.locator("#admin-pw-input").fill("offline-characterization-value");
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page.locator("#admin-pw-error")).toHaveText(
    "Can't verify the password right now — check your connection and try again.",
  );
  await expect(page.locator("#admin-pw-overlay")).toBeVisible();
  await expect(page.locator("#admin-pw-input")).toBeEmpty();
  await expect(page.locator("#admin-pw-input")).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("curveFFA_admin_unlocked")),
    )
    .toBeNull();
});

test("locking Admin clears both browser credentials and returns to Bracket", async ({
  context,
  page,
}) => {
  await blockFirebase(context);
  await context.addInitScript(() => {
    localStorage.setItem("curveFFA_admin_proof_hash", "test-only-proof");
  });
  await openUnlockedAdmin(context, page);
  await page.getByRole("button", { name: /Lock Admin/u }).click();

  await expect(page.locator('nav button[data-tab="bracket"]')).toHaveClass(
    /active/u,
  );
  await expect
    .poll(() =>
      page.evaluate(() => ({
        proof: localStorage.getItem("curveFFA_admin_proof_hash"),
        unlocked: localStorage.getItem("curveFFA_admin_unlocked"),
      })),
    )
    .toEqual({ proof: null, unlocked: null });

  await page.locator('nav button[data-tab="admin"]').click();
  await expect(page.locator("#admin-pw-overlay")).toBeVisible();
});

test("persists the exact fresh legacy envelope shape", async ({
  context,
  page,
}) => {
  await blockFirebase(context);
  await openUnlockedAdmin(context, page);

  const envelope = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("curveFFA_state_v1") ?? "{}"),
  );
  expect(Object.keys(envelope).sort()).toEqual(["T", "activeTab", "setup"]);
  expect(Object.keys(envelope.T).sort()).toEqual(
    [
      "assignments",
      "autoSaved",
      "byes",
      "cfg",
      "confirmedCount",
      "curRound",
      "defenderChanges",
      "finalScores",
      "gameFormat",
      "gamemodeConfig",
      "groupStandings",
      "groups",
      "luckyLosers",
      "needsSave",
      "pendingBracketSeeds",
      "players",
      "poolingByeCounts",
      "qualTable",
      "reserveIndividuals",
      "reserveOpen",
      "reserves",
      "rounds",
      "scheduleLogic",
      "scores",
      "started",
      "tieResolutions",
      "title",
      "tournamentId",
    ].sort(),
  );
  expect(Object.keys(envelope.setup).sort()).toEqual(
    [
      "finalOverride",
      "finalsGames",
      "gameFormat",
      "grandFinalLbTarget",
      "grandFinalWbTarget",
      "groupSize",
      "oddCountStrategy",
      "poolingPhase",
      "qualAdv",
      "qualifiersPerGroup",
      "reserveIndividuals",
      "reserves",
      "roster",
      "roundRobinMode",
      "scheduleLogic",
      "scoring",
      "semisGames",
      "semisOverride",
      "teamScoringRule",
    ].sort(),
  );
  expect(envelope.activeTab).toBe("admin");
  expect(envelope.setup).toEqual({
    finalOverride: "",
    finalsGames: "3",
    gameFormat: "ffa-individual",
    grandFinalLbTarget: "3",
    grandFinalWbTarget: "2",
    groupSize: "4",
    oddCountStrategy: "",
    poolingPhase: "none",
    qualAdv: "24",
    qualifiersPerGroup: "2",
    reserveIndividuals: "",
    reserves: "",
    roster: "",
    roundRobinMode: "single",
    scheduleLogic: "single-elimination",
    scoring: "fairpoints",
    semisGames: "1",
    semisOverride: "",
    teamScoringRule: "",
  });
  expect(envelope.setup).not.toHaveProperty("lbQualifiers");
});

test("3v3 exposes team fields and changes double-elimination compatibility in Flex mode", async ({
  context,
  page,
}) => {
  await blockFirebase(context);
  await openUnlockedAdmin(context, page);
  await page.locator("#cfg-game-format").selectOption("team-3v3");

  await expect(page.locator("#field-team-scoring-rule")).toBeVisible();
  await expect(page.locator("#field-odd-count-strategy")).toBeVisible();
  await expect(page.locator("#field-reserve-individuals")).toBeVisible();
  await expect(page.locator("#roster-title-hint")).toContainText(
    "TeamName, Player1, Player2, Player3",
  );
  await expect(
    page.locator('#cfg-schedule-logic option[value="double-elimination"]'),
  ).toBeEnabled();
  await expect(
    page.locator(
      '#cfg-schedule-logic option[value="double-elimination-shared-final"]',
    ),
  ).toBeDisabled();

  await page.locator("#cfg-odd-count-strategy").selectOption("flex");
  await expect(
    page.locator('#cfg-schedule-logic option[value="double-elimination"]'),
  ).toBeDisabled();
  await expect(
    page.locator(
      '#cfg-schedule-logic option[value="double-elimination-shared-final"]',
    ),
  ).toBeEnabled();
});

test("Group Stage previews group sizes and rejects an impossible qualifier count", async ({
  context,
  page,
}) => {
  await blockFirebase(context);
  await openUnlockedAdmin(context, page);
  await page.locator("#cfg-roster").fill(roster);
  await page.getByRole("button", { name: "Load roster & reserves" }).click();
  await page.locator("#cfg-pooling-phase").selectOption("group-stage");

  await expect(page.locator("#field-group-size")).toBeVisible();
  await expect(page.locator("#field-round-robin-mode")).toBeVisible();
  await expect(page.locator("#field-qualifiers-per-group")).toBeVisible();
  await expect(page.locator("#group-stage-preview")).toContainText(
    "4 groups (sizes: 4, 4, 4, 4)",
  );
  await expect(page.locator("#group-stage-preview")).toContainText(
    "3 rounds single / 6 rounds double",
  );

  await page.locator("#cfg-round-robin-mode").selectOption("double");
  await expect(page.locator("#group-stage-preview")).toContainText(
    "currently using 6",
  );
  await page.locator("#cfg-qualifiers-per-group").fill("4");
  await expect(page.locator("#group-stage-preview")).toContainText(
    "must be greater than qualifiers per group",
  );
});

test("team roster parsing preserves IDs and pads missing member slots with null", async ({
  context,
  page,
}) => {
  await blockFirebase(context);
  await openUnlockedAdmin(context, page);
  await page.locator("#cfg-game-format").selectOption("team-3v3");
  await page.locator("#cfg-roster").fill("Alpha, Ann (uid-ann), Bob");
  await page
    .locator("#cfg-reserve-individuals")
    .fill("Casey (uid-casey)\nDana");
  await page.getByRole("button", { name: "Load roster & reserves" }).click();

  const parsed = await page.evaluate(() => {
    const saved = JSON.parse(
      localStorage.getItem("curveFFA_state_v1") ?? "{}",
    ) as {
      T?: {
        players?: Array<{ members: unknown[]; teamName: string }>;
        reserveIndividuals?: unknown[];
      };
    };
    return {
      players: saved.T?.players,
      reserveIndividuals: saved.T?.reserveIndividuals,
    };
  });
  expect(parsed.players?.[0]).toMatchObject({
    members: [{ name: "Ann", userId: "uid-ann" }, { name: "Bob" }, null],
    teamName: "Alpha",
  });
  expect(parsed.reserveIndividuals).toEqual([
    { name: "Casey", userId: "uid-casey" },
    { name: "Dana" },
  ]);
});

test("running scores, viewer tabs, active tab, and round progression survive reload", async ({
  context,
  page,
}) => {
  await blockFirebase(context);
  await openUnlockedAdmin(context, page);
  await startIndividualTournament(page);
  await scoreCurrentRoomRound(page);

  await page.locator('nav button[data-tab="scoreboard"]').click();
  await expect(page.locator("#sb-content")).toContainText("800");
  await page.locator('nav button[data-tab="bracket"]').click();
  await expect(
    page.locator("#br-content input.score-inp:not([disabled])"),
  ).toHaveCount(16);
  await page.locator('nav button[data-tab="rankings"]').click();
  await page.reload();

  await expect(page.locator('nav button[data-tab="rankings"]')).toHaveClass(
    /active/u,
  );
  await expect(page.locator("#hdr-title")).toHaveText(
    "Characterization Tournament",
  );
  await expect(page.locator("#hdr-round")).toHaveText("1");
  await page.locator('nav button[data-tab="admin"]').click();
  await page.getByRole("button", { name: /Next Round/u }).click();
  await expect(page.locator("#hdr-round")).toHaveText("2");
});

test("documents the legacy single-game Final completion defect", async ({
  context,
  page,
}) => {
  await blockFirebase(context);
  await openUnlockedAdmin(context, page);
  await startIndividualTournament(page, "1");
  await reachFinal(page);
  await scoreCurrentRoomRound(page);

  await page.locator('nav button[data-tab="rankings"]').click();
  await expect(page.locator("#rk-content .rk-active")).toHaveCount(8);
  await expect(page.locator("#rk-content .rk-champion")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(
          localStorage.getItem("curveFFA_state_v1") ?? "{}",
        ) as { T?: { autoSaved?: boolean } };
        return saved.T?.autoSaved;
      }),
    )
    .toBe(false);
});

test("documents the legacy multi-game Final tab defect", async ({
  context,
  page,
}) => {
  await blockFirebase(context);
  await openUnlockedAdmin(context, page);
  await startIndividualTournament(page, "3");
  await reachFinal(page);
  await expect(page.locator("#fg-1")).toBeVisible();

  await page.locator("#gtab-2").click();
  await expect(page.locator("#fg-wrap")).toBeHidden();
  await expect(page.locator("#fg-2 input.score-inp").first()).toBeHidden();
});
