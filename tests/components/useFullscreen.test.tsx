// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useFullscreen, FullscreenButton } from "@/components/useFullscreen";

function Box() {
  const fs = useFullscreen<HTMLDivElement>();
  return <div ref={fs.ref} data-testid="box" className={`${fs.full ? "full" : ""} ${fs.boxClass}`}><FullscreenButton fs={fs} /></div>;
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
