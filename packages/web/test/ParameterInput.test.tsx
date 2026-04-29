import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ParameterInput } from "../src/components/ParameterInput.js";

function StatefulHarness({ onChangeSpy, initial = 5 }: { onChangeSpy: (v: number) => void; initial?: number }) {
  const [v, setV] = useState<number>(initial);
  return (
    <ParameterInput
      label="Team size"
      path="team.size"
      value={v}
      onChange={(n) => { setV(n); onChangeSpy(n); }}
    />
  );
}

describe("ParameterInput", () => {
  it("calls onChange with the parsed numeric value", async () => {
    const spy = vi.fn();
    render(<StatefulHarness onChangeSpy={spy} initial={5} />);
    const input = screen.getByDisplayValue("5") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "8");
    expect(spy).toHaveBeenLastCalledWith(8);
  });

  it("toggles randomize when the dice button is clicked", async () => {
    const onToggle = vi.fn();
    render(
      <ParameterInput label="Effort μ" path="work.effort_dist.mu" value={8}
        onChange={() => {}} randomizable randomized={false} onToggleRandomize={onToggle} />,
    );
    await userEvent.click(screen.getByRole("button", { pressed: false }));
    expect(onToggle).toHaveBeenCalled();
  });
});
