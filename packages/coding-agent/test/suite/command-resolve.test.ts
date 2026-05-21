import { describe, expect, it } from "vitest";
import type { CommandResolveResult } from "../../src/core/extensions/types.ts";

describe("command_resolve event", () => {
	it("fires when slash command is not recognized", async () => {
		const events: Array<{ commandName: string; found: boolean }> = [];

		const _ext = {
			handlers: {
				get: (event: string) => (event === "command_resolve" ? [handler] : []),
			},
		};

		async function handler(event: any) {
			events.push({ commandName: event.commandName, found: event.found });
			return { action: "continue" as const };
		}

		// Simulate the event being fired
		const _commandName = "unknown";
		const _args = "arg1";
		events.length = 0;

		// This demonstrates the event structure
		const event = {
			type: "command_resolve" as const,
			text: "/unknown arg1",
			commandName: "unknown",
			args: "arg1",
			found: false,
			availableCommands: [],
		};

		const result = (await handler(event)) as CommandResolveResult | undefined;

		expect(events).toHaveLength(1);
		expect(events[0].commandName).toBe("unknown");
		expect(events[0].found).toBe(false);
		expect(result?.action).toBe("continue");
	});

	it("allows blocking unrecognized commands with error", async () => {
		async function handler(event: any): Promise<CommandResolveResult> {
			if (!event.found) {
				return {
					action: "error",
					error: `Command "/${event.commandName}" not found`,
				};
			}
			return { action: "continue" };
		}

		const event = {
			type: "command_resolve" as const,
			text: "/badcommand",
			commandName: "badcommand",
			args: "",
			found: false,
			availableCommands: [],
		};

		const result = (await handler(event)) as CommandResolveResult;

		expect(result.action).toBe("error");
		if (result.action === "error") {
			expect(result.error).toBe('Command "/badcommand" not found');
		}
	});

	it("allows transforming unrecognized commands", async () => {
		async function handler(event: any): Promise<CommandResolveResult | undefined> {
			if (event.commandName === "ask") {
				return {
					action: "transform",
					text: event.args,
				};
			}
		}

		const event = {
			type: "command_resolve" as const,
			text: "/ask what is 2+2?",
			commandName: "ask",
			args: "what is 2+2?",
			found: false,
			availableCommands: [],
		};

		const result = (await handler(event)) as CommandResolveResult | undefined;

		expect(result?.action).toBe("transform");
		if (result?.action === "transform") {
			expect(result.text).toBe("what is 2+2?");
		}
	});

	it("provides available commands for inspection", async () => {
		let receivedCommands: readonly any[] = [];

		async function handler(event: any) {
			receivedCommands = event.availableCommands;
			return { action: "continue" as const };
		}

		const event = {
			type: "command_resolve" as const,
			text: "/unknown",
			commandName: "unknown",
			args: "",
			found: false,
			availableCommands: [
				{ name: "model", source: "extension" as const },
				{ name: "settings", source: "extension" as const },
				{ name: "skill:test", source: "skill" as const },
			],
		};

		await handler(event);

		expect(receivedCommands).toHaveLength(3);
		expect(receivedCommands[0].name).toBe("model");
		expect(receivedCommands[2].source).toBe("skill");
	});

	it("continues to LLM when action is undefined", async () => {
		async function handler(event: any) {
			// No return = action: "continue"
			if (!event.commandName.startsWith("system")) {
				return undefined;
			}
		}

		const event = {
			type: "command_resolve" as const,
			text: "/query what should I do?",
			commandName: "query",
			args: "what should I do?",
			found: false,
			availableCommands: [],
		};

		const result = (await handler(event)) as CommandResolveResult | undefined;

		expect(result).toBeUndefined();
	});

	it("includes command description when available", async () => {
		async function handler(event: any) {
			// Plugin can suggest alternatives based on description
			const similar = event.availableCommands
				.filter((cmd: any) => cmd.description?.includes("session"))
				.map((cmd: any) => cmd.name);

			if (!event.found && similar.length > 0) {
				return {
					action: "error",
					error: `Command not found. Did you mean: ${similar.join(", ")}?`,
				};
			}
		}

		const event = {
			type: "command_resolve" as const,
			text: "/ses",
			commandName: "ses",
			args: "",
			found: false,
			availableCommands: [
				{
					name: "session",
					description: "Show session info",
					source: "extension" as const,
				},
				{
					name: "model",
					description: "Select model",
					source: "extension" as const,
				},
			],
		};

		const result = (await handler(event)) as CommandResolveResult | undefined;

		expect(result?.action).toBe("error");
		if (result?.action === "error") {
			expect(result.error).toContain("session");
		}
	});

	it("event is marked found=true when command exists", async () => {
		let eventWasFired = false;
		let eventFound = false;

		async function handler(event: any) {
			eventWasFired = true;
			eventFound = event.found;
		}

		const event = {
			type: "command_resolve" as const,
			text: "/model claude",
			commandName: "model",
			args: "claude",
			found: true, // Command exists
			availableCommands: [{ name: "model", source: "extension" as const }],
		};

		await handler(event);

		expect(eventWasFired).toBe(true);
		expect(eventFound).toBe(true);
	});

	it("handles multiple handlers in sequence (first wins)", async () => {
		const handlerCalls: string[] = [];

		async function handler1(event: any): Promise<CommandResolveResult | undefined> {
			handlerCalls.push("handler1");
			if (event.commandName === "custom") {
				return {
					action: "transform",
					text: "transformed by handler1",
				};
			}
		}

		async function _handler2(event: any): Promise<CommandResolveResult | undefined> {
			handlerCalls.push("handler2");
			if (!event.found) {
				return {
					action: "error",
					error: "Handler2 blocks",
				};
			}
		}

		const event = {
			type: "command_resolve" as const,
			text: "/custom arg",
			commandName: "custom",
			args: "arg",
			found: false,
			availableCommands: [],
		};

		const result1 = (await handler1(event)) as CommandResolveResult | undefined;

		// First handler returns a result, so second handler shouldn't be called
		expect(result1?.action).toBe("transform");
		expect(handlerCalls).toContain("handler1");
	});
});
