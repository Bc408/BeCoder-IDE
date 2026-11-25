# Beacon

Beacon is BeCoder's algorithm and programming tutor. Users configure DeepSeek, Bailian, Moonshot or local Ollama. Cloud services use the user's endpoint, model and key. Model settings save connections, discover and add models, and test connections; users choose the actual model on the chat page. A successful connection test establishes only that text request, not tool use, vision or the full context capacity.

The home-page control explicitly selects the Beacon workspace. It is managed separately from open editor folders and the .notebook directory. .beaconWork stores conversations, drafts and recent activity materials for that root. Without a healthy selected root, only Blackout is available. Spot and Flood require a healthy root. A conversation detail page cannot switch roots; conflicting operations while busy are rejected, not queued.

Blackout is a temporary conversation. Beacon cannot read persistent activity records or other persistent sources in this mode; currently visible C/C++ drafts and five-OJ statement retrieval remain available. Spot limits ordinary file reads to the Beacon workspace. Flood expands the permitted local locations. Both exclude credentials and other conversations' internal data, and neither adds execution or write permission.

With a valid Beacon workspace, the application continuously collects real user problem, run and final-verdict activity even while Blackout is selected. Modes determine whether the model can consume those records. No collection or later backfill occurs for an absent or unhealthy root. Recent problem records contain only identity, path and time. Run records contain the actual program and multiple input results. Final verdicts belong to the actual submission.

Users can attach materials. Ask Beacon on an editor selection puts it in the draft before sending. A code tool call reads complete drafts in the currently visible C/C++ panes, including unsaved edits. Sending a message does not create a separate code snapshot. The chat search switch controls public search and webpage reads; it is independent of the five-OJ fetchProblem capability.

Beacon's current tools only read product knowledge and authorized materials. They do not modify student source or Notebook, execute a shell, autonomously run or stop programs, log in or submit code. The running host supplies the product version. This description contains no current personal configuration and does not establish that a feature is enabled.
