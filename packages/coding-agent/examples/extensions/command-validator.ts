/**
 * Command Validator Extension
 *
 * This extension validates slash commands and provides helpful error messages
 * for unrecognized commands. It suggests similar commands and prevents user typos
 * from being silently passed to the LLM.
 *
 * Features:
 * - Spell-checking with Levenshtein distance
 * - Helpful suggestions for common typos
 * - Blocks completely unrelated commands
 * - Allows /ask commands to work as shortcuts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("command_resolve", async (event, _ctx) => {
		// Only validate unrecognized commands
		if (event.found) {
			return { action: "continue" };
		}

		// Transform /ask commands to regular prompts
		if (event.commandName === "ask") {
			return {
				action: "transform",
				text: event.args,
			};
		}

		// Find similar commands using Levenshtein distance
		const similar = findSimilarCommands(
			event.commandName,
			event.availableCommands,
			2, // max distance
		);

		if (similar.length > 0) {
			return {
				action: "error",
				error: `Command "/${event.commandName}" not found. Did you mean: ${similar.join(", ")}?`,
			};
		}

		// For completely unknown commands, suggest the most common ones
		const commonCommands = ["model", "settings", "session", "fork", "tree", "reload"].filter((cmd) =>
			event.availableCommands.some((c) => c.name === cmd),
		);

		if (commonCommands.length > 0) {
			return {
				action: "error",
				error: `Unknown command "/${event.commandName}". Try: /${commonCommands.join(", /")}`,
			};
		}

		// Default: allow LLM to handle it
		return { action: "continue" };
	});
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
	const aLen = a.length;
	const bLen = b.length;

	if (aLen === 0) return bLen;
	if (bLen === 0) return aLen;

	const matrix: number[][] = [];

	for (let i = 0; i <= bLen; i++) {
		matrix[i] = [i];
	}

	for (let j = 0; j <= aLen; j++) {
		matrix[0]![j] = j;
	}

	for (let i = 1; i <= bLen; i++) {
		for (let j = 1; j <= aLen; j++) {
			const cost = a[j - 1] === b[i - 1] ? 0 : 1;
			matrix[i]![j] = Math.min(
				matrix[i]![j - 1]! + 1, // deletion
				matrix[i - 1]![j]! + 1, // insertion
				matrix[i - 1]![j - 1]! + cost, // substitution
			);
		}
	}

	return matrix[bLen]![aLen] ?? 0;
}

/**
 * Find commands similar to the given input
 */
function findSimilarCommands(input: string, availableCommands: readonly any[], maxDistance: number): string[] {
	return availableCommands
		.map((cmd) => ({
			name: cmd.name,
			distance: levenshteinDistance(input, cmd.name),
		}))
		.filter((cmd) => cmd.distance > 0 && cmd.distance <= maxDistance)
		.sort((a, b) => a.distance - b.distance)
		.map((cmd) => cmd.name)
		.slice(0, 3) // Top 3 suggestions
		.map((name) => `/${name}`);
}
