// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SocialConnections } from "../src/client/components/SocialConnections";
import { api } from "../src/client/api";
vi.mock("../src/client/api", () => ({ api: vi.fn() }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const data = {
  providers: [
    {
      id: "instagram",
      platform: "instagram",
      name: "Instagram",
      enabled: false,
      reason: "Administrator setup required",
      callbackUrl: "http://localhost:3000/api/auth/social/instagram/callback",
    },
  ],
  connections: [],
  canConnect: true,
};
it("offers actionable setup for an unavailable provider without starting OAuth", async () => {
  vi.mocked(api).mockResolvedValue(data);
  render(<SocialConnections tick={0} />);
  const button = await screen.findByRole("button", {
    name: "Set up Instagram",
  });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(button);
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByText("INSTAGRAM_CLIENT_ID")).toBeTruthy();
  expect(
    (screen.getByLabelText(/Current callback URL/) as HTMLInputElement).value,
  ).toBe(data.providers[0].callbackUrl);
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Check setup" }));
  expect((await screen.findByRole("status")).textContent).toBe(
    "Administrator setup required",
  );
});
it("rechecks configuration and enables Connect only once the server reports readiness", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce(data)
    .mockResolvedValueOnce({
      ...data,
      providers: [{ ...data.providers[0], enabled: true, reason: "" }],
    });
  render(<SocialConnections tick={0} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Set up Instagram" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Check setup" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    (
      screen.getByRole("button", {
        name: "Connect Instagram",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
