# Combat display units

2026-10-03: Boss HP (all three bosses) and Control Boss shield readouts now round
to whole numbers. Positive HP below 0.5 still reads 1, so 0 always means defeated.
Player/account stat precision and the actual simulation/health-bar ratios stay unchanged.
Successful local Stat Boss counters and Control Boss HP/shield hits show rounded
damage above the boss in dark-red Galmuri11 with a white outline. Numbers last
850ms, are capped at four simultaneous hits, ignore remote HP resyncs and misses,
and clean up on leaving/restarting. Reduced-motion mode disables the rising motion.

2026-09-30: The temporary 10× presentation scale has been removed at the user's
request. All postgame boss values now use their original simulation/DB units.
Values are rounded at the second decimal place (one decimal shown; integers
have no trailing `.0`). Damage `11.57625` is shown as `11.6`, and health
`190.2 / 200` as `190.2 / 200`. The account HP increment is again shown as +100.

This reverts display scaling, not combat balance or stored progression.
Simulation values, D1 account HP, WebSocket health packets, saved battles,
damage precision, and health-bar ratios are unchanged. Attack/defense investment
points, defense percentages, experience, timers, and movement are not multiplied.
Account HP and its allocation button, party HP, all three postgame boss health
readouts, and Control Boss shield values use the same display unit. Story final
battle and pregame health keep their original units.

The Stat Boss HUD now contains only boss and player health. Boss meter dimensions
are 264×15.6 CSS pixels (previously 220×13, a 20% increase), constrained to fit the
viewport. The player meter retains its 220×13 desktop dimensions and sits below
the boss meter, aligned right. The HUD sticks to the top of the scrolling battle
stage. ATK/DEF, duplicate HP, timer, phase/pattern descriptions and state badge are
removed. Hazard cells, counter timing cues, touch controls, and party health remain.

## Party health and defeat feedback

Each boss renders exactly one local player HP meter. The shared PARTY list
excludes the current player and is hidden in solo rooms (also while public
identity is unknown). Up to four teammates are shown in a separate layout row
above the battle stage, never as an absolute overlay over the question or boss
HUD. On mobile it wraps into two columns, retaining defeated members in grey.
Teammate HP comes from server snapshots; local HP comes from the encounter.
Health changes are sent immediately with periodic retries as a fallback.
Health packets and final results remain server-acknowledged and use simulation units.

Control Boss also has a player HP progress bar alongside the numeric value;
both read the same encounter snapshot. Zero HP is labelled as defeated, not
still fighting. Spectator guidance is shown only when a different connected
party member is alive. Solo defeat waits for the server result without telling
the player to spectate themselves.

No production deployment is implied by this document.
