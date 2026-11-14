Original prompt: Build a plain HTML/CSS/JS mobile portrait water-pouring test, with five SVG bottles, two empty on the left and three filled with three shuffled colours on the right. Reference logic: /Users/cenglujin/Documents/GitHub/bottlegame/.

2026-10-28: Fix water-stream alignment for the two added bottle shapes.
- Existing state includes custom ink contours, three style geometries and queued pouring.
- Root causes: source positioning used grid-cell deltas despite differently scaled/padded SVGs; incoming stream ignored SVG vertical positioning from stretched grid cells; new style mouth heights were outside the visible openings.
- Changed animation anchors to actual SVG getScreenCTM coordinates, with source transform origin measured from the real SVG pivot. Receiving inlet uses midpoint between the inner mouth edges. Calibrated tapered and flask lip heights/edges against their supplied SVGs.
- Impact ripples now centre on each style's inlet. Added render_game_to_text for inspection.
- Validation complete: 27 cross-style cases across 320/390/480px widths plus 9 reverse-direction cases. Source lip and receiving centre error <0.001px; water-depth/stream-width error <0.001px. Water conserved and capacity respected. Queue regression passed (three pours, waiting sources stay lifted). No browser errors. Ran the skill browser client and visually inspected cross-style pouring and selected-bottle screenshots. No outstanding TODOs for this fix.

2026-10-28: Unify upright layer heights across all three bottle shapes.
- Request: all four portions must be equally tall, including across bottle styles, using the original three bottles as reference.
- Changed portion mapping from equal areas to equal upright heights. During tilt, each cumulative portion is mapped to its actual upright area so the lip/angle solver still matches the liquid surface.
- Normalise SVG scale using the designed water-region height rather than silhouette height and per-style size tweaks. This keeps the two new bottles' full line in their intended body area while matching the original's layer height on screen.
- Receiving stream endpoint uses the same equal-height mapping as the water rendering.
- Validation complete: measured all five bottles at 320/390/480px widths; every upright portion equals the reference height within 0.008 CSS px (grid rounding). Actual rendered boundaries match the calculated levels. All 27 cross-style pour cases passed with aligned lips/streams and conserved logical portions. Three-pour queue regression passed. Ran skill client and inspected static and cross-style pouring screenshots. No browser errors or outstanding TODOs.

2026-10-28: Preserve the bottle-style test and create a playable heap-game homepage.
- Saved an independent snapshot at bottle-test/index.html with its own CSS, game, bottle artwork and ink renderer. Root index.html is now the game; footer links to the preserved test page.
- Added heap-rules.js: five colours, five four-portion pile bottles plus two empty hand bottles; five hand slots; explicit overlap blockers; top-run pours to any recipient with space; full single-colour bottles clear and release slots. The five-colour demo has a verified 13-action solution.
- Added heap-game.js and heap.css using the existing three bottle assets, unified water heights, real-mouth positioning, ink lines and queued pours. Pickups reserve slots immediately, unlock underlying bottles and fly into the hand. Added minimal restart, progress, finish/replay and test-page link.
- White opaque bottle interiors make actual overlap readable. Pile positions use a compact layered group; explicit blockers follow upper-to-lower dependencies.
- Tests: node --test tests/heap-rules.test.cjs validates initial counts, blockers, unrestricted-colour top-run pours, clearing, immutability and winning paths for 20 colour permutations. Browser playthrough passed all 13 moves, resource conservation, victory/replay, 320/480px layouts, and independent style-test navigation. Compact-pile playthrough and queue regression also passed (held sources stay lifted, full-hand pickup refused, no overflow). Ran the skill browser client, checked start/pick/pour/full-hand/win/320px screenshots, and confirmed no browser errors. Hand caption is positioned from actual bottle height to avoid overlaps on shorter screens. No outstanding TODOs for this demo.

