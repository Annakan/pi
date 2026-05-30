/**
 * Command Fall-through Extension
 *
 * Demonstrates the `command_resolve` API by letting the user control what
 * happens to unrecognized slash commands.
 *
 * - Fall-through OFF (default): unrecognized `/commands` are blocked with an
 *   error instead of being sent to the LLM.
 * - Fall-through ON: unrecognized `/commands` are passed through to the LLM
 *   (pi's built-in behavior).
 *
 * The setting is persisted globally in `<agentDir>/command-fallthrough.json`
 * so it survives restarts, and can be toggled from a settings page opened
 * with `/fallthrough`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { Container, type SettingItem, SettingsList } from "@earendil-works/pi-tui";

interface FallthroughConfig {
	/** When true, unrecognized slash commands are sent to the LLM. */
	fallthrough: boolean;
}

const DEFAULT_CONFIG: FallthroughConfig = { fallthrough: false };

export default function commandFallthrough(pi: ExtensionAPI) {
	const configPath = join(getAgentDir(), "command-fallthrough.json");
	const config: FallthroughConfig = loadConfig(configPath);

	function persist() {
		try {
			writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
		} catch (error) {
			// Non-fatal: the setting stays applied for this session.
			console.error(`command-fallthrough: failed to write ${configPath}:`, error);
		}
	}

	// Decide what happens to unrecognized slash commands.
	pi.on("command_resolve", async (event) => {
		// A built-in command, skill, or template handled it; nothing to do.
		if (event.found) {
			return { action: "continue" };
		}

		// Fall-through enabled: defer to pi's default (send to the LLM).
		if (config.fallthrough) {
			return { action: "continue" };
		}

		// Fall-through disabled: block the command instead of prompting the LLM.
		return {
			action: "error",
			error:
				`Unrecognized command "/${event.commandName}". ` +
				`Fall-through to the LLM is disabled. Run /fallthrough to change this.`,
		};
	});

	// Settings page to toggle the behavior.
	pi.registerCommand("fallthrough", {
		description: "Toggle whether unrecognized slash commands fall through to the LLM",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (!ctx.hasUI) {
				ctx.ui.notify(`Command fall-through is ${config.fallthrough ? "on" : "off"}.`);
				return;
			}

			await ctx.ui.custom<void>((tui: TUI, theme, _keybindings, done) => {
				const items: SettingItem[] = [
					{
						id: "fallthrough",
						label: "Fall-through to LLM",
						description:
							"When on, unrecognized /commands are sent to the LLM. " +
							"When off, they are blocked with an error.",
						currentValue: config.fallthrough ? "on" : "off",
						values: ["off", "on"],
					},
				];

				const header: Component = {
					render() {
						return [theme.fg("accent", theme.bold("Command Fall-through")), ""];
					},
					invalidate() {},
				};

				const settingsList = new SettingsList(
					items,
					6,
					getSettingsListTheme(),
					(id: string, newValue: string) => {
						if (id === "fallthrough") {
							config.fallthrough = newValue === "on";
							persist();
						}
					},
					() => done(undefined),
				);

				const container = new Container();
				container.addChild(header);
				container.addChild(settingsList);

				return {
					render(width: number) {
						return container.render(width);
					},
					invalidate() {
						container.invalidate();
					},
					handleInput(data: string) {
						settingsList.handleInput?.(data);
						tui.requestRender();
					},
				};
			});
		},
	});
}

function loadConfig(configPath: string): FallthroughConfig {
	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Partial<FallthroughConfig>;
		return { fallthrough: parsed.fallthrough === true };
	} catch {
		// Missing or invalid file: fall back to the default (off).
		return { ...DEFAULT_CONFIG };
	}
}
