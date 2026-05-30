# pi-command-fallthrough

Demonstration pi package showing the `command_resolve` extension API.

By default, pi sends unrecognized slash commands (e.g. a typo like `/explan`)
straight to the LLM. This package makes that **fall-through** configurable and
turns it **off by default**: unrecognized commands are blocked with an error
instead of prompting the LLM. A settings page lets you toggle the behavior.

## Behavior

- **Fall-through OFF (default)** - unrecognized `/commands` are blocked with an
  error and never reach the LLM.
- **Fall-through ON** - unrecognized `/commands` are passed to the LLM (pi's
  built-in behavior).

The setting is persisted globally in `<agentDir>/command-fallthrough.json`
(usually `~/.pi/agent/command-fallthrough.json`), so it survives restarts.

## Usage

```bash
# Try it without installing
pi -e ./packages/coding-agent/examples/packages/command-fallthrough

# Or install it
pi install ./packages/coding-agent/examples/packages/command-fallthrough
```

Open the settings page from inside pi:

```
/fallthrough
```

Use Enter/Space to toggle `Fall-through to LLM` between `off` and `on`, then
Esc to close. The choice is saved immediately.

In non-interactive modes (`-p`, JSON), `/fallthrough` reports the current state
instead of opening the page.

## How it works

The extension registers a `command_resolve` handler. The event only fires for
slash commands that pi's built-in resolution (extension commands, skills,
prompt templates) did not handle:

```ts
pi.on("command_resolve", async (event) => {
  if (event.found) return { action: "continue" };
  if (config.fallthrough) return { action: "continue" }; // send to LLM
  return {
    action: "error",
    error: `Unrecognized command "/${event.commandName}". ...`,
  };
});
```

See [extensions.md](../../../docs/extensions.md#command_resolve) for the full
`command_resolve` reference.
