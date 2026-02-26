# SlopMiles — AI Running Coach for iOS

## Overview

SlopMiles is an iOS application that provides personalized AI running coaching. Users select a competitiveness level and coach personality, import their training history from HealthKit, set goals, and receive dynamically generated training plans. The coach monitors performance, gives feedback, adjusts plans in real time, and conducts end-of-plan assessments.

---

## 1. Core Concepts

### 1.1 Competitiveness

Competitiveness controls how aggressively the coach approaches training load, progression, and race preparation. Three presets (no custom option):

- **Conservative** — Prioritizes health and longevity. Cautious volume increases, generous recovery, errs on the side of undertrained over overtrained.
- **Balanced** — Standard progression following conventional training guidelines. Moderate volume growth, standard recovery periods.
- **Aggressive** — Pushes toward limits. Higher volumes, faster progression, less conservative recovery. For experienced runners comfortable with risk.

Competitiveness influences:
- How the coach applies the base training principles from §5.0 (e.g., Conservative stays well within limits, Aggressive pushes closer to them).
- Volume progression rates and peak volume recommendations.
- How the coach weighs recovery vs. pushing through.

### 1.2 Personality

Personality controls the tone and communication style the coach uses. Four presets plus a custom option:

- **Cheerleader** — High energy, celebratory, lots of positive reinforcement.
- **No-Nonsense** — Brief, direct, no fluff. Says what needs to be said.
- **Nerd** — Stats-heavy, analytical, loves explaining the science behind the training.
- **Zen** — Calm, mindful, focuses on the journey and process over outcomes.
- **Custom** — Free-text description of ideal coach personality.

Personality influences:
- Tone of feedback and messages.
- How verbose or concise the coach is.
- Whether the coach leans into data, motivation, or mindfulness framing.

### 1.3 Training Plan

A training plan is a multi-week structure built around a user's goal.

| Property | Description |
|---|---|
| Goal | Preset or custom goal (see §1.4) |
| Duration | Number of weeks |
| Volume Mode | **Time-based** (recommended) or **Distance-based** |
| Peak Week Volume | The maximum weekly volume the plan builds toward, set by the coach at plan creation |
| Weekly Volume Profile | Each week expressed as a **percentage of peak week volume** |
| Weekly Emphasis | Each week tagged with a training emphasis (e.g., aerobic base, speed, race prep, recovery) |

**Peak week volume** is proposed by the coach but may be overridden by the user while the plan is in `.draft` status. Once the plan is activated, the user cannot change it directly. However, the coach may adjust peak week volume on an active plan in response to injury/illness (§1.19) or goal changes (§1.20). All mid-plan adjustments are recorded in a peak volume history on the plan (see §2.5) with the date, previous value, new value, and reason — so the user and coach can see how the plan's volume target evolved over time.

### 1.3.1 Percent-of-Peak Resolution, Unit Precedence, and Rounding

Percent values are always the source of truth for plan structure (`weeklyVolumeProfile` and workout `volumePercent`). Absolute values are derived deterministically from those percentages:

- **Time mode:** `absoluteSeconds = peakWeekVolumeMinutes * 60 * percentOfPeak`
- **Distance mode:** `absoluteMeters = peakWeekVolumeMeters * percentOfPeak`

The same resolution rule applies at both levels:
- Week target absolute volume resolves from `weeklyVolumeProfile[weekNumber]`.
- Individual workout absolute volume resolves from that workout's `volumePercent` (still as a percent of **peak**, not of week volume).

**Rounding policy by context:**

- **Calculations:** use unrounded floating-point values in canonical units (seconds for time, meters for distance) until final formatting/serialization.
- **Storage:**
  - Percentages are persisted as provided by the plan/workout payloads (subject to deterministic validation in §5.0.3).
  - Persisted absolute durations are rounded to the nearest whole second.
  - Persisted absolute distances are rounded to the nearest whole meter.
- **Display:**
  - Durations display in whole minutes for high-level totals and in min:sec for segment-level detail.
  - Distances display in the resolved display unit with standard fitness precision (typically 0.1 for high-level totals and up to 0.01 for short segment detail).
  - Paces display to whole seconds per unit distance.

**Unit precedence (highest to lowest):**

1. **Native workout context units** (immutable by global preference):
   - Track interval distances display in meters (§1.11).
   - Course-based segments display in the course's stored `distanceUnit` (§1.17).
2. **Entity-native units** when explicitly defined (for example, user-entered race/course labels that intentionally preserve their native distance framing).
3. **Global user unit preference** (`UserProfile.unitPreference`) for all other distance/pace display.

If multiple rules could apply, the higher-precedence native unit wins.

**Historical consistency when unit preference changes:**

- Changing `unitPreference` never rewrites historical stored values.
- Existing plans remain numerically identical because percentage data and canonical absolute values do not change.
- Historical charts/cards re-render from stored canonical values using the current display preference, except for native-unit contexts above (track/course/native labels), which remain unchanged.
- Previously generated free-text coach messages are not rewritten.

### 1.4 Goals

Goals can be selected from presets or written as free text.

**Race Presets:**

| Preset | Description |
|---|---|
| 5K | Train for a 5K race |
| 10K | Train for a 10K race |
| Half Marathon | Train for a half marathon |
| Marathon | Train for a full marathon |

**Custom Race Distance** — The user may also enter a custom race distance (e.g., 15K, 50K, 100 miles) for any distance not covered by the presets.

For all race goals (preset or custom distance) the user may optionally supply a goal time. If no goal time is provided, the coach sets a target based on the user's current VDOT and training history. For custom distances outside the standard VDOT prediction range, the coach uses its judgment to estimate an appropriate target.

**Non-Race Presets:**

| Preset | Description |
|---|---|
| Base Building | Build aerobic base and increase weekly volume |
| Recovery | Low-volume recovery block after a race or heavy training cycle |

**Custom Goal** — Free-text input for anything not covered by presets (e.g., "Run every day for 30 days", "First ultramarathon").

Race goals (preset or custom distance) require a target race date. Non-race presets may include an optional target date (end of block).

### 1.5 Onboarding

Onboarding runs once for new users and establishes the minimum context needed to create a first plan.

**Flow:**

1. **Welcome** — brief introduction to the app and what the coach does.
2. **HealthKit Authorization** — request access to running workouts, heart rate, route data, date of birth, and resting heart rate. Explain what each type is used for. If the user denies authorization, explain reduced functionality (no workout matching, no automatic VDOT estimation, no HR-based feedback) and allow them to continue — HealthKit can be authorized later in Settings.
3. **Profile Basics** — name, unit preference (defaults to device Measurement System), volume preference (time or distance).
4. **Running Schedule** — preferred running days, target days per week, preferred long run day, and preferred quality days with ranking (see §1.8). Availability windows are skipped during onboarding to keep the flow short; they can be configured later in Settings.
5. **Track Access** — whether the user has regular access to a running track.
6. **Establish VDOT** — follows the priority order from §1.12:
   - Ask if the user has a recent race result. If yes, collect distance, time, and date → compute VDOT via the VDOT service.
   - If no race result but HealthKit is authorized, show a summary of detected running history and the estimated VDOT. The user can accept or override.
   - If neither is available, explain that the coach will use conservative paces initially and refine after the first few workouts or a race.
7. **Competitiveness** — pick Conservative, Balanced, or Aggressive (see §1.1).
8. **Personality** — pick a preset or create a custom personality (see §1.2). Show a sample coach message in the selected voice.
9. **Notifications** — request notification permission. Explain what notifications are used for (weekly plan ready, coach adjustments). If denied, the app works normally but the user must open the app to see updates. Can be enabled later in system Settings.
10. **Done** — onboarding completes and the user lands on the Dashboard in the empty state (see §1.5.1). The app does not force immediate plan creation — the user can explore Settings first.

**Resumability:** If the user quits mid-onboarding, the app resumes from the last incomplete step on next launch. Completed steps are saved incrementally.

### 1.5.1 Empty States

The app must handle the case where no plan exists — either immediately after onboarding or between plans (after a plan is completed or abandoned).

**Dashboard (no active plan):**
- Greeting from the coach in the selected personality, encouraging the user to create a plan.
- Prominent "Create Plan" action.
- VDOT badge (if established) with current value and race predictions.
- If a previous plan exists, a summary card linking to the completed/abandoned plan's assessment.

**Plan tab (no active plan):**
- Empty state message: "No active plan."
- "Create Plan" action.
- List of past plans (completed or abandoned) with date ranges and goals, tappable to view the full plan and assessment.

**History tab (no active plan):**
- Shows all past workout history regardless of plan status. History is not gated behind having an active plan.

**Coach tab (no active plan):**
- The coach is available for conversation even without an active plan. The user can ask questions, discuss goals, or review past performance.
- If the user asks about training, the coach suggests creating a plan.

### 1.6 Races

Users can add races to an active plan at any time. A race has a distance (standard preset or custom, e.g., "8K", "50 miles"), a date, and an optional goal time.

When a race is added, the coach re-evaluates that week's workouts:
- The race replaces a hard effort workout (e.g., tempo or intervals) for the week.
- Remaining workouts are adjusted around the race day as needed.

The coach treats the race result as a high-quality data point for VDOT recalculation. If the race is a strong performance, the coach may update pace targets for subsequent weeks.

Races do not change the plan's primary goal — they are treated as tune-up or opportunistic events within the existing plan. Tapers are reserved for the plan's goal race only.

**Removing races:** Users can remove upcoming non-primary races from the plan. Constraints:
- The plan's goal race cannot be removed — changing the primary race is a goal change (§1.20).
- Only races that have not yet occurred can be removed. Completed races (those with a recorded result) are permanent — they are VDOT data points and part of the plan's history.
- When a race is removed and that week's workouts have already been generated, the coach re-evaluates the week — restoring a quality session where the race was and adjusting surrounding workouts as needed. If the week hasn't been generated yet, the race is simply no longer an input to weekly detail generation.

### 1.7 Strength & Core Training

Strength and core work is an optional component of any training plan. During plan creation, the user is asked whether to include strength training. If enabled, the user selects which equipment they have access to:

| Equipment Option | Description |
|---|---|
| Bodyweight Only | No equipment — floor exercises, planks, lunges, etc. |
| Dumbbells | Adjustable or fixed dumbbells |
| Kettlebells | One or more kettlebells |
| Exercise Bands | Resistance bands / loops |
| Full Gym | Barbells, squat rack, cable machines, etc. |

The user may select multiple options (e.g., dumbbells + exercise bands). Equipment selection is stored on the plan so the coach can tailor exercises accordingly.

**How strength fits into the plan:**
- Strength workouts are generally scheduled on hard running days — following a "hard days hard, easy days easy" polarization. Pairing strength with quality running sessions (tempo, intervals) keeps easy days truly easy for recovery.
- Strength workouts are short (15–30 minutes) and focused on runner-relevant movements: hip stability, single-leg strength, core anti-rotation, posterior chain.
- The coach periodizes strength alongside running: heavier/harder strength in base-building phases, lighter maintenance strength during race-specific phases, and reduced or no strength during taper.
- Strength volume is not counted toward the plan's running volume (peak week volume and weekly volume percentages refer to running only).

**Completion tracking:** Strength workouts are not matched via HealthKit — the user marks them complete manually from the Workout Detail or Week Detail screen. A simple "Done" action transitions the workout from `.planned` to `.completed`. No check-in or RPE is collected for strength sessions.

**Strength workout structure** is modeled separately from running workouts (see §2.10–2.11). Each exercise specifies the movement name, sets, reps (or hold duration for isometric exercises), rest between sets, required equipment, and optional coaching cues.

### 1.8 Preferred Running Days & Availability Windows

The user specifies which days of the week they are available to run and how many running days per week they prefer. This is stored on the user profile and used as a primary scheduling constraint during weekly detail generation.

