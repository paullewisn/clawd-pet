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
