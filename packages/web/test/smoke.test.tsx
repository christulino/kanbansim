import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("App router", () => {
  it("renders the landing placeholder by default", () => {
    render(<App />);
    expect(screen.getByText(/Landing \(placeholder\)/)).toBeInTheDocument();
  });
});
