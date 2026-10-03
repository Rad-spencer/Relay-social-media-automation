// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Auth } from "../src/client/pages/Auth";
import { api } from "../src/client/api";
vi.mock("../src/client/components/SocialLogin", () => ({
  SocialLogin: () => null,
}));
vi.mock("../src/client/api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function signup() {
  fireEvent.click(
    screen.getByRole("button", { name: "New here? Create a workspace" }),
  );
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: "Test owner" },
  });
  fireEvent.change(screen.getByLabelText("Workspace name"), {
    target: { value: "Test workspace" },
  });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "owner@example.test" },
  });
  fireEvent.change(screen.getByLabelText(/Password/), {
    target: { value: "test-only-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));
}
describe("signup recovery", () => {
  it("submits the workspace and opens the session", async () => {
    vi.mocked(api).mockResolvedValue({ ok: true });
    const ready = vi.fn().mockResolvedValue(undefined);
    render(<Auth onReady={ready} />);
    signup();
    await waitFor(() => expect(ready).toHaveBeenCalledOnce());
    expect(api).toHaveBeenCalledWith("/auth/register", "POST", {
      name: "Test owner",
      workspaceName: "Test workspace",
      email: "owner@example.test",
      password: "test-only-password",
    });
  });
  it("offers sign in after the account is created but session loading fails", async () => {
    vi.mocked(api).mockResolvedValue({ ok: true });
    render(
      <Auth onReady={vi.fn().mockRejectedValue(new Error("Session failed"))} />,
    );
    signup();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Your account was created",
    );
    expect(screen.getByRole("button", { name: /^Sign in$/ })).toBeTruthy();
    expect(api).toHaveBeenCalledOnce();
  });
  it("keeps signup available and displays a rejected registration", async () => {
    vi.mocked(api).mockRejectedValue(
      new Error("An account already exists with this email. Sign in instead."),
    );
    render(<Auth onReady={vi.fn()} />);
    signup();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "already exists",
    );
    expect(
      screen.getByRole("button", { name: "Create workspace" }),
    ).toBeTruthy();
  });
});
