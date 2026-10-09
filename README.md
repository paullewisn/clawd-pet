# clawd-pet

Claude Code plugin. Banner above the prompt where Clawd, the pixel-art mascot, walks around on grass.

## Behaviour

- Walks randomly while idle, pauses, changes pose.
- Colour follows active model family: Sonnet, Haiku, Opus, Fable. Clawd walks off and back on when the model changes.
- Click Clawd: speech bubble with the current git branch and PR / ticket links seen this session.
- Click elsewhere on the banner: Clawd walks there.
- While Claude works: Clawd stands still and emits `0` / `1` glyphs. Pose follows mode (thinking, tool use).
- While you draft a prompt: Clawd walks to the left edge and looks down.
- Cheers when a turn finishes.

## Review requests

- Polls every 20 minutes for open, non-draft PRs awaiting your review.
- Two bold labels sit at the bottom right, dark grey when idle. Clawd's walking area stops short of them.
  - `CONTEXT` turns amber at 50% context used and red at 80%.
  - `REVIEW WANTED` turns amber while a review is pending.
- GitHub: `gh search prs --review-requested=@me` (needs `gh auth`).
- Azure DevOps: PRs where you are a reviewer with no vote yet, via `az rest` (needs `az login` and `CLAWD_ADO_ORG`). Skipped when `CLAWD_ADO_ORG` is unset.
- The flag clears once you submit a review.

## Link detection

Bubble links come from text in the session:

- `AB#123` and Azure DevOps work item URLs
- Azure DevOps and GitHub pull request URLs

Bare `AB#123` references only become links when `CLAWD_ADO_ORG` is set in the environment, e.g. `export CLAWD_ADO_ORG=https://dev.azure.com/your-org`. Full work item and PR URLs need no configuration.

## Install

```
/plugin marketplace add paullewisn/clawd-pet
/plugin install clawd@clawd-pet
```

## Layout

```
.claude-plugin/plugin.json
.claude-plugin/marketplace.json
hooks/hooks.json      module list
hooks/register.tsx    state and link detection
hooks/clawd.tsx       sprite, grass, rendering
types/index.d.ts
```
