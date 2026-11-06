# Game Blueprint updates
Read only before POST `game/blueprint/update` for an approved, initialized Blueprint.

## Update after approval

When `allowedActions` includes `update` and the user explicitly changes the game's direction, gameplay or production
choices, POST `game/blueprint/update` once for that change, in the same parallel tool call as your first edit for it.
Take `expectedRevision` from the implement instruction's reminder or your latest update reply. If that revision or the
saved text of a field you replace is not in context, as after a history summary, send `expectedRevision: 1`.
Do not GET for it.
Send only the changed fields: `summary` (at most 360 characters) and `choices` from `genre`, `gameplay`,
`assetProduction` and `onlineFeatures`, plus Godot `assetConstraints` and `visualDirection` or Three.js
`riggingAndAnimation`. Fast prototype keeps its asset production. Each value replaces the saved one, so keep unchanged
plan items in `gameplay` and use the Blueprint content language.
Do not update for bug fixes, polish, edits inside the saved scope, your own suggestions or unsettled questions.
Development Effort, mockups and visual coverage keep their own flows; an update never reopens setup or concept approval.
When adding online features, say in one sentence that backend and database usage may be billed, then follow
[Online features](game-blueprint.md#online-features). The reply shows an update card and returns only the new
`revision` and `changed` fields; do not repeat the card content in chat.
On `revision_conflict`, merge your change into its `data.saved` values and resend once with its `data.revision`.
