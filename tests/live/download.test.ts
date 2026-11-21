import { botFile } from "@/lib/bot/download";

test("the compiled robot is served as a binary named XauBot.ex5", async () => {
  const f = (await botFile("ex5"))!;
  expect(f.filename).toBe("XauBot.ex5");
  expect(f.contentType).toBe("application/octet-stream");
  expect(f.body.length).toBeGreaterThan(10_000);
});
test("the source is served too, and it is the source the compiled file was built from", async () => {
  const f = (await botFile("mq5"))!;
  expect(f.filename).toBe("XauBot.mq5");
  expect(f.body.toString("utf8")).toContain("OnInit");
});
test("anything else is refused", async () => {
  expect(await botFile("../package.json")).toBeNull();
  expect(await botFile("")).toBeNull();
});
