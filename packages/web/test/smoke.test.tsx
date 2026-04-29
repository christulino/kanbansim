import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("App router", () => {
  it("renders the landing hero by default", () => {
    render(<App />);
    expect(screen.getByText(/lowered/i)).toBeInTheDocument();
  });
});