- **Available days** — A set of weekdays the user can run (e.g., Mon, Tue, Thu, Sat, Sun). Defaults to all seven days if not configured.
- **Preferred days per week** — The target number of running days (e.g., 5). Must be ≤ the number of available days. The coach uses this to decide how many sessions to schedule.
- **Preferred long run day** (optional) — The day of the week the user prefers for their long run (e.g., Saturday). Must be one of the available days. If not set, the coach chooses based on the overall schedule.
- **Preferred quality days** (optional) — A ranked list of days the user prefers for hard efforts like tempo, intervals, or repetitions (e.g., 1st: Tuesday, 2nd: Thursday, 3rd: Saturday). Must be a subset of the available days. The ranking matters: the week's most important quality session (e.g., the key workout for the training phase) is placed on the first-choice day, the second-most-important on the second-choice day, and so on. If not set, the coach places quality sessions where they fit best with adequate recovery spacing.
- **Availability windows** (optional) — For each available day, the user may specify one or more time windows when they can run (e.g., Mon: 6:00–7:30 AM, 7:00–9:00 PM). If no windows are set for a day, the user is assumed available any time that day. Multiple windows per day support runners whose schedules have gaps (e.g., before work and after kids' bedtime).

Day preferences are soft constraints — the coach respects them by default but may deviate when necessary (e.g., moving a quality day to accommodate a mid-week race, or shifting the long run when an availability override removes the preferred day). When the coach deviates, it explains why in the week's coach notes.

The coach respects these constraints when placing workouts but may suggest changes via chat if the preferred schedule conflicts with training goals (e.g., a marathon plan on 3 days/week). The user can update their available days, day preferences, and availability windows at any time; changes apply to the next generated week.

**Weekly availability overrides** — In addition to the profile-level defaults above, the user can override availability on a per-week basis from the Plan view. This allows marking specific weeks or days as constrained due to vacations, work trips, conferences, or other life events. The user can:
- Remove available days for that week (e.g., "I can only run Mon and Sat this week").
- Adjust time windows for specific days (e.g., "Thursday I'm only free 6–7 AM").
- Add an optional note explaining the constraint (e.g., "Work conference Wed–Fri").

Weekly overrides are stored on the `TrainingWeek` (see §2.7) and take precedence over profile-level defaults for that week. When an override is set on a future week, the coach is notified and may adjust the plan — for example, shifting volume to surrounding weeks, reducing intensity during a travel week, or moving a key workout to an available day. If the override significantly impacts a critical training week (e.g., peak week or race week), the coach flags this in commentary and suggests how to adapt.

### 1.9 Doubles

For runners with high weekly volume, the coach may schedule two workouts on some days ("doubles"). This is a coaching decision based on the plan's volume demands and the user's experience level — there is no user toggle. A user who prefers to avoid doubles can communicate this to the coach via chat; the coach will respect the preference by distributing volume across available days, though it may note that single-run days will be longer as a result.

- Doubles are only used when weekly volume is high enough that single daily runs would be excessively long.
- **Typically only one of the two workouts is a hard effort** — the other is an easy run purely to accumulate volume (e.g., a morning easy run + an evening tempo session, or a morning interval workout + an evening shakeout run).
- The coach uses the user's availability windows (if configured) to place the two workouts in separate time slots. If the user has configured only one availability window for a day, the coach treats it the same as no windows — a double may still be scheduled on that day, but the coach notes it as a "double day" and leaves timing to the user. If no windows are configured, the coach notes in the workout that it is a "double day" and leaves timing to the user.
- Doubles follow the same hard/easy polarization principle — the easy run in a double should be genuinely easy and short.

### 1.10 Weekly Detail

Each week's detailed workout schedule is generated at the start of that week (or on demand). This allows the coach to incorporate recent performance data and adjust.

#### 1.10.1 Week Boundaries, Timezones, and DST

**Canonical week boundary:** Training weeks always run **Monday 00:00 through Sunday 23:59:59** in the plan's canonical timezone (`TrainingPlan.canonicalTimeZoneId`). `TrainingWeek.weekNumber` is assigned against this Monday-start boundary, and all scheduled workout dates are interpreted as calendar days in that same timezone.

At plan activation, `TrainingPlan.startDate` is normalized to the local Monday that starts week 1. If the user activates mid-week, the app still anchors week 1 to that week's Monday (not the activation day) so week indexing, weekly volume targets, and generated detail stay deterministic.

**Timezone travel behavior:** At activation, the app captures a fixed `TrainingPlan.canonicalTimeZoneId`. Week boundaries, `weekNumber` assignment, and all plan `scheduledDate` day semantics are evaluated in this canonical timezone for the life of the plan. Crossing timezones does **not** re-index weeks or automatically move workouts between days. Example: if a workout is scheduled for Wednesday in a plan anchored to America/Los_Angeles, it remains a Wednesday plan workout even if the user is temporarily in Tokyo. Completed and imported HealthKit workouts keep their actual timestamps; matching still uses the existing date-proximity rule (§1.13) but compares against the planned date in the plan's canonical timezone.

**DST handling (availability windows + scheduled days):**
- Scheduled workouts are date-based (not time-of-day) and therefore remain on the same calendar day in `TrainingPlan.canonicalTimeZoneId` across DST transitions.
- Availability windows are interpreted as wall-clock local times in the plan's canonical timezone.
- **Spring forward (missing hour):** if a saved window includes a non-existent local time (e.g., 02:30 during the jump), that boundary is snapped forward to the next valid local minute.
- **Fall back (repeated hour):** ambiguous local times use deterministic bounds: window starts use the **earlier** occurrence and window ends use the **later** occurrence, preserving user-intended availability.
- Window validation still requires `end > start` after DST normalization; invalid windows are rejected in UI with corrective guidance.

A week contains:
- A set of workouts (typically 3–7 running sessions, plus strength sessions if enabled).
- Rest days.
- Optional notes/commentary from the coach.

### 1.11 Workout

A workout is a single training session.

| Property | Description |
|---|---|
| Type | Easy Run, Long Run, Tempo, Intervals, Repetitions, Recovery |
| Volume | Expressed as a percentage of peak week volume (e.g., if peak is 200 minutes and this workout is 8%, the workout is 16 minutes) |
| Pace Zones | One or more pace targets using VDOT-based zones (see §1.12) |
| Structure | Ordered list of segments (e.g., warmup → 4×800m @ Interval w/ 400m jog → cooldown) |
| Venue | `.track`, `.road`, `.course`, or `.any` — indicates where the workout is best performed (`.course` when segments reference a user-defined course; see §1.17) |
| Scheduled Date | Proposed date; user may move it |
| Notes | Optional coach notes for add-ons that are not modeled as segments — e.g., strides (4–6 × 20s strides after an easy run), drills (A-skips, high knees before a workout), or form cues. These are free-text instructions displayed alongside the workout. |

**Strength workouts** — When the plan includes strength training (see §1.7), strength sessions are stored as separate `StrengthWorkout` entities (see §2.10) rather than as running `Workout` records. They appear in the weekly schedule alongside running workouts but have their own data model with exercises, sets, reps, and equipment requirements.

**Track workouts** — Workouts with precise distance-based intervals (e.g., 800m repeats, 400m reps) are tagged as `.track` when the user has track access. Track workout distances are always displayed in meters regardless of the user's unit preference (e.g., 400m, 800m, 1600m — never 0.25 mi or 0.5 mi). If the user cannot get to a track (weather, travel, etc.), they can request conversion to a time-based equivalent (e.g., 4×800m w/ 90s rest → 4×3min w/ 90s rest). The coach converts using the user's current VDOT pace for the relevant zone. Users without track access get time-based workouts by default — no `.track` workouts are generated.

### 1.12 Pace Zones (VDOT)

All paces are specified using generic VDOT-derived zones rather than explicit paces:

**Training Zones:**

| Zone | Description |
|---|---|
| **Easy (E)** | Comfortable conversational pace |
| **Marathon (M)** | Goal marathon race pace |
| **Tempo (T)** | Lactate threshold effort |
| **Interval (I)** | VO2max effort |
| **Repeat (R)** | Fast/short repetition pace |

**Race Paces:**

In addition to training zones, the coach may prescribe segments at a specific **race pace** — the predicted pace for a given race distance based on the user's current VDOT. Common examples:

- **5K pace** — faster than Interval, useful for race-specific sharpening.
- **10K pace** — falls between Tempo and Interval; used for sustained hard efforts and race-specific work.
- **Half Marathon pace** — falls between Marathon and Tempo; used for goal-pace practice and stamina work.

Marathon pace is already covered by the M training zone. The coach may reference any race distance as a pace target (including custom distances like 15K or 8K), though the distances above are most common. Race paces are resolved to concrete values using the VDOT service's race prediction endpoint (see §3.8) — predicted finish time ÷ distance = pace.

Race paces and training zones serve different purposes: training zones target specific physiological adaptations (e.g., Tempo develops lactate threshold), while race paces target race-specific fitness (e.g., "10K pace" practices the exact effort the athlete will sustain on race day). The coach chooses between them based on the workout's intent.

A VDOT service (see §3.8) handles all VDOT-related calculations:
- **Race → VDOT** — given a race distance and finish time, returns the corresponding VDOT value.
- **VDOT → Paces** — given a VDOT, returns concrete pace ranges for each zone (E, M, T, I, R) in the user's preferred unit.
- **VDOT → Race Predictions** — given a VDOT, returns predicted finish times for standard race distances (5K, 10K, Half Marathon, Marathon).

The coach and UI reference zones generically; the app resolves zones to concrete paces via the VDOT service for display in the user's resolved unit (e.g., "Easy: 5:30–6:00 /km" or "Easy: 8:51–9:39 /mi"). Race predictions are shown alongside the user's current VDOT on the Dashboard and History screens.

**Initial VDOT estimation** uses a best-available approach:
1. **Race result** (highest confidence) — during onboarding, ask the user to enter a recent race result. The VDOT service calculates VDOT directly.
2. **HealthKit data** (moderate confidence) — if no race result is available, estimate VDOT from recent HealthKit running data using heart rate-based pace zone classification.

   **Minimum data quality requirements (per workout):**
   - Running workout only (`HKWorkoutActivityType.running`).
   - Duration >= 20 minutes and distance >= 3.0 km.
   - Pace must be plausible (between 2:30/km and 12:00/km after unit normalization).
   - Heart-rate completeness >= 70% of moving duration.
   - Dominant HR zone must account for >= 50% of sampled workout time.

   **Route/elevation handling:**
   - Route and elevation are preferred but not required for eligibility.
   - If elevation data is available, the app uses GAP-derived pace (§1.15) for the workout's pace input.
   - If elevation is missing, the app uses raw pace and applies a confidence penalty to that workout's contribution weight.

   **Statistical estimation procedure:**
   - Use a rolling 42-day lookback window, capped at the most recent 20 qualifying workouts.
   - For each qualifying workout, map dominant HR zone + representative pace to a per-workout VDOT candidate via the VDOT service (`pace -> VDOT` endpoint).
   - Outlier rejection uses robust MAD filtering: discard candidates with robust z-score > 3.5.
   - If fewer than 3 candidates remain after filtering, do not auto-estimate VDOT (fall back to conservative pacing until more data or a race result exists).
   - Compute final estimate as a weighted mean where each workout weight is:
     - `recencyWeight = 0.5^(ageDays / 21)` (21-day half-life), and
     - `qualityWeight` from data completeness (HR completeness and elevation presence).
   - Final estimate is rounded to one decimal place and stored with `source: "estimate:healthkit"` in VDOT history, marked as an estimate in UI. The user can accept or override it.
3. **Conservative fallback** — if neither is available, the coach generates plans using generic conservative paces and defers pace-zone-based training until a VDOT can be established from an early workout or race.

**Ongoing VDOT recalculation** from races is the primary mechanism — race results are high-confidence data points. VDOT adjustments from regular workouts should be rare, triggered only by a consistent trend of missing pace targets (not a single good or bad session). The coach communicates VDOT changes to the user.

### 1.13 Workout Matching

Completed workouts recorded in HealthKit are matched against planned workouts using a deterministic confidence score, then thresholded into auto-match vs. user-confirmation paths.

**Candidate set construction:**
- Build candidates from planned workouts whose scheduled date is eligible under the date cutoff policy below.
- Exclude already matched planned workouts unless the existing match is explicitly being replaced by a user action.

**Confidence scoring (0.0-1.0):**

`matchScore = 0.30 * dateScore + 0.20 * volumeScore + 0.15 * typeScore + 0.15 * intensityScore + 0.20 * segmentScore`

- `dateScore`:
  - `1.00` for same-day (including late-night grace).
  - `0.75` for ±1-day candidates.
- `volumeScore`:
  - Derived from distance and/or duration similarity (whichever planned fields are available), normalized to `[0,1]`.
  - If both duration and distance are available, use their average.
- `typeScore`:
  - `1.00` for strong type compatibility (e.g., long run <-> long-duration steady effort; interval plan <-> interval-like effort pattern).
  - `0.50` for weak/partial compatibility.
  - `0.00` for incompatible types.
- `intensityScore`:
  - Based on HR zone distribution and pace profile consistency with the planned workout's intended intensity.
  - If HR is unavailable, intensityScore is computed from pace profile only and capped at `0.70`.
- `segmentScore`:
  - Compares planned `WorkoutSegment[]` with inferred executed segments from HealthKit laps/splits and pace-HR change points.
  - Order of key work segments must be preserved, but warmup/cooldown boundaries are tolerant.
  - Wiggle room for real-world watch usage is allowed:
    - One extra non-key segment (for example, an extra warmup/cooldown split) does not penalize to zero.
    - One missed or merged rep is allowed for interval/repetition sessions (common when lap press is missed).
    - Rep count variance of +/-1 is acceptable when quality-volume variance remains within +/-15%.
  - Large segment structure mismatches (wrong rep pattern, reversed quality order, or missing most quality work) force `segmentScore <= 0.40`.

**Segment-aware gating:**
- Auto-match is not allowed when `segmentScore < 0.60`, even if overall `matchScore >= 0.80`.
- For structured sessions (`.tempo`, `.intervals`, `.repetitions`), if inferred segment count differs from plan by >2, user confirmation is mandatory.

**Segment comparison artifact (for UI and feedback):**
- For matched workouts, the matcher produces per-segment comparisons between planned and executed structure.
- For rep-based segments (for example, `6 x 400m @ I`), the app stores per-rep planned vs actual values so users can review adherence directly.
- Time-based rep segments are also compared rep-by-rep (for example, `5 x 5:00 @ T`). In these cases, adherence is evaluated primarily by planned intensity/pace target vs actual pace (prefer GAP when available), while still retaining actual rep distance for context.
- Example presentation target: planned `75s` reps vs actual `76, 75, 77, 74`.
- When lap presses are missed or extra laps are present, inferred reps are merged/split deterministically and flagged as `inferred` so the UI can show that light uncertainty.

**Threshold policy:**
- `matchScore >= 0.80` and unambiguous -> auto-match.
- `0.55 <= matchScore < 0.80` -> user confirmation required.
- `matchScore < 0.55` -> no match (workout stays unplanned).

**Tie-break and ambiguity handling:**
- If top two candidates differ by < `0.08` score, user confirmation is mandatory (no auto-match).
- If multiple candidates are on the same planned day (including doubles), user confirmation is mandatory unless one candidate exceeds all others by >= `0.15` and is >= `0.85` absolute score.
- If race-day matching candidates conflict with a non-race quality workout candidate, user confirmation is mandatory.
- If the user declines all suggestions, the workout remains unmatched and is treated as unplanned volume.

**Date cutoff policy (workouts + races):**
- Planned dates are evaluated in `TrainingPlan.canonicalTimeZoneId`.
- **Same-day** means workout start time falls within 00:00:00–23:59:59 on the planned calendar date.
- **Late-night grace:** a workout that starts between 00:00:00 and 03:59:59 on day D+1 is treated as eligible for day D (to cover just-after-midnight runs).
- **±1 matching window:** if no same-day (or grace-adjusted same-day) match is found, candidates on D−1 or D+1 are considered; anything beyond ±1 calendar day is never auto-matched.
- For races, the same cutoff rules apply to determine whether the race happened "on race day." When multiple candidates remain after cutoff filtering, explicit user confirmation is required.

Unmatched HealthKit workouts (e.g., a spontaneous run) are noted by the coach and factored into volume/fatigue calculations.

### 1.14 Post-Workout Check-In

After a HealthKit workout is detected — whether matched to a planned workout (§1.13) or recorded as an unplanned run — the app prompts the user to complete a check-in. The check-in captures the user's subjective experience before the coach generates feedback.

**Presentation:** A bottom sheet slides up when the user opens the app after a workout has been detected. The sheet is dismissible — the user can swipe it away and complete the check-in later from the Workout Detail screen. If multiple workouts were detected while the app was in the background, check-ins are queued and presented one at a time.

**Check-in content:**

1. **Workout summary card** — key stats from the matched HealthKit workout:
   - Matched workout name (e.g., "Easy Run") or "Unplanned Run" for unmatched workouts.
   - Distance and duration.
   - Average pace and grade-adjusted pace (when elevation data is available; see §1.15).
   - Average heart rate (when available).

2. **RPE (Rate of Perceived Effort)** — a 1–10 scale. Descriptive anchors at key points: 1 = rest, 3 = easy, 5 = moderate, 7 = hard, 10 = maximal. Optional — the user can submit without selecting a value. The coach explains RPE's value during onboarding.

3. **Effort modifiers** — quick-select chips for contextual factors that affected the run (see modifier list in §1.15). Tap to toggle. Multiple can be selected. The "Custom" chip opens a text field.

4. **Notes** — an optional free-text field for anything the user wants the coach to know about the run.

5. **Submit** — saves the check-in and triggers coach feedback generation.

**Timing and feedback generation:**
- When the user submits a check-in, coach feedback is generated using both objective HealthKit data and the user's subjective input (RPE, modifiers, notes).
- If the user dismisses the check-in without submitting, coach feedback is generated after a delay using objective data only. The coach notes that no RPE was provided and may ask about it in commentary.
- If the user completes a check-in after feedback was already generated, the coach re-evaluates and updates its commentary.

**Editing:** RPE, effort modifiers, and notes can be updated from the Workout Detail screen after submission. Edits trigger re-generation of coach feedback.

### 1.15 Feedback Loop

After a workout is matched and the user completes the post-workout check-in (§1.14) — or after a delay if the check-in is skipped — the coach generates feedback. The coach uses RPE, heart rate data, grade-adjusted pace, and effort modifiers alongside raw pace and volume to build a complete picture of the workout.

Heart rate data from HealthKit is evaluated against the user's HR zones, which are derived from their max heart rate (see §2.1). This gives the coach an objective intensity measure independent of pace.

**Heart Rate Zones** — The app uses the standard 5-zone model based on percentage of max heart rate (as defined by Polar and the American Heart Association):

| Zone | % of Max HR | Description |
|---|---|---|
| **Zone 1** | 50–60% | Recovery / warm-up |
| **Zone 2** | 60–70% | Easy / aerobic base |
| **Zone 3** | 70–80% | Moderate / tempo |
| **Zone 4** | 80–90% | Hard / threshold |
| **Zone 5** | 90–100% | Maximum / VO2max |

Zones are computed from the user's `maxHeartRate` (§2.1) — no separate configuration is needed. The coach uses these zones as an objective cross-check against pace and RPE. For example, an easy run should predominantly stay in Zones 1–2; significant time in Zone 3+ on an easy day is a flag for the coach to investigate fatigue or pacing habits.

**Grade-Adjusted Pace (GAP)** — The app computes grade-adjusted pace for every workout using elevation data from HealthKit. GAP converts the actual pace on hilly terrain to the equivalent effort on flat ground, giving the coach and athlete a more accurate picture of true effort.

GAP is calculated per-segment using the Minetti energy cost model (Minetti et al., 2002), which defines the metabolic cost of running as a function of gradient:

> C(g) = 155.4g⁵ − 30.4g⁴ − 43.3g³ + 46.3g² + 19.5g + 3.6

where *g* is the fractional grade (e.g., 0.05 for a 5% incline) and *C* is the energy cost in J/(kg·m). The grade-adjusted pace for a segment is:

> GAP = actual_pace × C(0) / C(g)

where C(0) is the cost of running on flat ground. For each segment of a workout, the app computes the average grade from HealthKit route elevation samples, applies the cost ratio, and derives GAP. The workout-level GAP is the distance-weighted average across all segments.

**How GAP is used:**
- The coach evaluates pace compliance using GAP rather than raw pace. A hilly easy run at 6:00/km raw pace may have a GAP of 5:30/km, confirming the athlete was actually running at the right effort.
- GAP is displayed alongside raw pace on workout cards and feedback screens (e.g., "Pace: 6:02/km · GAP: 5:28/km").
- VDOT recalculation from race results uses actual finish time and distance (not grade-adjusted), since race courses vary and VDOT tables already account for typical race conditions.
- When elevation data is unavailable (e.g., treadmill, indoor track, or HealthKit gaps), GAP equals raw pace and the metric is not displayed.

**Effort modifiers** — During the post-workout check-in (§1.14), the user may optionally tag the workout with contextual factors that affected the effort:

| Modifier | Description |
|---|---|
| Pushed Stroller | Running with a jogging stroller |
| Ran with Dog | Pace affected by a running partner (canine) |
| Trail / Off-Road | Ran on trails, grass, or uneven terrain |
| Treadmill | Ran on a treadmill (pace/distance may differ from outdoor equivalents) |
| High Altitude | Training at significantly higher elevation than usual |
| Poor Sleep | Notably poor or insufficient sleep the night before |
| Feeling Unwell | Mild illness, allergies, or general malaise |
| Custom | Free-text input for anything not covered above |

Effort modifiers are optional and purely informational — they give the coach context for why a workout may have deviated from expectations. The coach should not penalize the athlete for a slow easy run if they were pushing a stroller uphill. Over time, if a modifier is frequent (e.g., stroller on most runs), the coach factors it into baseline pace expectations.

**Key diagnostic signals:**
- **RPE vs. pace mismatch** is a key signal. An easy run that felt hard (high RPE, normal pace) may indicate fatigue, illness, or overtraining. A tempo run that felt easy (low RPE, on-pace) may indicate the athlete is ready for more.
- **Heart rate vs. pace mismatch** provides objective confirmation. An easy run at normal pace but elevated average heart rate corroborates high RPE and strengthens the case for fatigue. Conversely, lower-than-usual heart rate at the same pace suggests improving fitness.
- **Heart rate zone compliance** — the coach checks whether the workout's heart rate fell within the expected HR zone for the prescribed effort. An easy run where the athlete spent significant time above Zone 2 is worth flagging even if pace looked fine.
- RPE and heart rate trends over multiple workouts carry more weight than a single data point.

After each matched workout the coach provides:
- Assessment of the workout vs. the plan (pace compliance, volume, heart rate context, RPE context).
- Encouragement or corrective guidance in the selected personality.
- Adjustments to upcoming workouts if warranted (e.g., reduce volume after consistently high RPE/HR on easy runs, increase pace targets after a string of low-effort quality sessions).

### 1.16 End-of-Plan Assessment

When a plan completes the coach generates:
- Summary of planned vs. actual volume and pace trends.
- Key milestones and breakthroughs.
- Areas for improvement.
- VDOT progression over the plan.
- A discussion prompt about the user's next goals.
- A new proposed plan based on the assessment and user input.

### 1.17 Courses

Courses are user-defined measured distances on road or grass that the coach can use for distance-based interval workouts as an alternative to a track. A runner who prefers variety — or doesn't have convenient track access — might measure out a 1-mile loop in their neighborhood for mile repeats, or a 1 km path in a local park for 1000m repeats.

Each course has:
- A **name** (e.g., "Neighborhood Mile Loop", "Park 1K Path").
- A **measured distance and unit**. The user specifies the distance in whatever unit is natural for the course — miles, kilometers, or meters. **This unit is preserved and used for display regardless of the user's global unit preference.** A "1 mile" course always displays as "1 mile", not "1.61 km". A "1 km" course always displays as "1 km", not "0.62 mi".
- A **surface type**: road or grass.
- Optional **notes** (e.g., start/end landmarks, elevation notes, footing conditions).

**How the coach uses courses:**
- When generating interval workouts, the coach considers the user's available courses alongside their track access setting. A user with a 1-mile road course and no track access might receive "4 × 1 mi on Neighborhood Loop" instead of a time-based equivalent.
- Workout segments referencing a course display the course name and use the course's native distance unit (e.g., "4 × 1 mi on Neighborhood Loop", not "4 × 1.61 km").
- Rest intervals between course repeats are specified in time (e.g., 90s jog recovery) since the recovery distance is not tied to the course.
- Courses do not replace track workouts — they are an additional venue option. A user with both track access and courses may receive a mix of track and course-based workouts.

Courses are managed in Settings and stored at the user level (see §2.17).

### 1.18 Skipping Workouts

When a user knows they won't complete a planned workout, they can proactively skip it from the Workout Detail or Week Detail screen. Skipping triggers a short coach interaction:

- The user taps "Skip" and optionally selects a reason: schedule conflict, fatigue, minor soreness, weather, or a free-text custom reason.
- The coach acknowledges the skip and explains how the remaining week adjusts — e.g., redistributing volume to other days, dropping the workout entirely, or swapping a hard effort to a different day.
- If the skipped workout was a key session (long run, quality workout), the coach weighs whether to reschedule it or absorb the loss based on the plan phase and competitiveness level.

**Skipped vs. missed workouts:** A skipped workout is a proactive decision communicated to the coach before or on the scheduled date. A missed workout is one where the scheduled date passes with no matched HealthKit workout and no skip recorded. The coach handles missed workouts with a lighter touch — a check-in message asking what happened — rather than assuming intent.

**Strength workouts** can also be skipped using the same flow. Since strength sessions do not trigger VDOT or volume recalculations, the coach acknowledges the skip but does not redistribute strength work to other days.

### 1.19 Injury & Illness Mode

When a runner is injured or ill, the coach needs to shift from progressing the plan to managing recovery and safe return to training. The user can activate injury/illness mode from the Dashboard or Coach tab.

**Activation:**
- The user selects "I'm injured" or "I'm sick" (or a general "I need to pause training").
- A coach-guided conversation follows to understand the situation: What's the issue? How severe? Can they do any running? Any cross-training possible?
- The coach proposes a modified approach for the coming days or weeks.

**How the plan adapts:**
- **Minor illness/injury** — the coach reduces volume and intensity for 1–2 weeks, drops quality sessions, and monitors recovery via check-ins before ramping back up.
- **Significant time off** — the coach pauses the plan's weekly progression. When the user signals they're ready to return, the coach generates a return-to-running ramp-up (reduced volume, no quality work initially) before resuming the plan's structure.
- **Goal race at risk** — if the lost training time jeopardizes the goal race, the coach proactively flags this and suggests options: adjust the goal time, switch to a shorter race distance, or move the goal race date if possible.

The plan's volume profile and emphasis may be restructured around the interruption. Training weeks during injury/illness are tagged with an interruption type (see §2.7) so the end-of-plan assessment accounts for the disruption rather than penalizing adherence metrics.

### 1.20 Mid-Plan Goal Changes

A runner training for a marathon may get injured and need to pivot to a half marathon. A base-building runner may decide to sign up for a race. Rather than abandoning the current plan and losing all training context, the user can request a goal change on an active plan.

**How it works:**
- From the Plan view or Coach chat, the user initiates a goal change.
- The coach evaluates the new goal against the training already completed — weeks of volume, fitness gained, current VDOT, and time remaining.
- The coach proposes a revised plan: new duration (if needed), adjusted volume profile, and updated weekly emphases. Completed weeks are preserved as-is; only future weeks are restructured.
- The user reviews and confirms the revised plan (similar to the draft review step in the New Plan flow).

**Constraints:**
- The revised plan builds on existing fitness rather than starting from scratch. The coach uses the completed training as the new baseline.
- If the new goal is less demanding (e.g., marathon → half marathon), the coach may shorten the plan and adjust peak volume downward.
- If the new goal is more demanding (e.g., 10K → marathon), the coach evaluates whether there's enough time and flags risks honestly.
- VDOT and all workout history carry over — nothing is lost.
- A goal change produces a new `Goal` record; the previous goal is retained in `goalHistory` on the plan (see §2.5).

### 1.21 Plan Completion & Abandonment

**Plan completion** — A plan transitions from `.active` to `.completed` when its final week ends. The final week is determined by the plan's `numberOfWeeks` duration, which includes any post-race recovery weeks the coach built into the plan.

- The plan completes at the end of its final week regardless of whether all workouts have been completed.
- **Race plans with no recorded result** — if the goal race date passes with no matched HealthKit workout and no recorded `actualTime`, the coach prompts the user: "Did you run the race?" The user can enter a result manually, confirm they skipped it, or defer the race (which triggers a goal change flow per §1.20). The plan continues through its remaining weeks either way — post-race recovery runs are still valuable.
- **Non-race plans** (base building, recovery, custom) — the plan runs for its full `numberOfWeeks` duration. If the plan has a target date, that determines the final week.
- **Early completion** — the user can mark a plan as completed early from the Plan view. The coach generates a partial assessment covering completed weeks only.

When a plan completes, the coach generates the end-of-plan assessment (§1.16) and posts it in the Coach tab. The app transitions to the empty state (§1.5.1) with the assessment card visible on the Dashboard. If a `.draft` plan exists, the user is offered the option to activate it — mirroring the same offer made on plan abandonment.

**Plan abandonment** — The user can abandon an active plan at any time from the Plan view via an "Abandon Plan" action.

- A confirmation prompt explains that abandoning is permanent — the plan cannot be reactivated.
- After confirmation, the plan transitions to `.abandoned`.
- The coach generates a partial assessment covering completed weeks, framed constructively (what was accomplished, not what was missed).
- The coach proactively asks if the user wants to create a new plan, carrying forward the current VDOT and training context.
- If a `.draft` plan exists when the active plan is abandoned, the user is offered the option to activate it.

### 1.22 Workout Rescheduling

A user can reschedule a planned workout from the Workout Detail screen. Rescheduling moves the workout to a different date while keeping its content (type, segments, volume) intact.

**Constraints:**
- A workout can only be moved within the same training week. Cross-week moves are not supported — the coach manages inter-week volume balance through weekly detail generation.
- The target date must be a day the user is available to run (per their preferred running days or weekly availability override). The app shows available days as selectable and unavailable days as grayed out.
- If moving a workout would create a training conflict, the app warns the user before confirming:
  - **Back-to-back quality days** — moving a tempo to the day after intervals (or vice versa). The warning explains the recovery concern but allows the move.
  - **Double conflict** — moving a workout to a day that already has two workouts scheduled. The app blocks this move.

**Bump (cascade reschedule):**

In addition to moving a single workout, the user can **bump** a workout to the next day, cascading all subsequent workouts in the week forward by one day until the shift is absorbed by a rest day (a day with no scheduled workout).

- The user taps "Bump" on a workout. The app previews the resulting schedule: each affected workout shifts to the next available day, and the cascade stops when it reaches a day that has no workout (the gap absorbs the displacement).
- **Availability is respected** — if the next day is unavailable (per preferred running days or weekly override), the cascade skips over it and moves the workout to the next available day. Subsequent workouts cascade from there.
- **Blocked when there is no gap** — if every available day from the bumped workout through the end of the week already has a workout, the bump is blocked. The app explains that there is no room in the week and suggests skipping a workout or adjusting availability instead.
- **Back-to-back quality day warnings** still apply — if the cascade would stack quality sessions on consecutive days, the app shows the same warning as a single-workout reschedule. The user can proceed or cancel.
- **Double conflict** — if any workout in the cascade would land on a day that already has two workouts (e.g., a doubles day), the bump is blocked.
- Only **planned (not yet completed)** workouts are shifted. If a completed workout sits between the bumped workout and the gap, it stays in place and the cascade skips over it. A **skipped** workout is treated like a gap — the cascade absorbs it (the displaced workout takes the skipped workout's slot, and the cascade stops there).

**Coach response:**
- After a reschedule or bump, the coach does not re-evaluate the full week. The move is treated as a user scheduling decision. However, if the result creates a suboptimal pattern (e.g., long run the day before a race), the coach notes this in commentary without undoing the move.

**Strength workout rescheduling:** Strength workouts can be rescheduled within the same week using the same single-move mechanism as running workouts. Bump is not supported for strength workouts — only the individual session moves. The same double-conflict rule applies: a strength workout cannot be moved to a day that already has two running workouts scheduled.

**Interaction with calendar sync:**
- If calendar sync is enabled, rescheduling or bumping a workout updates the corresponding calendar events.

---

## 2. Data Model

### 2.1 User Profile

```
UserProfile
  id: UUID
  name: String
  maxHeartRate: Int                // defaults to 220 − age (age from HealthKit); user can override in Settings
  restingHeartRate: Int?            // from HealthKit; updated automatically
  unitPreference: .system | .metric | .imperial  // defaults to .system, which resolves to the device's Measurement System (Locale.measurementSystem); user can override in Settings
  volumePreference: .time | .distance
  currentVDOT: Double?
  trackAccess: Bool              // whether user has regular access to a running track
  equipmentAccess: [Equipment]   // available strength equipment (see §1.7)
  healthKitAuthorized: Bool
  calendarIdentifier: String?   // iCloud calendar for sync
```

**Separate related records** — To minimize CloudKit conflict blast radius (see §3.9), the following sub-objects are stored as separate SwiftData entities with a one-to-one relationship to `UserProfile`, rather than as flat fields:

```
RunningSchedule                    // separate record to isolate schedule edits from other profile changes
  userId: UUID
  preferredRunningDays: Set<Weekday>  // days the user is available to run (see §1.8); defaults to all seven
  runningDaysPerWeek: Int             // target number of running days; must be ≤ preferredRunningDays.count
  preferredLongRunDay: Weekday?       // preferred day for the long run (see §1.8); must be in preferredRunningDays; nil = coach chooses
  preferredQualityDays: [Weekday]     // ranked preference for hard efforts (see §1.8); first element = first choice; must be subset of preferredRunningDays; empty = coach chooses
  availabilityWindows: [Weekday: [TimeWindow]]  // optional time windows per day (see §1.8); empty array = any time
```

`Competitiveness` (§2.2) and `Personality` (§2.3) are already separate entities with their own records. `vdotHistory` is stored as individual `VDOTRecord` child records (see below).

```
VDOTRecord                         // append-only child record; avoids array-level CloudKit conflicts
  id: UUID
  userId: UUID
  date: Date
  vdot: Double
  source: String                   // e.g., "race:5K", "estimate:healthkit", "coach:adjustment"
```

`Equipment` is an enum: `.bodyweightOnly`, `.dumbbells`, `.kettlebells`, `.exerciseBands`, `.fullGym`.

`TimeWindow` represents a time range within a single day:

```
TimeWindow
  start: Time    // e.g., 06:00
  end: Time      // e.g., 07:30
```

`TimeWindow` values are wall-clock times without timezone offsets. For active plans, they are interpreted in `TrainingPlan.canonicalTimeZoneId` and normalized per the DST rules in §1.10.

`WeekAvailabilityOverride` replaces the profile-level availability for a specific training week:

```
WeekAvailabilityOverride
  availableDays: Set<Weekday>?                   // overrides preferredRunningDays for this week; nil = use profile default
  windowOverrides: [Weekday: [TimeWindow]]?      // overrides availability windows for specific days; nil = use profile default
  note: String?                                  // optional user note (e.g., "Work conference Wed–Fri")
```

### 2.2 Competitiveness

```
Competitiveness
  level: .conservative | .balanced | .aggressive
```

### 2.3 Personality

```
Personality
  id: UUID
  name: String
  isPreset: Bool
  description: String          // for presets: hardcoded flavor text; for custom: user-written
  systemPrompt: String         // for presets: hardcoded; for custom: AI-generated from description
```

### 2.4 Goal

```
Goal
  id: UUID
  type: .race | .nonRace | .custom
  nonRacePreset: .baseBuilding | .recovery | nil                  // set when type == .nonRace
  customDescription: String?      // set when type == .custom
  raceId: UUID?                   // references Race.id; set when type == .race (race distance, date, and goal time live on Race)
  targetDate: Date?               // optional end date for non-race goals
```

### 2.5 Training Plan

```
TrainingPlan
  id: UUID
  userId: UUID
  goalId: UUID                    // references Goal.id
  startDate: Date
  canonicalTimeZoneId: String     // IANA timezone captured at activation (e.g., "America/Los_Angeles"); used for week boundaries and scheduled-date semantics
  numberOfWeeks: Int
  volumeMode: .time | .distance    // defaults from UserProfile.volumePreference at creation; stored per-plan so historical plans retain their mode
  peakWeekVolume: Double        // running-only peak; minutes when volumeMode == .time, meters when volumeMode == .distance (canonical storage)
  includesStrength: Bool          // whether strength/core workouts are included
  strengthEquipment: [Equipment]  // snapshot of equipment selected at plan creation
  weeklyVolumeProfile: [Int: Double]  // week number → % of peak (0.0–1.0)
  weeklyEmphasis: [Int: String]       // week number → training emphasis
  status: .draft | .active | .completed | .abandoned
  assessment: PlanAssessment?
```

`peakVolumeHistory` and `goalHistory` are stored as separate child records rather than inline arrays, so concurrent appends from different devices don't overwrite each other (see §3.9):

```
PeakVolumeChange                   // append-only child record
  id: UUID
  planId: UUID
  date: Date
  previousVolume: Double
  newVolume: Double
  reason: String                   // e.g., "injury", "goal change to half marathon"
```

```
GoalChange                         // append-only child record
  id: UUID
  planId: UUID
  previousGoalId: UUID             // references Goal.id
  changedAt: Date
```

### 2.6 Race

```
Race
  id: UUID
  planId: UUID?                    // nil for standalone race results (entered during onboarding or in Settings); set when the race is part of a training plan
  distance: Double               // always stored in meters (e.g., 5000, 21097.5, 42195); presets populate known values, custom distances entered by user
  label: String                  // display name (e.g., "5K", "Half Marathon", "15K", "50 Miles"); auto-generated for presets, user-provided for custom
  date: Date
  goalTime: TimeInterval?
  actualTime: TimeInterval?
  vdotFromResult: Double?         // VDOT calculated from race result
```

Standalone races (where `planId` is nil) are race results entered outside the context of a training plan — during onboarding (§1.5 step 6) or via Settings → Race Results. They serve as VDOT data points and historical records. When a race is added to an active plan (§1.6), `planId` is set to that plan's ID.

### 2.7 Training Week

```
TrainingWeek
  id: UUID
  planId: UUID
  weekNumber: Int
  targetVolumePercent: Double   // from plan's weeklyVolumeProfile
  workouts: [Workout]
  strengthWorkouts: [StrengthWorkout]  // empty if plan does not include strength
  availabilityOverride: WeekAvailabilityOverride?  // per-week override of profile-level availability (see §1.8)
  interruptionType: .injury | .illness | .other | nil  // set when injury/illness mode is activated during this week (see §1.19); nil = normal training
  coachNotes: String?
  generated: Bool               // false until detailed workouts are generated
```

### 2.8 Workout

```
Workout
  id: UUID
  weekId: UUID
  type: WorkoutType
  volumePercent: Double         // % of peak week volume
  segments: [WorkoutSegment]      // optional (empty = entire workout at easy pace)
  scheduledDate: Date
  notes: String?                  // free-text add-ons: strides, drills, form cues (see §1.11)
  matchedHealthKitId: UUID?
  checkIn: WorkoutCheckIn?       // user's subjective input from post-workout check-in (see §1.14)
  feedback: WorkoutFeedback?
  venue: .track | .road | .course | .any  // where the workout is best performed; .course when segments reference a user-defined course (see §1.17)
  origin: .planned | .unplanned   // .unplanned = created from an unmatched HealthKit workout
  status: .planned | .completed | .skipped | .modified  // .modified = coach adjusted this workout after initial generation (e.g., due to skip response, injury adjustment, or feedback-triggered change); preserves the fact that the workout differs from its originally generated form
  skipReason: SkipReason?         // set when user proactively skips (see §1.18); nil for missed or completed workouts
```

`WorkoutType` is an enum: `.easyRun`, `.longRun`, `.tempo`, `.intervals`, `.repetitions`, `.recovery`.

`SkipReason` is an enum: `.scheduleConflict`, `.fatigue`, `.soreness`, `.weather`, `.custom(String)`.

### 2.9 Workout Segment

```
WorkoutSegment
  order: Int
  label: String                 // e.g., "Warmup", "4×800m", "Cooldown"
  paceZone: PaceZone            // .easy | .marathon | .tempo | .interval | .repeat | .racePace(distance: Double, label: String)
  targetVolume: Double          // distance or time for this segment
  volumeUnit: .meters | .kilometers | .miles | .seconds
  courseId: UUID?                // references Course.id; when set, segment displays using the course's name and distance unit (see §1.17)
  rest: Double?                 // recovery duration/distance between reps
  restUnit: .meters | .kilometers | .miles | .seconds
```

### 2.10 Strength Workout

```
StrengthWorkout
  id: UUID
  weekId: UUID
  title: String                 // e.g., "Lower Body Strength", "Core Circuit"
  exercises: [StrengthExercise]
  scheduledDate: Date
  estimatedDuration: TimeInterval  // in seconds (typically 15–30 min)
  status: .planned | .completed | .skipped
  coachNotes: String?
```

### 2.11 Strength Exercise

```
StrengthExercise
  order: Int
  name: String                  // e.g., "Bulgarian Split Squats", "Dead Bug"
  equipment: Equipment?         // which piece of equipment is needed; nil for bodyweight
  sets: Int
  reps: Int?                    // nil when holdDuration is used instead (e.g., planks)
  holdDuration: TimeInterval?   // for isometric exercises (in seconds)
  rest: TimeInterval?           // rest between sets (in seconds)
  notes: String?                // coaching cues or form reminders
```

### 2.12 Workout Check-In

User-submitted subjective data captured via the post-workout check-in flow (see §1.14).

```
WorkoutCheckIn
  workoutId: UUID
  rpe: Int?                        // 1–10; nil if user skipped RPE
  effortModifiers: [EffortModifier]  // contextual factors (see §1.15); empty if none selected
  notes: String?                   // free-text user notes; nil if not provided
  submittedAt: Date
```

`EffortModifier` is an enum with an associated value for custom entries: `.pushedStroller`, `.ranWithDog`, `.trailOffRoad`, `.treadmill`, `.highAltitude`, `.poorSleep`, `.feelingUnwell`, `.custom(String)`.

### 2.13 Workout Feedback

Coach-generated output produced after a workout is matched and (optionally) the user submits a check-in.

```
WorkoutFeedback
  workoutId: UUID
  matchedDate: Date
  actualDistance: Double           // always stored in meters
  actualDuration: TimeInterval
  averagePace: Double              // always stored in seconds per meter; converted to user's preferred unit for display
  gradeAdjustedPace: Double?       // seconds per meter; nil when elevation data unavailable (see §1.15)
  elevationAscent: Double?         // meters; from HealthKit route data
  elevationDescent: Double?        // meters; from HealthKit route data
  averageHeartRate: Double?        // bpm; from HealthKit (nil if HR data unavailable)
  maxHeartRate: Double?            // bpm; from HealthKit
  segmentComparisons: [SegmentComparison]?  // planned vs actual by segment/rep for completed structured workouts
  coachCommentary: String
  adjustmentsMade: [String]     // description of any plan changes triggered
```

```
SegmentComparison
  plannedSegmentOrder: Int
  plannedLabel: String
  plannedPaceZone: PaceZone?
  plannedTargetVolume: Double?
  plannedVolumeUnit: .meters | .kilometers | .miles | .seconds
  actualTargetVolume: Double?        // aggregate actual for this segment; same canonical unit semantics
  actualVolumeUnit: .meters | .kilometers | .miles | .seconds
  adherenceScore: Double             // 0.0–1.0 segment-level adherence
  inferred: Bool                     // true when reps were reconstructed due to missed/extra lap boundaries
  reps: [SegmentRepComparison]?      // present for repetition/interval-style segments
```

```
SegmentRepComparison
  repIndex: Int                      // 1-based within the segment
  plannedSeconds: Double?            // set for time-based reps
  plannedMeters: Double?             // set for distance-based reps
  plannedPaceSecondsPerMeter: Double?  // resolved from planned pace zone / race pace target when applicable
  actualSeconds: Double?
  actualMeters: Double?
  actualPaceSecondsPerMeter: Double?   // prefer GAP-derived pace when available, else raw pace
  paceDeltaPercent: Double?            // (actual - planned) / planned for pace-aware comparisons
  inferred: Bool
```

### 2.14 Conversation

```
Conversation
  id: UUID
  planId: UUID?
  trigger: .workoutFeedback | .assessment | .injuryIllness | .goalChange | .adHoc
  relatedWorkoutId: UUID?         // set when trigger == .workoutFeedback
  createdAt: Date
```

The `.workoutFeedback` trigger creates a `Conversation` when the coach's feedback on a workout includes plan-altering adjustments (e.g., modifying future workouts). Routine feedback that does not trigger adjustments is stored only on the `Workout` entity via `WorkoutFeedback` (§2.13) and does not create a separate `Conversation`.

### 2.15 Chat Message

```
ChatMessage
  id: UUID
  conversationId: UUID
  role: .coach | .user
  content: String
  timestamp: Date
```

**Retention policy:** All conversations and messages are persisted in SwiftData and synced via CloudKit. Messages are small text records and are retained indefinitely — no pruning or archival. The UI scopes conversations by plan (via `Conversation.planId`), so only the relevant plan's conversations are loaded into memory at a time. What gets sent to the AI as context is a separate concern managed by the context windowing strategy (see §5.2–5.3); the underlying message data is always preserved.

### 2.16 Plan Assessment

```
PlanAssessment
  planId: UUID
  summary: String
  volumeAdherence: Double       // 0.0–1.0
  paceAdherence: Double         // 0.0–1.0
  vdotStart: Double
  vdotEnd: Double
  highlights: [String]
  areasForImprovement: [String]
  nextPlanSuggestion: String
  discussionPrompts: [String]   // questions about next steps (see §5.4)
```

### 2.17 Course

```
Course
  id: UUID
  userId: UUID
  name: String                  // e.g., "Neighborhood Mile Loop", "Park 1K Path"
  distance: Double              // the measured distance in the specified unit
  distanceUnit: .meters | .kilometers | .miles  // unit as entered by user; preserved for display regardless of user's global unit preference
  surface: .road | .grass
  notes: String?                // optional description, landmarks, or footing notes
```

### 2.18 Onboarding State

```
OnboardingState
  currentStep: OnboardingStep   // the next step to present on launch; advances as each step is completed
  isComplete: Bool              // true after the user finishes the final step; onboarding is never shown again
```

`OnboardingStep` is an ordered enum matching the flow in §1.5: `.welcome`, `.healthKitAuthorization`, `.profileBasics`, `.runningSchedule`, `.trackAccess`, `.establishVDOT`, `.competitiveness`, `.personality`, `.notifications`, `.done`.

**Incremental save behavior:** When the user completes a step, its data is written directly to `UserProfile` (or related models like `vdotHistory`) and `currentStep` advances to the next step. `UserProfile` is progressively populated during onboarding — there is no separate staging area for in-progress data. On app launch, if `isComplete` is false, the app presents onboarding starting from `currentStep`. Steps that are purely informational (e.g., Welcome) simply advance the step counter.

### 2.19 Data Lifecycle, Retention, Deletion, and Portability

SlopMiles stores user data in SwiftData and syncs via CloudKit private database. There is no shared/public feed of user health data.

**Retention policy by entity (default: retained until user deletion):**

| Entity / Data Class | Retention | Deletion Behavior | Included in Export |
|---|---|---|---|
| `UserProfile`, schedule/preferences, onboarding state | Retained until reset | Deleted by Reset App | Yes |
| `TrainingPlan`, `TrainingWeek`, `Workout`, `StrengthWorkout`, races, skip/check-in metadata | Retained until reset | Deleted by Reset App | Yes |
| `WorkoutFeedback`, `PlanAssessment` | Retained until reset | Deleted by Reset App | Yes |
| `Conversation`, `ChatMessage` | Retained until reset | Deleted by Reset App | Yes |
| `vdotHistory` (manual, race-derived, HealthKit-estimated entries) | Retained until reset | Deleted by Reset App | Yes |
| User-managed `Course` records | Retained until reset | Deleted by Reset App | Yes |
| Pending AI request queue + validator diagnostics | Operational data retained up to 30 days, then pruned | Deleted immediately by Reset App | No (internal operational records) |

**Data minimization:**

- Raw AI response JSON is not persisted (§5.0.2).
- HealthKit remains the source of truth for raw workout samples; SlopMiles stores only app-level records needed for coaching, matching, and history views.
- Deleting data in SlopMiles does not delete the underlying workout in Apple Health.

**Portability/export expectations:**

- Settings includes an **Export My Data** action that produces a JSON export package containing user-owned app data (profile, plans, workouts, races, check-ins, chat, assessments, and VDOT history).
- Export is generated on-device and shared through the standard iOS share sheet.
- Export package does not include CloudKit metadata, internal diagnostics, or private AI prompt templates.

**User-facing privacy disclosures (shown in onboarding + Settings > Privacy):**

- What is read from HealthKit and why (training analysis, matching, HR context).
- What is synced to CloudKit private storage and that sync is tied to the user's Apple ID.
- That AI calls are used for coaching outputs and include only the minimum context needed per call type.
- How to export data and how to perform full deletion via Reset App.

---

## 3. System Architecture

### 3.1 High-Level Components

```
┌─────────────────────────────────────────────┐
│                   UI Layer                  │
│                  (SwiftUI)                  │
├─────────────────────────────────────────────┤
│                Coach Engine                 │
│  ┌───────────┐ ┌──────────┐                 │
│  │   Plan    │ │ Feedback │                 │
│  │ Generator │ │  Engine  │                 │
│  └───────────┘ └──────────┘                 │
├─────────────────────────────────────────────┤
│              Integration Layer              │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐  │
│  │HealthKit │ │WorkoutKit │ │  Calendar  │  │
│  │  Import  │ │  Sync     │ │  Sync      │  │
│  └──────────┘ └───────────┘ └────────────┘  │
│  ┌──────────┐ ┌───────────┐                 │
│  │ Weather  │ │   VDOT    │                 │
│  │  Service │ │  Service  │                 │
│  └──────────┘ └───────────┘                 │
├─────────────────────────────────────────────┤
│              Persistence Layer              │
│         (SwiftData + CloudKit sync)         │
└─────────────────────────────────────────────┘
```

### 3.2 Coach Engine

The coach engine wraps AI interactions. All AI calls go through a single service that:
- Constructs prompts from the competitiveness level, personality, user profile, plan context, and recent data.
- Sends structured requests to the AI backend.
- Parses structured responses (JSON) for plan generation, feedback, and assessments.
- Runs deterministic validation and correction before mutating persisted models (see §5.0.3).
- Falls back gracefully on network failure, following the failure UX rules below.

**AI Failure UX:**

Every AI call can fail (network error, timeout, malformed response). The app handles failures per call type:

| AI Call | On Failure | User Sees | Recovery |
|---|---|---|---|
| **Plan generation** (§5.1) | User's inputs are preserved; no proposal is created. | Error banner in the Review step: "Couldn't reach your coach — check your connection." Retry button below the banner. | User taps Retry. They can also go back and edit inputs without losing them. |
| **Weekly detail generation** (§5.2) | Week stays `generated: false`. | Week card shows volume target and emphasis from the plan outline, but no individual workouts. Inline retry button: "Generate workouts." | User taps Retry, or the app auto-retries on next foreground launch if connectivity is available. |
| **Workout feedback** (§5.3) | Workout is still matched; check-in data is saved locally. | Feedback section on Workout Detail shows "Coach feedback pending." | Auto-retries in background. No user action needed — feedback appears when available. |
| **End-of-plan assessment** (§5.4) | Plan still transitions to `.completed`. | Assessment card on Dashboard and Coach tab shows "Assessment pending" with a Retry button. | User taps Retry, or the app auto-retries on next launch. |
| **Skip response** (§5.5) | Skip is recorded locally (status → `.skipped`, reason saved). Remaining workouts are unchanged. | Coach commentary area shows "Coach response pending." The skip itself is confirmed immediately. | Auto-retries. Week adjustments apply when the response arrives. |
| **Injury/illness** (§5.6) | User's activation intent is noted but the plan is **not** modified without AI confirmation. | Coach chat shows a connectivity error message with Retry. The plan continues as-is until the coach responds. | User retries from the Coach tab. |
| **Goal change** (§5.7) | No plan changes are made. | Coach chat shows a connectivity error with Retry. Current goal remains active. | User retries from the Coach tab. |
| **Coach chat** (ad-hoc) | Message is not sent. | Message shows "Failed to send" with a Retry indicator (tap to resend). | User taps the failed message to retry. |

**General principles:**
- Local state changes (skip recording, workout matching, check-in saving, plan completion) are never blocked by AI failures. The AI enriches these events but is not a prerequisite for them.
- Calls that don't require user review (feedback, skip response, assessment) auto-retry on connectivity restoration or next app foreground — up to 3 attempts with exponential backoff, then surface a manual Retry.
- Calls that produce plan-altering proposals (plan generation, weekly detail, injury, goal change) require explicit user-initiated Retry — the app does not silently modify the plan in the background.
- All pending AI requests are persisted locally so they survive app termination.

**AI Call Rate Limiting & Cost Management:**

The app manages AI call volume through debouncing, batching, and prioritization:

- **Batched workout feedback** — When multiple HealthKit workouts are matched during a single background processing cycle (e.g., the user was offline for several days), the app sends a single batched feedback call covering all newly matched workouts rather than one call per workout. The response contains per-workout commentary.
- **Debounced feedback regeneration** — When the user edits a check-in (RPE, modifiers, or notes) after feedback has already been generated, the app waits 30 seconds after the last edit before triggering regeneration. This prevents rapid successive AI calls during iterative edits.
- **Deduplication** — If an AI call is already in-flight or queued for a given entity (e.g., feedback for workout X), a duplicate request for the same entity is dropped. The pending call's result serves both triggers.
- **Priority queue** — AI calls are processed through a serial queue with priority levels:
  1. **User-blocking** (highest) — Plan generation, weekly detail generation, goal change evaluation, injury/illness management. These block user workflows and are processed immediately.
  2. **Interactive** — Ad-hoc coach chat messages. Processed in order, one at a time.
  3. **Background** (lowest) — Workout feedback, skip responses, assessment generation. Processed when no higher-priority calls are pending.
- **Retry budget** — Auto-retried calls (see failure UX above) consume a maximum of 3 retry attempts per call. After 3 failures, the call requires manual user retry. This prevents infinite retry loops from consuming budget during extended outages.

### 3.3 HealthKit Integration

**Read:**
- Running workouts (distance, duration, route, heart rate).
- Elevation data (ascent, descent, and per-segment grade from route samples) for grade-adjusted pace calculation (see §1.15).
- Historical training data for plan generation context.
- Date of birth (used to calculate default max heart rate via 220 − age).
- Resting heart rate (updated automatically; used for HR zone calculation and as a fitness/fatigue indicator).

**Workout Matching:**
- After a HealthKit workout appears, attempt automatic match to a planned workout.
- If confidence is low, prompt the user.

**Permissions:**
- Request only necessary HealthKit types.
- Handle authorization denial gracefully with clear explanation of reduced functionality.

### 3.4 WorkoutKit Integration

- Schedule planned workouts to Apple Watch via WorkoutKit.
- Include workout structure (segments, pace targets) so the watch can guide the user during the run.
- **Auto-sync** — upcoming workouts (next 7 days) are automatically synced to the Watch whenever weekly detail is generated or workouts are modified (including reschedules, bumps, skip-triggered adjustments, and coach-initiated changes). The sync window refreshes daily.
- **Manual push** — the "Push to Watch" action on Workout Detail (§4.2) allows the user to manually sync a specific workout on demand — useful for workouts outside the 7-day auto-sync window or to force an immediate update after a change.

### 3.5 Background Delivery & Notifications

**HealthKit background delivery:**

The app registers an `HKObserverQuery` for `.workoutType()` and calls `healthStore.enableBackgroundDelivery(for:frequency:.immediate)` at launch. This requires the `com.apple.developer.healthkit.background-delivery` entitlement. When HealthKit saves a new workout (e.g., after an Apple Watch run completes), iOS wakes the app in the background and fires the observer query's update handler. Inside that handler the app:

1. Runs an `HKAnchoredObjectQuery` from the last stored anchor to fetch only new/changed workout samples.
2. Performs workout matching (§1.13) against planned workouts.
3. Queues AI feedback generation (§5.3) for matched workouts at background priority.
4. Calls the observer query's completion handler to signal processing is finished.

The anchored query approach ensures no workouts are missed — if multiple workouts land while the app is suspended, the next wake processes all unprocessed samples from the stored anchor.

**Notifications:**

- Push notifications are sent for:
  - **Weekly plan generation** — when a new week's workouts are ready.
  - **Plan adjustments** — when workout feedback causes the coach to modify upcoming workouts.
- Routine workout feedback (no plan changes) appears in the Coach tab but does not trigger a push notification.

### 3.6 Calendar Integration

- Create/update events in a user-selected iCloud calendar.
- Events include workout type, target volume, and pace zone summary in the notes.
- One-way sync: the app creates and updates calendar events, but changes made directly in Calendar are not detected. Rescheduling is done in-app (see §1.22).

### 3.7 Weather Service

- Fetch a weekly weather outlook (daily high temperature and humidity) for the user's location using WeatherKit.
- Weather data is provided to the coach as input during weekly detail generation (§5.2).
- The coach uses weather data to adjust pace expectations and add heat/humidity guidance in workout notes — the app does not enforce pace changes automatically.
- Requires location access (Core Location). Location permission is requested on first weekly detail generation (not during onboarding, to reduce permission fatigue). The prompt explains that location is used only for weather data to tailor workout guidance. If denied, the coach generates workouts without weather context. The user can enable location access later in system Settings.

### 3.8 VDOT Service

A VDOT calculator service provides all VDOT-related computations. The service is implemented as a local library bundled with the app — there are no network dependencies. The app accesses it through an abstracted interface so the implementation can be swapped or tested independently.

**Endpoints:**
- **Race → VDOT** — accepts a race distance and finish time, returns a VDOT value.
- **Pace → VDOT** — accepts a pace value and training zone (E, M, T, I, or R), returns the VDOT that corresponds to that pace in that zone. Used for HealthKit-based VDOT estimation (§1.12) — e.g., given an Easy pace of 5:30/km, returns the VDOT where 5:30/km falls within the Easy range.
- **VDOT → Paces** — accepts a VDOT value, returns pace ranges for each training zone (E, M, T, I, R).
- **VDOT → Race Predictions** — accepts a VDOT value and race distance, returns predicted finish time.

**Usage within the app:**
- Called when a user enters a race result (onboarding or mid-plan) to compute their VDOT.
- Called whenever the user's VDOT changes to refresh displayed pace zones and race predictions.
- Called by the UI to resolve generic pace zones (e.g., "Tempo") to concrete paces (e.g., "4:45 /km") for display on workout cards, segment details, and the Dashboard.
- Called to resolve race pace targets (e.g., "10K pace") to concrete paces — the race prediction endpoint provides finish time for the distance, and the app derives pace from finish time ÷ distance.
- The coach AI does not call this service directly — the app resolves paces before display. The AI references zones generically (E, M, T, I, R) and race paces by distance label (e.g., "10K pace") in its outputs.

### 3.9 CloudKit Conflict Resolution

SwiftData with CloudKit sync uses last-writer-wins at the record level (based on CloudKit server timestamp). Rather than fighting this default, the data model is designed to minimize meaningful conflicts:

**Low-risk entities (last-writer-wins is safe):**
- **ChatMessage, WorkoutFeedback, PlanAssessment** — coach-generated content is produced on a single device and is append-only or write-once. Conflicts don't arise in practice.
- **WorkoutCheckIn** — check-ins are submitted once from whichever device the user is on. Edits are rare and last-writer-wins is acceptable.
- **TrainingWeek, Workout, StrengthWorkout** — detailed workouts are generated by a single AI call and written atomically. Status transitions (planned → completed/skipped) happen on one device because they're triggered by HealthKit matching or user action on the device in hand.
- **Race** — added or edited infrequently. `actualTime` and `vdotFromResult` are write-once after a race.
- **Course** — user-managed, edited infrequently. Last-writer-wins is fine.
- **OnboardingState** — progresses linearly on a single device. If onboarding somehow runs on two devices simultaneously, last-writer-wins produces a valid (if slightly disorienting) result — the user just re-does a step.

**Moderate-risk entities (mitigated by design):**
- **UserProfile** — the most likely candidate for concurrent edits (e.g., changing personality on the phone while changing units on the iPad). Because SwiftData syncs at the record level, a profile change on one device overwrites the entire record, including fields the user didn't touch. **Mitigation:** the app stores profile sub-objects (competitiveness, personality, running schedule, equipment) as separate related records rather than flat fields on a single `UserProfile` record. This narrows the blast radius of a last-writer-wins conflict — changing personality on one device won't overwrite a running schedule change on another.
- **TrainingPlan** — `status` transitions (draft → active, active → completed/abandoned) are inherently single-device actions. The moderate risk is `peakWeekVolume` being adjusted by the coach on one device while the user views the plan on another, but coach-initiated adjustments are triggered by user interaction on a single device, so this is low-risk in practice. `peakVolumeHistory` and `goalHistory` are append-only arrays — **mitigation:** store these as separate child records rather than inline arrays so appends from different devices don't overwrite each other.

**General principles:**
- Prefer append-only child records over mutable arrays on parent records. This turns array-level conflicts into harmless concurrent inserts.
- Write-once fields (e.g., `vdotFromResult`, `actualTime`, `matchedHealthKitId`) are naturally conflict-free — they go from nil to a value once.
- AI-generated content is always produced in response to a user action on a single device. The app does not trigger AI calls from multiple devices simultaneously for the same entity.
- If a user observes stale data after a sync (e.g., a workout status that briefly reverts), the next foreground sync resolves it. No user-facing conflict resolution UI is needed.

### 3.10 Audit and Telemetry Boundaries for Health Data

Telemetry must be privacy-minimizing by default and must not exfiltrate raw health records.

**Allowed telemetry/audit content:**

- App reliability metrics (request latency, retry count, parse/validator error codes, crash diagnostics).
- Product usage counters (feature entry, button taps, workflow completion) without health-value payloads.
- Security-relevant audit events: HealthKit permission changes, Export initiated/completed, Reset initiated/completed.

**Prohibited telemetry content (unless explicitly user-exported):**

- Raw or per-sample HealthKit values (heart-rate series, GPS routes, elevation streams).
- Exact workout-level pace/HR/distance payloads in analytics events.
- Free-text user notes or chat message bodies.
- Full AI prompts/responses or any payload containing personally sensitive health narratives.

**Handling rules:**

- Telemetry events use stable pseudonymous identifiers (no name/email in event payloads).
- Audit/telemetry payloads are bounded to operational metadata; health context is represented only as coarse buckets when necessary (e.g., "HR available: yes/no").
- Any future expansion beyond these boundaries requires an explicit in-app disclosure update and user opt-in before collection.

---

## 4. User Interface

Navigation is tab-based.

### 4.1 Tab Structure

| Tab | Purpose |
|---|---|
| **Dashboard** | Current week overview, next workout, coach messages |
| **Plan** | Full plan view — weekly volume chart, week-by-week breakdown |
| **History** | Past workouts, feedback, VDOT trend |
| **Coach** | Chat-style interface for interacting with the AI coach |
| **Settings** | Profile, competitiveness, personality, integrations, volume preference |

### 4.2 Key Screens

#### Dashboard
- Hero card: next scheduled workout with type, volume, and pace zones.
- Week progress ring showing completed vs. planned volume.
- Recent coach message preview (tap to expand or go to Coach tab).
- VDOT badge showing current value, trend arrow, and predicted race times (tap to expand).
- **Injury/illness entry point** — a prominent action (e.g., "I need to pause" or a status indicator) that launches the injury/illness coach conversation (see §1.19).

#### Plan Overview
- Horizontal scrollable week bar with volume bars (% of peak) and emphasis label per week.
- Current week highlighted.
- Tap a week to see its workouts.
- While plan is in draft: editable peak volume field. On active plans, shows current peak volume with a history indicator if it has been adjusted mid-plan (tap to see peak volume history with dates and reasons).
- **Change goal** — action to initiate a mid-plan goal change (see §1.20). Opens the goal change flow via the coach. Only available when the plan is `.active`.
- Weeks tagged with an interruption type (§1.19) display a visual indicator (e.g., badge or muted styling) so the user can see at a glance which weeks were affected.

#### Week Detail
- List of workouts for the selected week.
- Each workout card shows: type, volume, pace zones, date, status. Races scheduled during the week are displayed as distinct cards.
- Tap a workout to see full segment breakdown and (if completed) feedback.
- **Remove race** — upcoming non-primary races show a remove action. Removing a race triggers the coach to re-evaluate the week's workouts (see §1.6). Completed races and the goal race do not show this action.
- **Availability override** — edit available days and time windows for this specific week (see §1.8). Displays the override note if set. Overrides on future weeks trigger a coach re-evaluation when the week's workouts are generated.

#### Workout Detail
- Segment timeline visualization.
- Pace zone color coding.
- If completed: overlay actual data on planned targets, RPE badge (if provided), effort modifier chips.
- **Segment comparison table** — for completed structured workouts, show planned vs actual per segment and per rep (when applicable). Example: `400m reps planned at 75s` displayed alongside actual split times such as `76, 75, 77, 74`; inferred/merged reps are visibly labeled. For time-based reps (for example, `5 x 5:00`), display planned pace vs actual pace per rep and also show actual rep distance.
- **Check-in section** — after a workout is matched, the check-in inputs (RPE, effort modifiers, notes) are accessible here. If the user dismissed the check-in sheet (see §1.14), they can complete it inline. If already submitted, values are shown and editable.
- Coach feedback section (populated after check-in submission or after timeout).
- Actions: reschedule, bump (see §1.22), skip (see §1.18), push to Watch, add to calendar.
- **Skip flow** — tapping "Skip" presents a reason picker (schedule conflict, fatigue, soreness, weather, custom). After confirmation, the coach responds with adjusted plan for the rest of the week.

#### Coach Chat
- Conversational interface.
- The coach proactively posts messages (workout feedback, weekly summaries, plan milestones).
- User can ask questions, request changes, or discuss goals.
- End-of-plan assessment appears here as a rich card.
- Injury/illness conversations (§1.19) and goal change discussions (§1.20) take place here. The coach uses structured prompts to gather information and presents revised plan proposals inline.

#### New Plan Flow
1. **Set Goal** — pick a preset goal or enter a custom one (see §1.4). For race presets, optionally set a goal time and target date.
2. **Strength Training** — toggle whether to include strength/core workouts. If enabled, select available equipment (multi-select from §1.7 equipment options). Defaults to the user's saved equipment from their profile; can be changed per plan.
3. **Import History** — show summary of recent HealthKit data being used for context. If HealthKit is not authorized, this step shows an informational message explaining that the coach will build the plan without training history and offers a link to authorize HealthKit in Settings. The user can proceed without it.
4. **Review Coach Proposal** — the coach presents: duration, peak volume, weekly volume profile, and rationale. If strength is enabled, the proposal includes a note on how strength sessions will be distributed.
5. **Adjust Peak Volume** — user can override the coach's suggested peak volume.
6. **Confirm** — if no active plan exists, the plan moves directly to `.active` and the first week detail is generated. If an active plan already exists (see §6 rule 9), the plan is saved as `.draft` — the user is informed that it can be activated after the current plan is completed or abandoned.

#### Competitiveness Picker
- Three-option segmented control or card selector with name and short description (Conservative, Balanced, Aggressive).

#### Personality Picker
- Grid of preset cards (Cheerleader, No-Nonsense, Nerd, Zen) plus a "Create Custom" option.
- Preview: sample coach message in the selected personality.

#### Settings
- Profile: name, units (defaults to device Measurement System; override to metric or imperial), volume mode (time/distance), max heart rate, track access, strength equipment.
- Running Schedule: preferred running days, target days per week, preferred long run day, preferred quality days (ranked), and optional availability windows (see §1.8).
- Courses: add, edit, and delete measured courses (see §1.17). Each course has a name, distance with unit, surface type, and optional notes.
- Competitiveness and Personality: change at any time (applies to future interactions).
- Integrations: HealthKit status, WorkoutKit toggle, calendar picker.
- Race Results: manage race history used for VDOT calculation.
- Data Management:
  - **Export My Data** — creates a user-readable JSON package (see §2.19) for portability.
  - **Reset App** — deletes all local data (profile, plans, workouts, conversations, assessments, VDOT history, and pending AI jobs) and restarts onboarding. Requires confirmation with a destructive action prompt. This is a full reset — there is no selective deletion of individual plans or workouts outside of plan abandonment (§1.21).

**Reset App CloudKit semantics:**

- Reset queues deletion of all app-owned records in the user's CloudKit private database and writes a local "reset in progress" marker immediately.
- Local wipe happens immediately on the initiating device; other devices converge after CloudKit sync. Until convergence, another device may briefly show stale data.
- During this eventual-consistency window, stale records are treated as read-only snapshots and are removed on next successful sync; they must not recreate deleted state.
- If a secondary device is offline during reset, it clears stale data the next time it comes online and receives the CloudKit deletions.

---

## 5. AI Behavior Specification

### 5.0 Base System Prompt

Every AI call includes a base system prompt layered beneath the personality prompt. The base prompt encodes training principles that apply regardless of personality. The app does not enforce these as hard constraints — the coach uses its judgment to apply them contextually.

The base system prompt should instruct the coach to:

- **Limit quality sessions** to 2–3 per week (tempo, intervals, repetitions) with adequate recovery between them (typically 48–72 hours). Back-to-back quality days should be rare and intentional.
- **Cap the long run** at roughly 25–30% of the week's running volume. For time-based plans, long runs should generally not exceed ~2.5 hours regardless of volume percentage.
- **Cap hard effort within quality workouts** — e.g., interval volume at the lesser of ~8% of weekly volume or ~10K; tempo volume at ~10% of weekly volume or ~60 minutes. Warmup and cooldown are separate from these caps.
- **Increase volume conservatively** — weekly volume should generally not jump more than ~10% week-over-week, with a down week every 3–4 weeks.
- **Polarize the training week** — easy days should be genuinely easy. Avoid stacking moderate efforts on recovery days. Quality work and strength training belong on hard days; easy days are for recovery.
- **Respect the user's running schedule** — place workouts only on preferred running days and within availability windows when configured (see §1.8). If the schedule is too constrained for the goal, raise this in coach commentary rather than silently overriding it.
- **Honor day preferences for workout placement** — place the long run on the user's preferred long run day and quality sessions on their preferred quality days in rank order (first-choice day gets the week's key quality session). These are soft constraints: deviate when necessary (e.g., a race occupies the first-choice quality day, or the preferred long run day is removed by a weekly override) and explain the deviation in coach notes.
- **Use doubles judiciously** — schedule two runs in a day only when volume demands it and the runner's experience supports it (see §1.9). Only one of the two runs should be a hard effort; the other should be easy volume. Place the two runs in separate availability windows when the user has configured them.
- **Use grade-adjusted pace (GAP) for effort evaluation** — when elevation data is available, evaluate pace compliance using GAP rather than raw pace (see §1.15). A hilly run will always look slow on raw pace; GAP reveals the true effort. Reference both raw pace and GAP in feedback when they diverge meaningfully.
- **Account for effort modifiers** — when the user reports contextual factors (stroller, trail, illness, etc.), weight these in pace evaluation. A slow easy run with a stroller is not the same signal as a slow easy run with no explanation. If a modifier is recurrent, adjust baseline expectations accordingly.
- **Use heart rate as a secondary intensity check** — heart rate relative to pace validates whether the athlete is truly running easy or working harder than intended. Elevated HR on easy runs (especially trending upward over several sessions) is an early warning for fatigue or overtraining. Do not overreact to a single session — weather, caffeine, and sleep all affect HR.
- **React to RPE and HR trends** — a sustained pattern of high RPE or elevated heart rate on easy runs is a stronger signal than a single bad day. Use RPE/pace and HR/pace mismatches to inform adjustments before problems escalate.
- **Use courses when available** — when the user has defined courses (see §1.17), prefer them for distance-based intervals over time-based substitutions. A user with a 1-mile road course can do mile repeats without a track. Use the course's native distance unit in workout labels and segment descriptions. Courses complement track access — a user with both may receive a mix of track and course-based workouts for variety.
- **Adjust for heat and humidity** — when the weather outlook indicates high temperatures or humidity, ease pace expectations and note hydration/timing guidance in workout notes. Hot-weather runs should shift toward effort-based targets rather than strict pace compliance.
- **Handle skipped and missed workouts differently** — a proactive skip (§1.18) is a communication from the athlete; acknowledge it without judgment and adjust the week. A missed workout (no skip, no HealthKit match) warrants a gentle check-in. Never guilt-trip either case — focus on what comes next.
- **Manage interruptions with empathy** — when injury or illness mode is activated (§1.19), shift focus from progression to recovery. Be honest about goal-race implications but frame options constructively. Return-to-running ramp-ups should be conservative regardless of competitiveness level.
- **Support goal pivots smoothly** — when the user changes goals mid-plan (§1.20), evaluate the new goal against existing fitness honestly. Build on what's been done rather than starting over. Flag risks without being discouraging.

These principles are guidelines, not rigid rules. The competitiveness level shifts how aggressively or conservatively the coach applies these principles (Conservative stays well within limits; Aggressive pushes closer to them). The personality determines the tone and framing of the coach's communication.

### 5.0.1 Context Windowing

As plans grow, the full history of weeks, workouts, feedback, and check-ins can exceed AI context limits. The app pre-processes historical data into tiered summaries before sending it to the AI — the AI never receives raw workout records for older weeks.

**Three tiers:**

- **Full detail (most recent 2 weeks):** Complete workout data — segments, actual vs. planned, RPE, heart rate, GAP, effort modifiers, coach feedback, and any adjustments made.
- **Week summary (weeks 3–8 back):** Per-week aggregate — planned vs. actual volume, workout count and completion rate, average RPE, average heart rate on easy runs, notable coach adjustments, interruption tags, skip/miss count.
- **Plan summary (older than 8 weeks):** Aggregate across all older weeks — average weekly volume and trend, overall completion rate, RPE distribution, VDOT changes with dates, interruption periods, key milestones (peak week achieved, races completed).

**Which calls use which tiers:**

| AI Call | Context Strategy |
|---|---|
| §5.1 Plan Generation | Already bounded (8–12 weeks of HealthKit history) |
| §5.2 Weekly Detail | Full detail + week summaries + plan summary |
| §5.3 Workout Feedback | Already bounded (last 4–6 workouts) |
| §5.4 End-of-Plan Assessment | Week summaries for all weeks; full detail for the first week, peak week, race week(s), and final 2 weeks |
| §5.5 Skip Response | Already bounded (current week only) |
| §5.6 Injury/Illness | Already bounded (last 2–4 weeks) |
| §5.7 Goal Change | Week summaries for all completed weeks; plan-level aggregate stats |

### 5.0.2 Schema Evolution

The structured JSON contracts in §5.1–5.7 define expected AI output formats. These schemas are embedded in the prompts the app constructs — the AI does not maintain its own notion of schema version. The prompt and the parser ship together in the same app binary, so they always agree on the current format.

**Response parsing** is defensive: required fields are validated, unknown fields are ignored, and missing optional fields fall back to sensible defaults. This tolerates minor AI response variations without hard failures.

**Pending requests across app updates:** AI requests are persisted locally for retry (see §3.2). When the app launches after an update that changes a prompt schema, not-yet-sent requests are discarded and re-queued with current prompts — input data (plan context, user profile) is re-gathered fresh. In-flight requests (sent, awaiting response) are accepted if they parse successfully under the current parser; if parsing fails, the request is re-queued.

**No stored AI response JSON:** AI responses are parsed into SwiftData model objects (workouts, feedback, assessments) immediately on receipt. Raw response JSON is not persisted. Schema changes therefore require no data migration — only the prompt template and response parser are updated together. Changes to the underlying SwiftData entities are handled separately via SwiftData's standard migration support.

**App-local contract governance (no backend schema versioning required):**

- Each AI call type (§5.1–§5.7) has a single canonical app-side schema definition (typed DTO + validator). The prompt's expected JSON and the parser both derive from this canonical definition to avoid drift.
- Persisted pending AI requests include app-local metadata: `promptRevision` and `schemaRevision` strings set at enqueue time.
- On app launch after update, queued requests whose revision metadata does not match the current app revisions are discarded and re-queued with current prompts and freshly gathered inputs.
- In-flight responses are still parsed defensively under the current parser; parse failures trigger re-queue with current revisions.
- Add contract tests per call type with representative fixtures: valid, missing required fields, unknown fields, wrong enum values, and malformed nested objects. Unknown fields are ignored; required field failures reject and re-queue.

### 5.0.3 Deterministic Guardrails, Rejection, and Correction

AI proposes coaching outputs; the app remains the source of truth for all enforceable rules. The app never writes AI output directly to SwiftData without deterministic validation.

**Deterministic app responsibilities (must enforce):**

- Parse and schema-validate all AI payloads (required fields, enum values, numeric ranges, date formats, referential IDs).
- Enforce business constraints defined in this spec (especially §1.8, §1.9, §1.11, §1.17, and §6) before persistence.
- Apply canonical normalization (sorting, deduplication, unit/date representation, and stable IDs) so repeated retries produce equivalent model state.
- Gate all state transitions (`.draft` → `.active`, `.active` → `.completed`/`.abandoned`, workout status transitions) through app logic, not AI text.

**AI responsibilities (may propose, not enforce):**

- Plan strategy and coaching rationale (volume profile shape, emphasis choices, commentary tone).
- Weekly workout proposals and strength exercise selection within provided constraints.
- Feedback language, suggested adjustments, injury/illness recommendations, and goal-change rationale.

**Validation outcomes per AI response:**

1. **Accept** — payload is valid; apply atomically.
2. **Auto-correct** — payload violates only safe, mechanical constraints; app applies deterministic corrections, logs them, then persists.
3. **Reject** — payload is invalid in a way that cannot be safely corrected; app performs no plan-altering mutation.

**Allowed auto-corrections (deterministic and loss-minimizing):**

- Clamp bounded numeric fields (e.g., percentages to `[0.0, 1.0]`) and round to app precision.
- Normalize ordering (segment order, exercise order) and remove exact duplicates.
- Resolve minor date drift within the same training week by snapping to the nearest allowed day while preserving workout order.
- Recompute derived totals when unambiguous (e.g., sum of workout percentages vs. target week percentage) by proportional normalization.

If a correction would change training intent (for example: moving workouts across weeks, inventing missing workouts, dropping key sessions, assigning a course the user does not have, or requiring unavailable equipment), correction is **not** allowed; the payload is rejected.

**Mandatory rejection triggers (non-exhaustive):**

- Missing required objects or unrecognized enums after parse.
- Scheduled dates outside the target week for weekly detail.
- More than two running workouts on a single day (double conflict).
- Workouts placed only on unavailable days when no in-week valid placement exists.
- Segment/course references to unknown `courseId` values.
- Strength exercises requiring equipment outside `strengthEquipment`.
- Any proposal that violates a hard state constraint in §6 (for example, activating a second concurrent `.active` plan).

**Failure behavior when rejection occurs:**

- First failure: auto-retry once with a validator error summary injected into the retry prompt ("fix and return full JSON only").
- Second failure: surface user-visible retry UI and keep a safe no-op state. No partial plan mutation is applied.
- Persist rejection diagnostics locally (call type, validator codes, timestamp, request id) for debugging/telemetry.

**Safe no-op behavior by call type:**

- **Plan generation:** keep user inputs; do not create/update a proposal.
- **Weekly detail generation:** keep `TrainingWeek.generated = false`; preserve existing outline.
- **Workout feedback:** keep workout/check-in data; show "Coach feedback pending" and retry path.
- **End-of-plan assessment:** keep plan status; leave assessment pending.
- **Skip response:** keep workout marked `.skipped`; do not apply week adjustments.
- **Injury/illness and goal change:** record user intent/conversation context only; do not mutate plan structure.

This policy ensures AI is always advisory and never bypasses deterministic product constraints.

### 5.1 Plan Generation

**Input to AI:**
- User's goal (text).
- Training history summary (last 8–12 weeks of volume and key workouts from HealthKit).
- Current VDOT.
- Competitiveness level and personality system prompt.
- Volume mode (time or distance).
- Preferred running days, target days per week, preferred long run day, preferred quality days (ranked), and availability windows (see §1.8).
- Whether strength training is enabled, and available equipment list.

For race goals, `numberOfWeeks` is computed deterministically by the app from the plan start date and race date and passed as an input constraint — the AI does not propose it. The AI may comment on timeline adequacy in its `rationale` but cannot override the week count. For non-race goals, `numberOfWeeks` is proposed by the AI based on the goal and training context.

**Expected output (structured JSON):**
- `numberOfWeeks`: Int
- `peakWeekVolume`: Double
- `weeklyVolumeProfile`: { weekNumber: percentOfPeak }
- `weeklyEmphasis`: { weekNumber: emphasisLabel }
- `strengthApproach`: String? (if strength enabled: summary of how strength is periodized across the plan)
- `rationale`: String (explanation in coach's voice)

### 5.2 Weekly Detail Generation

**Input to AI:**
- Plan context (goal, volume mode, peak volume, week number, target %).
- Previous weeks' data, tiered per §5.0.1: full detail for the last 2 weeks, per-week summaries for weeks 3–8 back, and aggregate stats for older weeks.
- Current VDOT.
- Competitiveness level and personality system prompt.
- User's preferred running days, target days per week, preferred long run day, preferred quality days (ranked), and availability windows (see §1.8).
- Weekly availability override for this week, if set (see §1.8) — takes precedence over profile defaults. Includes the user's note if provided.
- User's calendar availability (if provided).
- User's track access preference.
- User's available courses (names, distances, units, surfaces — see §1.17).
- Races scheduled during this week (if any).
- Weather outlook for the week (temperature highs, humidity) from a weather API. Used by the coach to adjust paces and add heat/humidity guidance in workout notes.
- Whether strength is enabled, available equipment, and current training phase (for periodization).

**Expected output (structured JSON):**
- Array of running workouts, each with:
  - `type`, `volumePercent`, `scheduledDate`
  - `segments[]`: `{ label, paceZone, targetVolume, rest? }` (paceZone is a training zone like "T" or a race pace like "10K pace")
  - `notes`: String? (strides, drills, form cues, weather advisories)
- Array of strength workouts (if enabled), each with:
  - `title`, `scheduledDate`, `estimatedDuration`
  - `exercises[]`: `{ name, equipment?, sets, reps?, holdDuration?, rest?, notes? }`
- `coachNotes`: String

### 5.3 Workout Feedback

**Input to AI:**
- Planned workout (full detail).
- Actual workout data from HealthKit (splits, total distance/duration).
- Deterministic segment comparison output (planned vs actual by segment/rep, including inferred flags for missed/extra lap boundaries).
- Grade-adjusted pace (GAP) computed from elevation data (see §1.15). When available, the coach uses GAP rather than raw pace to evaluate effort compliance.
- Elevation summary (total ascent/descent in meters).
- Heart rate summary from HealthKit (average HR, max HR). Provided when available.
- User's max heart rate, resting heart rate, and derived HR zones for context.
- User's check-in data from WorkoutCheckIn (§2.12), if submitted: RPE, effort modifiers, and free-text notes.
- Recent trend data (last 4–6 workouts): RPE values and average heart rates for context.
- Current VDOT.
- Competitiveness level and personality system prompt.

**Expected output (structured JSON):**
- `commentary`: String (should reference heart rate, RPE, GAP, elevation, and effort modifiers when available — especially mismatches between raw pace and GAP/HR/RPE that indicate terrain or contextual factors)
- `adjustments[]`: descriptions of changes to future workouts (if any)
- `newVDOT`: Double? (if performance warrants recalculation)

### 5.4 End-of-Plan Assessment

**Input to AI:**
- All weeks as per-week summaries (see §5.0.1), with full detail for the first week, peak week, race week(s), and the final 2 completed weeks.
- VDOT history over the plan.
- Peak volume history (if peak was adjusted mid-plan due to injury/illness or goal change).
- Goal history (if the goal changed mid-plan).
- Training weeks tagged with interruption types (§1.19), so the assessment can account for disrupted weeks.
- Competitiveness level and personality system prompt.

**Expected output (structured JSON):**
- `summary`, `volumeAdherence`, `paceAdherence`
- `vdotStart`, `vdotEnd`
- `highlights[]`, `areasForImprovement[]`
- `nextPlanSuggestion`: String
- `discussionPrompts[]`: questions to ask the user about next steps

### 5.5 Skip Workout Response

**Input to AI:**
- The skipped workout (full detail: type, volume, pace zone, position in the week).
- Skip reason provided by the user.
- Remaining workouts for the week (planned and completed so far).
- Plan context (week number, emphasis, volume target for the week).
- Competitiveness level and personality system prompt.

**Expected output (structured JSON):**
- `commentary`: String (acknowledgment of the skip in coach's voice, no guilt-tripping)
- `weekAdjustments[]`: descriptions of changes to the remaining week — e.g., volume redistribution, workout swap, or no change needed
- `updatedWorkouts[]`: modified workout objects for any rescheduled or adjusted sessions

### 5.6 Injury & Illness Management

**Input to AI:**
- User's report: type (injury, illness, or general pause), severity description, and any follow-up answers from the coach conversation.
- Current plan context (week number, phase, upcoming races, goal).
- Recent training load (last 2–4 weeks of volume and intensity).
- Competitiveness level and personality system prompt.

**Expected output (structured JSON):**
- `assessment`: String (coach's understanding of the situation)
- `recommendation`: `.reduceLoad` | `.pause` | `.modifyGoal` (severity-based recommendation)
- `revisedPeakWeekVolume`: Double? (if the interruption warrants lowering the peak; recorded in peak volume history)
- `modifiedWeeks[]`: revised volume profile and emphasis for affected weeks (if reducing load)
- `returnPlan`: { `rampWeeks`: Int, `startingVolumePercent`: Double } (if pausing — how to ramp back up)
- `goalRiskFlag`: String? (if the interruption threatens the goal race, an honest assessment and options)
- `commentary`: String (empathetic guidance in coach's voice)

### 5.7 Goal Change Evaluation

**Input to AI:**
- Completed weeks as per-week summaries with plan-level aggregate stats (see §5.0.1).
- Current goal and proposed new goal.
- Current VDOT and training history.
- Time remaining (from now to proposed new target date, if applicable).
- Competitiveness level and personality system prompt.

**Expected output (structured JSON):**
- `feasibility`: String (honest assessment of the new goal given training completed and time remaining)
- `revisedNumberOfWeeks`: Int
- `revisedPeakWeekVolume`: Double
- `revisedWeeklyVolumeProfile`: { weekNumber: percentOfPeak } (future weeks only; completed weeks preserved)
- `revisedWeeklyEmphasis`: { weekNumber: emphasisLabel }
- `rationale`: String (explanation of what changes and why, in coach's voice)

---

## 6. Key Business Rules

1. **Volume is always relative.** Weekly volume is a percentage of peak week volume. Individual workout volume is also a percentage of peak week volume (not of the week's volume). For example: peak = 100 min, week = 80% (80 min total), a workout at 8% = 8 min. The sum of a week's workout percentages equals the week's volume percentage. Percent values remain the canonical planning representation; absolute values are derived deterministically per §1.3.1 for display and downstream integrations.

2. **Peak volume is user-editable only in draft.** The user may adjust peak week volume while the plan is in `.draft` status. Once activated, only the coach can adjust it — in response to injury/illness (§1.19) or goal changes (§1.20). All mid-plan adjustments are recorded in the plan's peak volume history (§2.5) so the evolution of the volume target is transparent.

3. **VDOT recalculation is race-driven and transparent.** Race results are the primary trigger for VDOT changes. Workout-based adjustments are rare, occurring only when there is a consistent trend of missing pace targets. When VDOT changes, the coach explains why and shows old → new.

4. **Weekly plans are generated lazily.** Only the current (and optionally next) week's detailed workouts are generated. This allows maximum responsiveness to recent data.

5. **Unplanned workouts count.** HealthKit workouts that don't match a planned workout are still tracked and affect fatigue/volume calculations.

6. **The coach adapts, not just reports.** Feedback must include concrete adjustments when warranted — not just commentary.

7. **Extra races replace hard efforts and can be removed.** When a user adds a race to a plan, it replaces a hard effort workout (tempo, intervals, etc.) for that week. The race result is used for VDOT recalculation. Tapers are reserved for the plan's goal race only. Upcoming non-primary races can be removed; completed races cannot. Removing a race from a generated week triggers the coach to restore a quality session in its place.

8. **Plans can be abandoned.** A user can stop a plan at any time. The coach provides a partial assessment and offers to create a new plan.

9. **One active plan at a time.** Only one plan may be in `.active` status. A user can generate a new plan (`.draft`) while an active plan exists, but cannot activate it until the current plan is completed or abandoned.

10. **Track workouts can be converted to time-based or course-based on demand.** When a workout is tagged `.track`, the user can request a time-based alternative or a course-based alternative (if they have a suitable course defined). The coach converts distance intervals to time equivalents using the user's current VDOT paces for the relevant zone (e.g., 4×800m → 4×3min), or maps them to a user's course (e.g., 4×800m → 4×1km on Park Path). Users without track access see workouts generated as course-based (when a suitable course exists) or time-based by default.

11. **Strength training is optional and equipment-aware.** Strength workouts are only generated when the user opts in during plan creation. Exercises are constrained to the user's selected equipment. Strength sessions are scheduled on hard running days or rest days to keep easy days easy. Strength volume does not count toward running volume metrics. The coach periodizes strength intensity alongside the running plan (heavier in base phases, lighter near races, minimal during taper).

12. **Skipped workouts are handled gracefully.** When a user proactively skips a workout (see §1.18), the coach adjusts the remaining week rather than ignoring the gap. Skipped workouts are tracked separately from missed workouts — a skip is an intentional decision, a miss is an unexplained absence. The coach never guilt-trips a skip; it acknowledges the reason and adapts.

13. **Injury and illness interrupt, not destroy, a plan.** When the user activates injury/illness mode (see §1.19), the plan adapts rather than requiring abandonment. Training weeks during an interruption are tagged so adherence metrics reflect the disruption. The coach manages return-to-running ramp-ups and proactively flags goal-race risk when time off is significant.

14. **Goals can change mid-plan.** A user can change the goal on an active plan (see §1.20) without losing completed training history. The coach restructures future weeks around the new goal while preserving completed weeks. The previous goal is retained in the plan's goal history for context.

15. **Training weeks use a fixed Monday boundary in the plan's canonical timezone.** Week windows are Monday 00:00 to Sunday 23:59:59 in `TrainingPlan.canonicalTimeZoneId` (see §1.10). Plan start dates are normalized to the week-1 Monday in that timezone so week numbering and volume accounting remain deterministic even after timezone travel.

16. **Workout/race day matching uses deterministic cutoffs.** "Same day" and ±1-day matching are evaluated in `TrainingPlan.canonicalTimeZoneId` with a 00:00–03:59 late-night grace into the previous planned day (see §1.13). Anything beyond ±1 calendar day is never auto-matched.

17. **Percent-to-absolute conversion is deterministic in both volume modes.** Time-mode plans resolve from percent-of-peak into seconds via `peakWeekVolumeMinutes * 60 * percent`; distance-mode plans resolve into meters via `peakWeekVolumeMeters * percent` (see §1.3.1). Calculations use canonical units before any display rounding.

18. **Rounding is context-specific.** Calculations use full precision; persisted absolute durations/distances round to whole seconds/meters; UI formatting applies human-friendly display precision (minute or min:sec for time, bounded decimal precision for distance, whole-second pace formatting) per §1.3.1.

19. **Native units override global preference.** Track workouts always display meters, and course-based segments always display course-native units. `UserProfile.unitPreference` applies only where no higher-precedence native unit exists. Changing unit preference never rewrites historical data (see §1.3.1 and §1.17).

20. **Workout matching uses deterministic confidence thresholds and segment-level checks.** Matching candidates are scored using weighted date/volume/type/intensity/segment signals (see §1.13). Auto-match is allowed only for high-confidence, unambiguous candidates with acceptable segment alignment; medium confidence or structural mismatches require explicit user confirmation.

21. **Ambiguity always favors user confirmation over silent guesses.** If candidate scores are too close, multiple same-day candidates exist, or race/non-race conflicts remain, the app must require user confirmation and must not auto-assign the workout (see §1.13).

22. **HealthKit-based VDOT estimates require minimum data quality.** A workout is eligible only when duration/distance floors, HR completeness, and dominant-zone thresholds are met. Route/elevation data is preferred; when missing, estimates can still proceed with reduced confidence weight (see §1.12).

23. **HealthKit-based VDOT estimation is robust and recency-weighted.** The estimate uses a bounded rolling window, MAD outlier filtering, minimum sample count, and recency-weighted averaging before persistence. If sufficient quality samples are unavailable, the app must not auto-estimate VDOT (see §1.12).

24. **Segment matching tolerates normal lap noise without hiding true mismatches.** One extra non-key segment or one missed/merged rep can still qualify as a match, but major segment-structure divergence must prevent silent auto-matching and require user confirmation (see §1.13).

25. **Users can inspect segment adherence directly.** For completed structured workouts, the Workout Detail UI must show side-by-side planned vs actual segment/rep values (including inferred flags when lap boundaries were reconstructed) so matching outcomes are transparent. This applies to both distance-based reps (time/distance outcomes) and time-based reps (planned pace vs actual pace, with actual distance shown for context) (see §1.13 and §4.2).

26. **Retention is explicit and reset-driven.** Core user data (including chat, assessments, and VDOT history) is retained until user deletion via Reset App; operational diagnostics are short-lived and pruned on schedule (see §2.19).

27. **Reset App is a full delete with eventual multi-device convergence.** Reset immediately clears local data on the initiating device and propagates CloudKit deletions to other devices asynchronously; stale remote snapshots must never resurrect deleted records (see Settings in §4.2).

28. **Portability is supported via on-device export.** Users can export their app-owned data as JSON from Settings. Export excludes internal diagnostics and infrastructure metadata (see §2.19).

29. **Health telemetry is strictly bounded.** Operational telemetry may include reliability and coarse usage metadata, but must exclude raw health samples, detailed workout payloads, chat content, and full AI prompt/response bodies (see §3.10).

---

## 7. Technical Requirements

| Requirement | Detail |
|---|---|
| **Platform** | iOS 26+, Apple Watch integration via WorkoutKit |
| **UI Framework** | SwiftUI with Liquid Glass materials |
| **Persistence** | SwiftData with CloudKit sync |
| **Health Data** | HealthKit (read: workouts, heart rate, route) |
| **Watch Scheduling** | WorkoutKit (schedule structured workouts) |
| **Calendar** | EventKit (iCloud calendar read/write) |
| **Weather** | WeatherKit (weekly forecast: temperature, humidity) + Core Location |
| **AI Backend** | TBD — API service for coach engine |
| **VDOT Service** | Local library (abstracted interface) — race→VDOT, pace→VDOT, VDOT→paces, VDOT→race predictions |
| **Units** | Support km and mi; defaults to the device's Measurement System (`Locale.measurementSystem`), overridable per user in Settings. Distance-mode planning uses canonical meter storage for deterministic calculations; track workouts always display meters; course segments preserve course-native units. |
| **Offline** | Core plan viewing and workout logging work offline; AI features require connectivity |

---

## 8. Trademarks

VDOT® is a registered trademark of The Run SMART Project, LLC. SlopMiles is not affiliated with, endorsed by, or sponsored by The Run SMART Project, LLC, Dr. Jack Daniels, or any associated entities. All references to VDOT in this document are for descriptive purposes only.
