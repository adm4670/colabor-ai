import { ToolRegistry } from "./toolRegistry"

describe("ToolRegistry", () => {

  it("should register a tool", () => {

    const registry = new ToolRegistry()

    const tool: any = {
      name: "test",
      description: "",
      parameters: {},
      execute: jest.fn()
    }

    registry.register(tool)

    const stored = registry.get("test")

    expect(stored).toBe(tool)

  })

  it("should return undefined for unknown tool", () => {

    const registry = new ToolRegistry()

    const result = registry.get("unknown")

    expect(result).toBeUndefined()

  });
});