import { Agent } from "../agent/agent";
import { AgentOrchestrator } from "./orchestrator";

describe("AgentOrchestrator", () => {

  let planner: jest.Mocked<Agent>;
  let worker: jest.Mocked<Agent>;

  beforeEach(() => {

    planner = {
      run: jest.fn()
    } as any;

    worker = {
      run: jest.fn()
    } as any;

  });

  it("should initialize orchestrator correctly", () => {

    const orchestrator = new AgentOrchestrator(planner, [
      {
        name: "worker",
        description: "Test worker",
        agent: worker
      }
    ]);

    expect(orchestrator).toBeDefined();

  });

  it("should finish immediately when planner returns finish", async () => {

    planner.run.mockResolvedValue(
      JSON.stringify({
        agent: "finish",
        instruction: "Task completed"
      })
    );

    const orchestrator = new AgentOrchestrator(planner, []);

    const result = await orchestrator.run("Test task");

    expect(planner.run).toHaveBeenCalled();
    expect(result).toBe("Task completed");

  });

  it("should call the selected agent", async () => {

    planner.run
      .mockResolvedValueOnce(
        JSON.stringify({
          agent: "worker",
          instruction: "Do something"
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          agent: "finish",
          instruction: "Done"
        })
      );

    worker.run.mockResolvedValue("Worker result");

    const orchestrator = new AgentOrchestrator(planner, [
      {
        name: "worker",
        description: "Test worker",
        agent: worker
      }
    ]);

    const result = await orchestrator.run("Test task");

    expect(worker.run).toHaveBeenCalledWith("Do something");
    expect(result).toBe("Done");

  });

  it("should append agent result to context", async () => {

    planner.run
      .mockResolvedValueOnce(
        JSON.stringify({
          agent: "worker",
          instruction: "Process data"
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          agent: "finish",
          instruction: "Finished"
        })
      );

    worker.run.mockResolvedValue("Processed");

    const orchestrator = new AgentOrchestrator(planner, [
      {
        name: "worker",
        description: "Test worker",
        agent: worker
      }
    ]);

    await orchestrator.run("Initial task");

    const secondPlannerCall = planner.run.mock.calls[1][0];

    expect(secondPlannerCall).toContain("worker result");
    expect(secondPlannerCall).toContain("Processed");

  });

  it("should throw error if planner selects unknown agent", async () => {

    planner.run.mockResolvedValue(
      JSON.stringify({
        agent: "ghost",
        instruction: "Do something"
      })
    );

    const orchestrator = new AgentOrchestrator(planner, []);

    await expect(orchestrator.run("Task"))
      .rejects
      .toThrow("Agent not found");

  });

  it("should stop after max steps", async () => {

    planner.run.mockResolvedValue(
      JSON.stringify({
        agent: "worker",
        instruction: "Loop"
      })
    );

    worker.run.mockResolvedValue("Loop result");

    const orchestrator = new AgentOrchestrator(planner, [
      {
        name: "worker",
        description: "Test worker",
        agent: worker
      }
    ]);

    const result = await orchestrator.run("Loop task");

    expect(planner.run).toHaveBeenCalledTimes(10);
    expect(result).toContain("worker result");

  });

});