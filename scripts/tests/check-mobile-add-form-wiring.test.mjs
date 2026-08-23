import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkMobileAddFormWiring,
  findConfirmSaveViolations,
  findOrphanFormStateViolations,
} from "../check-mobile-add-form-wiring.mjs";

const compliantConfirm = `
const draft = getDraft(state, state.activeDraftId);
mutate((current) => setDraftNotes(current, current.activeDraftId, text));
<TextInput value={draft.notes} />
source: photo.source,
`;

describe("findOrphanFormStateViolations", () => {
  it("flags TextInput bound to orphan useState", () => {
    const violations = findOrphanFormStateViolations({
      filePath: "apps/mobile/app/(tabs)/add/confirm.tsx",
      source: `
        const [notes, setNotes] = useState("");
        <TextInput value={notes} onChangeText={setNotes} />
      `,
    });

    assert.equal(violations.length, 1);
    assert.match(violations[0], /notes/);
  });

  it("passes when the state is wired through mutate", () => {
    const violations = findOrphanFormStateViolations({
      filePath: "apps/mobile/app/(tabs)/add/confirm.tsx",
      source: `
        const [notes, setNotes] = useState("");
        mutate((current) => setDraftNotes(current, current.activeDraftId, notes));
        <TextInput value={notes} />
      `,
    });

    assert.deepEqual(violations, []);
  });
});

describe("findConfirmSaveViolations", () => {
  it("requires per-photo source and draft-backed notes", () => {
    assert.deepEqual(findConfirmSaveViolations({ confirmSource: compliantConfirm }), []);
  });

  it("fails when save uses a single default photo source", () => {
    const violations = findConfirmSaveViolations({
      confirmSource: `
        const defaultPhotoSource = "camera";
        source: defaultPhotoSource,
        draft.notes
        setDraftNotes
      `,
    });

    assert.ok(violations.some((line) => line.includes("photo.source")));
    assert.ok(violations.some((line) => line.includes("defaultPhotoSource")));
  });
});

describe("checkMobileAddFormWiring", () => {
  it("passes compliant confirm screen wiring", () => {
    assert.deepEqual(
      checkMobileAddFormWiring({
        addSources: [],
        confirmSource: compliantConfirm,
      }),
      [],
    );
  });
});
