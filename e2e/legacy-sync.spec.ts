import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }) => {
  await context.route(/(?:gstatic\.com\/firebasejs|googleapis\.com|firebaseio\.com|firebasedatabase\.app)/u, (route) => route.abort());
  await page.goto("/");
});

test("characterizes the null sentinel and dirty-score merge protocol", async ({ page }) => {
  const actual = await page.evaluate(() => {
    const legacy = window as unknown as Record<string, any>;
    const source = { members: [{ name: "One" }, null, { name: "Three" }], nested: null };
    const wire = legacy.marshalNullsForFirebase(source);
    const roundTrip = legacy.unmarshalNullsFromFirebase(wire);
    const scores = { localDirty: 9, localClean: 8 };
    const finals = { finalDirty: 7 };
    legacy.mergeRemoteScoreField({ localDirty: 1, localClean: 2, remoteOnly: 3 }, scores, new Set(["localDirty"]));
    legacy.mergeRemoteScoreField({ finalDirty: 4, finalClean: 5 }, finals, new Set(["finalDirty"]));
    return { wire, roundTrip, scores, finals };
  });

  expect(actual.wire).toEqual({
    members: [{ name: "One" }, { __ffaNull: true }, { name: "Three" }],
    nested: { __ffaNull: true },
  });
  expect(actual.roundTrip).toEqual({ members: [{ name: "One" }, null, { name: "Three" }], nested: null });
  expect(actual.scores).toEqual({ localDirty: 9, localClean: 2, remoteOnly: 3 });
  expect(actual.finals).toEqual({ finalDirty: 7, finalClean: 5 });
});
