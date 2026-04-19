import { extractJson } from "../utils.js";

describe("extractJson", () => {
  it("extracts plain JSON", () => {
    const raw = '{"a":1}';
    expect(extractJson(raw)).toBe('{"a":1}');
  });

  it("extracts JSON from markdown code block", () => {
    const raw = "```json\n{\"a\":1}\n```";
    expect(extractJson(raw)).toBe('{"a":1}');
  });

  it("extracts JSON from plain code block", () => {
    const raw = "```\n{\"a\":1}\n```";
    expect(extractJson(raw)).toBe('{"a":1}');
  });

  it("extracts JSON from mixed text", () => {
    const raw = "Here is the result:\n\n```json\n{\"score\":80}\n```\n\nDone.";
    expect(extractJson(raw)).toBe('{"score":80}');
  });

  it("extracts JSON without code fences in mixed text", () => {
    const raw = "The result is {\"score\":80} thanks.";
    expect(extractJson(raw)).toBe('{"score":80}');
  });

  it("throws when no JSON found", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});
