import { describe, expect, it } from "vitest";
import { collectionConversationsSchema } from "../src/collection/conversations.js";

describe("collectionConversationsSchema", () => {
  it("accepts an empty conversation list", () => {
    expect(collectionConversationsSchema.parse({ conversations: [] })).toEqual({
      conversations: [],
    });
  });
});
