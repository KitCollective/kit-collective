import { describe, expect, it } from "vitest";
import { buttonLayoutStyles } from "../src/components/button-layout";
import { radius, space } from "../src/theme/tokens";

describe("buttonLayoutStyles", () => {
  it("uses hug width with 44px min height and radius.sm", () => {
    const styles = buttonLayoutStyles("hug");

    expect(styles.minHeight).toBe(44);
    expect(styles.borderRadius).toBe(radius.sm);
    expect(styles.alignSelf).toBeUndefined();
    expect(styles.width).toBeUndefined();
  });

  it("uses fill width with 48px min height and full stretch", () => {
    const styles = buttonLayoutStyles("fill");

    expect(styles.minHeight).toBe(48);
    expect(styles.borderRadius).toBe(radius.sm);
    expect(styles.alignSelf).toBe("stretch");
    expect(styles.width).toBe("100%");
    expect(styles.paddingHorizontal).toBe(space.insetMd);
  });
});