2026-10-28: Expand homepage to a 30-bottle 2D level.
- Request: remove decorative/helper microcopy; 30 pile bottles; import/adapt upstream level rules; more varied contents and rotations; pile water stays attached to bottle; pour approaches from source side.
- Copied full original rules to docs/level-rules-reference.md and level-003 source colours/certificate to docs/level-source-003.json. New 2D coverage uses sampled SVG silhouette visibility (>=90% unobscured), not handwritten blocker lists or 3D physics.
- Added heap-shapes.js, heap-level.js and scripts/build-30-level.cjs. Imported all 30 reference colour sets: 24 units per colour, 12 two-colour / 16 three-colour / 2 four-colour bottles. Varied seeded positions, angles and shapes; certified the source 126-action solution against real 2D coverage. Initial free count 10; exposure complexity means 2.5/2.5/3.0; immediate opening survival under uniform choices ~93.63% (not full-game success rate).
- Removed visible instructions, progress label and footer microcopy. Kept screen-reader status and functional header controls. Pile liquid remains in local bottle coordinates; pickup scales smoothly to hand size. Pour side follows actual source/target mouth x coordinates.
- Validation complete: six Node rule tests passed; actual mouse-click replay completed all 126 certified actions (30 pickups, 30 clears), with all 120 portions accounted for and no browser errors. Sampled 85 distinct pours for correct source-side direction. Verified 320/390/480px layouts, next round, and independent style-test snapshot. Inspected full-pile, midgame, narrow-screen and skill-client screenshots.
- Visual smoke check passed: 30 bottles, ten initially available, varied full-range rotations with bottle-local liquid; real silhouette clicks successfully pick bottles.
- Full actual-click replay found an SVG hit-testing bug at move 20: pointer-events:fill ignores visibility, so cleared bottles could steal clicks. Fixed to visibleFill and made cleared bottle subtrees inert. Replaying complete certificate again.

- Final queue regression: shared-bottle queued moves now allow a previously queued source to be a recipient of a later action. Verified two pending pours after an active one, with all 120 portions conserved. No outstanding TODOs for the 30-bottle version.

2026-10-28: Pale covered bottles and blocked-pick feedback.
- Covered liquid now renders at 42% opacity over the opaque white bottle backing; covered ink at 46%. Available bottles retain full colour and ink, and regain them as coverage clears.
- Exposed portions of covered bottles remain clickable and keyboard-interactive. Clicking keeps all state/slots/water unchanged and animates a short tug/rebound on the clicked bottle.
- Added HeapRules.blockers: attribute hidden silhouette samples to the actual topmost remaining occluder, avoiding unrelated hidden layers. Actual blockers follow the same screen-space tug at smaller amplitude and slightly later timing, with a brief stronger ink outline.
- Feedback runs on the bottle-align wrapper, preserving base poses and water animation transforms; repeated clicks cancel/restart safely, and valid pickup cancels its feedback before measuring the flight.
- Validation: all seven Node rule tests passed, including dynamic blocker ownership. Real mouse clicked visible blocked bottle 17, shook blocker 9, kept the whole pile/slots/water unchanged, safely repeated the effect, and then picked blocker 9; bottles 14/17 became available and recovered full styling. No browser errors. Ran skill browser client and inspected pale-pile and tug screenshots. No outstanding TODOs.

2026-10-28: Port auto-clear assist and add fast highlight/star clearing.
- Ported the reference rule: four matching portions anywhere in the hand gather into one chosen bottle; other liquid is redistributed without overflow; one bottle is released. Default off on every page load, white/black switch at bottom, no persistence.
- Queue playback is drained before auto assist starts, and pickup/auto morph cannot overlap. Toggling off finishes the current clear then stops the chain. Per-reference fluid morph preserves bottle positions and smoothly changes fractional layer amounts.
- All completed bottles now share a ~220ms white highlight sweep plus three small four-point sparkles and a short fade/lift. No confetti. Effects are removed after completion.
- Covered liquid/ink strengthened from 42/46% to 56/58%.
- Validation complete: all nine Node tests passed, including buried matches, immutability and conservation across 2000 random hands. Browser auto-only pickup sequence cleared all 30 bottles, preserved 120 portions, exercised mid-animation off/on and default-off reset, and confirmed three stars plus highlight cleanup. Full 126-action manual replay also passed with all 30 clears, 85 direction samples and no errors. Verified the 320px switch layout and inspected sparkle/idle screenshots. Queued manual pours finish before auto assist; deferred-auto regression passed. No outstanding TODOs.

2026-10-29: Slowed the completed-bottle highlight/star/fade from ~223ms to ~322ms (360→520 animation units). Applies to manual and automatic clears. JavaScript syntax check passed.
2026-10-29: Completed-bottle effect slowed again to ~496ms (800 animation units). Three sparkles are now solid #FFD23F yellow with no outline, and radii increased about 25%. Browser checked appearance, automatic completion and effect cleanup; no page errors.

