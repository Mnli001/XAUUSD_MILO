// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useFullscreen, FullscreenButton, FullscreenExit } from "@/components/useFullscreen";

function Box() {
  const { ref, full, toggle, boxClass } = useFullscreen<HTMLDivElement>();
  const fs = { full, toggle };
  return <div ref={ref} data-testid="box" className={`${full ? "full" : ""} ${boxClass}`}><FullscreenButton fs={fs} /><FullscreenExit fs={fs} /></div>;
}

test("without the browser's fullscreen (an iPhone), the box fills the window instead, and Escape or the button brings it back", () => {
  render(<Box />);
  const box = screen.getByTestId("box");
  fireEvent.click(screen.getByRole("button", { name: "Бүтэн дэлгэц" }));
  expect(box).toHaveClass("full");
  expect(box).toHaveClass("fixed");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(box).not.toHaveClass("full");
  fireEvent.click(screen.getByRole("button", { name: "Бүтэн дэлгэц" }));
  fireEvent.click(screen.getByRole("button", { name: "Жижигрүүлэх" }));
  expect(box).not.toHaveClass("full");
});

test("with the browser's fullscreen, the box itself goes fullscreen and follows the browser leaving it", async () => {
  let current: Element | null = null;
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => current });
  // eslint-disable-next-line @typescript-eslint/no-this-alias -- the stub records which element asked, as the browser does
  HTMLElement.prototype.requestFullscreen = function () { current = this; document.dispatchEvent(new Event("fullscreenchange")); return Promise.resolve(); };
  document.exitFullscreen = () => { current = null; document.dispatchEvent(new Event("fullscreenchange")); return Promise.resolve(); };
  render(<Box />);
  const box = screen.getByTestId("box");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Бүтэн дэлгэц" })); });
  expect(current).toBe(box);
  expect(box).toHaveClass("full");
  await act(async () => { await document.exitFullscreen(); }); // the browser's own Escape
  expect(box).not.toHaveClass("full");
});

test("while full screen a labelled exit button is always there, and it brings the page back", async () => {
  render(<Box />);
  expect(screen.queryByRole("button", { name: "Бүтэн дэлгэцээс гарах" })).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Бүтэн дэлгэц" })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Бүтэн дэлгэцээс гарах" })); });
  expect(screen.getByTestId("box")).not.toHaveClass("full");
  expect(screen.queryByRole("button", { name: "Бүтэн дэлгэцээс гарах" })).toBeNull();
});
