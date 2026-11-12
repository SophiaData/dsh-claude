# Claude Host DOM isolation

This plugin uses DSH's public Slots wherever possible. A few Host controls still require CSS or portal placement against markup that DSH owns. These bridges must **fail open**: if the Host changes a selector, the native UI remains visible rather than removing another Agent's controls.

## Scoped Host chrome

`src/client/host-chrome.ts` installs one stylesheet for the entire Desktop process. In particular, the Host's Session log export triggers use CSS-module fragments (`sessionLogButton` in older Hosts, `moreButton` in newer versions). They must always be scoped to **`header:has(.dsh-claude-header-diff)`**, the header containing this plugin's own diff action.

Do not reintroduce document-global button suppression. Non-Claude Agents must retain the native Session export and more-actions controls. `test/client-host-chrome-dom.test.ts` constructs neighboring Claude and native headers and asserts which buttons the actual CSS selectors match.

The other Host chrome rules are independently tied to a Claude-owned marker: tabs and team roster to the header, permission controls to the Claude permission selector, and the preset-seat glyph to the `data-dsh-claude-preset` attribute.

## Rewind action portals

The rewind UI mounts in `shell.overlay`, not in a DOM subtree owned by one Agent. A document-wide `[data-chat-flow-kind="user"]` query could otherwise find user messages from other Sessions retained by the Host.

`locateClaudeRewindSeats(eligibleKeys, root?)` now requires the **active Claude Session's visible user message keys** from its chat snapshot. No eligible keys means no portal. A destination must also contain a Host action toolbar with a direct native button; a similarly named CSS class inside message contents is not sufficient.

`test/client-rewind-dom.test.ts` covers mixed native/Claude DOM, repeat scans, a false-positive CSS class in user content, missing Host action buttons, and cleanup.

## Verification before releasing for a new Desktop Host

1. Open Claude and non-Claude Sessions; the latter must keep their Session log export and header tabs.
2. Switch rapidly between the two presets; verify both controls and styling recover.
3. In a Claude chat, ensure Rewind appears beside the native Copy action and nowhere in rendered message text.
4. With multiple sessions mounted, confirm Rewind never appears on a native session's message.
5. Verify CSS-module fragment changes fail open: the Host controls remain usable when a selector no longer matches.
6. Confirm unload cleans up the injected stylesheet and DOM portal elements.

CI checks selectors and portal placement, but does not run the full Desktop renderer; these smoke checks remain necessary for a new Host release.
