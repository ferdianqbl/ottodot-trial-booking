import { createCn } from "cn/config";

/**
 * Class merging that knows the design system's named tokens (src/app/globals.css). Without this,
 * `text-caption` reads as a text *color* and silently drops `text-primary-foreground` from a button,
 * and `rounded-cards` is not recognised as a radius that `rounded-none` should replace.
 */
export const cn = createCn({
  extend: {
    theme: {
      text: ["caption", "body-sm", "body", "subheading", "heading-sm", "heading", "heading-lg", "display"],
      radius: ["inputs", "buttons", "cards", "tiles"],
    },
  },
});
