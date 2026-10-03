// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Publishing } from "../src/client/pages/Publishing";
import { api, uploadMedia } from "../src/client/api";
import { platforms } from "../src/shared/types";
vi.mock("../src/client/api", () => ({ api: vi.fn(), uploadMedia: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const data = {
  posts: [],
  canManage: true,
  demo: true,
  options: platforms.map((platform) => ({
    platform,
    reason: "Demo",
    accounts: [
      {
        id: `demo:${platform}`,
        name: `${platform} demo`,
        demo: true,
        reason: "",
      },
    ],
  })),
};
it("schedules all selected channels using the date actually entered via the input event", async () => {
  vi.mocked(api).mockImplementation(async (_path, method, body) =>
    method === "PUT"
      ? {
          ...(body as object),
          revision: 1,
          status: "scheduled",
          targets: platforms.map((platform) => ({
            platform,
            status: "scheduled",
          })),
        }
      : data,
  );
  render(<Publishing tick={0} onAccounts={vi.fn()} />);
  await screen.findByText(
    "Demo scheduling is available for all seven platforms. No real posts are sent. Relay’s server must stay running to publish on time.",
  );
  fireEvent.change(screen.getByLabelText("Post text"), {
    target: { value: "My scheduled article" },
  });
  // Chromium date controls can dispatch input without React's change event.
  fireEvent.input(screen.getByLabelText(/Publish date and time/), {
    target: { value: "2030-06-01T14:30" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Schedule demo for all selected" }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      expect.stringMatching(/^\/posts\//),
      "PUT",
      expect.objectContaining({
        scheduledAt: new Date("2030-06-01T14:30").toISOString(),
        text: "My scheduled article",
        targets: platforms.map((platform) => ({
          platform,
          connectionId: `demo:${platform}`,
        })),
      }),
    ),
  );
  expect((await screen.findByRole("status")).textContent).toContain(
    "7 destination(s) scheduled",
  );
});
it("makes a blocked plan visibly different from a successful schedule", async () => {
  vi.mocked(api).mockImplementation(async (_path, method, body) =>
    method === "PUT"
      ? {
          ...(body as object),
          revision: 1,
          status: "blocked",
          targets: platforms.map((platform) => ({
            platform,
            status: "blocked",
          })),
        }
      : {
          ...data,
          demo: false,
          options: platforms.map((platform) => ({
            platform,
            accounts: [],
            reason: "Connect an account",
          })),
        },
  );
  render(<Publishing tick={0} onAccounts={vi.fn()} />);
  await screen.findByText(/Live publishing supports text/);
  fireEvent.change(screen.getByLabelText("Post text"), {
    target: { value: "Our update" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Schedule all selected" }),
  );
  expect((await screen.findByRole("status")).textContent).toContain(
    "every destination is blocked",
  );
});

it("saves an uploaded attachment and hashtags with its caption", async () => {
  vi.mocked(api).mockImplementation(async (_path, method, body) =>
    method === "PUT" ? { ...(body as object), revision: 1, targets: [] } : data,
  );
  vi.mocked(uploadMedia).mockResolvedValue({
    id: "asset",
    mime: "image/png",
    size: 42,
  });
  render(<Publishing tick={0} onAccounts={vi.fn()} />);
  await screen.findByText(/Demo scheduling is available/);
  fireEvent.change(screen.getByLabelText(/Upload image or video/), {
    target: {
      files: [new File(["image"], "photo.png", { type: "image/png" })],
    },
  });
  await screen.findByText(/Image attached/);
  fireEvent.change(screen.getByLabelText("Post text"), {
    target: { value: "My caption" },
  });
  fireEvent.change(screen.getByLabelText(/^Hashtags/), {
    target: { value: "launch news" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      expect.any(String),
      "PUT",
      expect.objectContaining({
        text: "My caption",
        hashtags: "launch news",
        mediaId: "asset",
      }),
    ),
  );
});