2026-11-05: Snapshot Index02 and migrate homepage to bottle04.
- Saved index02.html plus independent copies of all runtime assets under index02-assets/. SHA256 manifest records the originals. Existing bottle-test/ remains untouched.
- New bottle04-1/04-2 SVGs share one silhouette: -1 is the colour/elliptical-surface reference, -2 is the mask/outline reference. The homepage now uses that single vessel style for all pile/hand bottles and slot ghosts.
- Added width-scaled pressure ink so the short cup retains the existing brush character. The water clip includes a fine brush contour; a separate subtle paper displacement roughens coloured edges and layer interfaces.
- Four equal logical body portions stay intact. Curved lower interfaces and a lighter exposed oval give the top visible band an extra full oval of apparent depth, matching the supplied artwork. The perspective cap blends away as pouring tilt starts, preserving the lip/stream animation.
- Re-exported real 2D silhouettes and regenerated/re-certified the 30-bottle heap with the same colours and 126-action solution. Current exposure: 9 initially free; complexity 2.5/2.7/2.8. Style-scaled hand width .15, pile width .10.
- Validation complete: Node rules passed, actual mouse replay completed all 126 manual actions and all 30 automatic clears. Checked 320/390/480px layouts, snapshot hashes and independent Index02/old style-test pages; no browser errors. Initial/hand/pour screenshots inspected.

2026-11-05: Recorded the current pen/pressure/texture algorithm as 线条效果一 in docs/line-effects.md. Saved the exact ink implementation and machine-readable parameters under docs/line-effects/effect-01/ for future comparison/restoration. 线条效果二 is an empty reserved heading. No running visual parameters changed.

2026-11-05: Index02 remains on effect one with its frozen independent resources. Homepage ink is now effect two: BASE_WIDTH 2.0→2.6 (+30%), SWELL 2.1→0 (no corner-specific thickening), other texture/taper settings retained. Updated docs/line-effects.md and froze effect-two source/settings. Validation: browser screenshots and source→target pour passed with no page errors. Verified all Index02 asset hashes unchanged, plus hashes for both frozen effect implementations.

2026-11-05: User clarified granular character means width variation, not textured/transparent ink. Effect two now uses solid black filled geometry with base width 3.3, broad width variation (amplitude 1.6, ~16-unit spacing) plus fine width pulses (amplitude .7, ~3.6-unit spacing). Removed all black/water texture and alpha-noise filters from the homepage. Sparse seeded corner gaps retained; disabled for water masks. Updated effect-two documentation and frozen implementation/settings. Visual screenshots and source→target pour passed without browser errors. Index02/effect one remains untouched.

2026-11-05: Replaced effect two with a local Wobble-inspired continuous vector ribbon, following the user's Live Studio screenshot.
- Seeded centreline wobble, independent edge variation and 30% width variation; removed corner gaps. Closed ribbons use evenodd rings with matching noise endpoints.
- Index loads the revised script with a cache version; effect-two snapshot/settings/docs updated. Index02/effect one untouched.
- Validation: JavaScript syntax passed; existing nine rule tests passed. Browser visual validation remains pending: skill client lacks playwright, local HTTP bind is sandbox-denied, and CUA blocks file URLs. No visual verification claimed.
- Follow-up: refresh index.html locally and assess stroke weight/wobble against the screenshot.

2026-11-05: Changed only effect two to Billybutton-inspired vector stamping, applied by index.html cache version 2-billybutton.
- Mapped exported brush spacing, spacing jitter, lateral/linear jitter, size/roundness jitter to seeded overlapping solid polygon nibs. Original bundled Alpine_Shape.png is absent, so this is explicitly an approximation.
- Preserved nonzero winding across random flips to avoid holes in overlaps; cached completed strokes.
- Updated effect-two snapshot/settings/documentation. SHA checks confirm index02, all index02 assets, and effect-one snapshots unchanged.
- Validation: syntax passed; 1,625-stamp fixture verified finite coordinates, consistent winding, deterministic identical seeds and distinct different seeds; all nine existing rule tests passed.
- Browser visual verification pending: required skill client cannot import playwright in this environment. Refresh index.html locally to inspect final rendered nib weight and edge character.

2026-11-05: Enlarged effect-two Billybutton detail at fixed bottle size: width 2.65→3.55, stamp spacing ×2.4, lateral jitter ×1.65, added correlated size waves. Added independently seeded 48% corner gaps detected from direction changes, with tapered tips and radius limits preventing stamp overlap across gaps. Water-mask gaps remain disabled. Index cache version and effect-two docs/snapshot/settings updated.
- Validation: syntax passed; deterministic geometry fixture generated 39 gaps across 80 square corners, finite coordinates and zero water-mask gaps; all nine rules tests passed; effect-one and Index02 hashes unchanged. Browser visual validation still unavailable due to missing Playwright (previously recorded); actual rendered appearance remains to be reviewed locally.

2026-11-05: User requested calmer overall width and fewer/narrower corner breaks. Effect two size-wave amplitudes .17/.08→.07/.035; micro nib randomness unchanged. Corner probability .48→.22, gap halfwidth .18–.34→.07–.12 of brush width, taper .85→.35. Radius clearance cap .65→.9 shortens the visibly thinned region while keeping stamps clear of the gap. Index cache version and effect-two docs/settings/snapshot updated. Syntax passed; protected effect-one and Index02 hashes unchanged. Visual preview remains unverified in this environment.

