import type { Field, Locator, Take } from "@genesis/core";

/**
 * Builders for locators and fields. They return the plain wire objects, so a locator written by
 * hand and one built here are the same thing.
 */

/** Elements matching a CSS selector. */
export const css = (selector: string, options: Omit<Locator, "css"> = {}): Locator => ({ css: selector, ...options });

/** Elements with an ARIA role, and optionally an accessible name. */
export const role = (name: string, accessibleName?: string, options: Omit<Locator, "role" | "name"> = {}): Locator =>
  accessibleName === undefined ? { role: name, ...options } : { role: name, name: accessibleName, ...options };

/** Elements whose text contains `value`, or equals it with `exact`. */
export const text = (value: string, options: Omit<Locator, "text"> = {}): Locator => ({ text: value, ...options });

/** The element of one record of an open list watch, optionally narrowed by a CSS selector inside it. */
export const record = (watch: string, key: string, selector?: string): Locator =>
  selector === undefined ? { record: { watch, key } } : { record: { watch, key }, css: selector };

const take = (value: Take) => (at?: string, options: Omit<Field, "at" | "take"> = {}): Field =>
  at === undefined ? { take: value, ...options } : { at, take: value, ...options };

/** Field builders. `at` is a CSS selector relative to the record's element. */
export const field = {
  text: take("text"),
  ownText: take("ownText"),
  exists: take("exists"),
  count: take("count"),
  number: take("number"),
  url: take("url"),
  value: take("value"),
  checked: take("checked"),
  visible: take("visible"),
  rect: take("rect"),
  attr: (name: string, at?: string, options: Omit<Field, "at" | "take"> = {}): Field => take({ attr: name })(at, options),
};
