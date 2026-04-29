import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Header } from "../src/components/Header.js";

describe("Header", () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("data-theme"); });
  afterEach(() => { localStorage.clear(); });

  it("renders brand mark and nav links", () => {
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByText("KanbanSim")).toBeInTheDocument();
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("Learn")).toBeInTheDocument();
  });

  it("toggles theme and persists to localStorage", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Header /></MemoryRouter>);
    const toggle = screen.getByRole("button", { name: /toggle theme/i });
    await user.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("kanbansim:theme")).toBe("dark");
    await user.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