2026-11-05: Optimized effect-two startup without reducing nib count or changing brush parameters. Shared per-source .12-unit path lookup replaces repeated native getPointAtLength calls in every stamp/corner. Record rounded y extents while generating; homepage reads metadata instead of rescanning all path coordinates. Existing per-seed stroke cache retained. Updated effect-two snapshot/settings/docs and index script cache versions.
- Validation: syntax passed; 30-bottle circular analytic fixture native query count 124797→1668 (-98.66%), identical vertex counts, max coordinate deviation .001, metadata matches actual vertex bounds. Fixture JS-only timing was slower (native SVG is stubbed), so no wall-time speedup claimed. All nine rules tests passed, Index02/effect-one hashes unchanged. Browser load/paint timing and appearance remain unverified (Playwright unavailable).

2026-11-05: Updated index palette from user swatch: bodies A885FF/FFE617/F9392E/00C060/45B4FD; surface ellipses CDB8FF/FFF274/FD8A82/00D96D/92D3FE. Replaced computed surface tints with exact paired values; streams continue using body colours. Index cache version bumped. Syntax passed. Index02 unchanged.

2026-11-05: Added solid brush-like water edges to index: roughened actual mask silhouette (replacing smooth-mask union that hid inward detail), layer top boundaries and lower semicircular interfaces, and exposed light-colour oval perimeter. Water stays coloured and continuous. Uses lightweight fixed analytic offsets for animated edges rather than per-frame ink stamps/native path queries. Tilt fill range includes SVG diagonal. Effect one and Index02 hashes unchanged. Syntax and nine rule tests passed; browser visual QA remains unavailable in current environment.


2026-11-11: New two-portion customer shop homepage.
- Archived Index as cup-test-01.html (art 01 frozen under art-01/) and Index 2 as cup-test-02.html (art 02 in index02-assets/); old index02 URL redirects. Added docs/art-catalog.md.
- New portrait grey table, short original-art cups, exactly four colours and capacity two. Initial hand has one empty cup and two vacant slots; hand limit three. Pick, pour, return-to-table, matching delivery, two-person entry/queue/exit/replacement implemented. Decorative currency/settings/upgrade/stock buttons remain inert. Stock replaces delivered portions to allow sustained demo play.
- Playwright skill client run using bundled Playwright and installed Chrome. Inspected desktop initial and mobile delivery screenshots; fixed occluded bottom liquid band and raised customer-held cup above table. Actual browser clicks verified 13 consecutive deliveries, replacement queue, hand limit, capacity, 16-portion conservation, preserved test pages; no page errors. Existing nine rule tests pass.
- Browser regression harness: /tmp/colorpop-check/test.mjs; screenshot artifacts in /tmp/colorpop-check/. No remaining required TODOs.

2026-11-11: The shop now starts with 30 overlapping table cups at 81% of hand size. It reuses the heap coverage and blocker attribution rules with the shop cup silhouette, and shakes the blocked cup together with its visible blockers. Pour animation moves to the requested side before tilting and straightens before returning. Chrome verified actual pointer hit testing, blocked and free pickup, and both pouring sides throughout visible flow. All nine heap rule tests passed.

2026-11-11: Shop pours now play at 1.6× speed. Blocked cups have lighter liquid and translucent white fill with unchanged ink. Deliveries award 2 coins with a flying +2 and two rolling increments. The shop opens with one customer and zero coins. The upgrade sheet sells the second customer for 2 and the third for 10. Chrome verified deliveries, both purchases, insufficient funds and the three-customer cap. Nine heap rule tests passed.

- Added an opt-in automatic order mixing checkbox in the desktop test panel. It uses only hand cups, animates the transfer, preserves unused portions, and delivers through the normal sale flow. Chrome verified both empty and occupied destination cups, default-off behavior, and liquid conservation. Nine heap rule tests passed.

- Added the stall survival title screen and browser-local best ending. Buying the shop at 10,000 coins outranks bankruptcy; earlier purchases and later bankruptcies rank higher within their own ending. Chrome verified the exact threshold, both endings, ranking, and persistence after reload.

- Day-two repayment now offers refusal, with a 10-coin debit and up to three starter-box cups taken by the mentor. Story prices and rates are highlighted. The shortage tip checks each requested flavor and is acknowledged independently of the day. Chrome verified the day-two tip and refusal sequence.

- 对赌客使用五档倍率、分开的个位和十分位输入，以及扣除当日租金后的本金滑条。开摊排班和入场均检查最低下注额。通过 JS 语法与下注边界检查，浏览器启动受运行环境限制。
