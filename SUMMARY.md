# SlopMiles — What It Is and How It Works

SlopMiles is an AI running coach for iPhone. You set a goal, pick a coaching style, and the app builds a personalized training plan that adapts as you train. It pulls your workout data from Apple Health, watches how you're doing, and adjusts your plan in real time — the way a good human coach would, but available whenever you need it.

---

## Getting Started

When you first open the app, a short setup walks you through:

1. **Connect Apple Health** — the app reads your running history, heart rate, routes, and elevation data. This gives the coach context on where your fitness is right now. You can skip this, but the coach will have less to work with.
2. **Set your preferences** — name, units (miles or km), and whether you want your plan structured around time or distance.
3. **Running schedule** — which days you run, how many days per week, your preferred long run day, and which days you like for hard workouts (ranked by priority). You can also set time windows for when you're available to run on each day.
4. **Track access** — whether you regularly have access to a running track. This determines whether you get precise distance-based intervals (800m repeats, etc.) or time-based equivalents.
5. **Establish your fitness level (VDOT)** — the app uses a standard VDOT system to set your training paces. The best way is entering a recent race result. If you don't have one, the app can estimate from your Apple Health data. If neither is available, the coach starts conservatively and dials in your paces after a few workouts.
6. **Choose your coaching style:**
   - **Competitiveness** — how hard the coach pushes. Conservative (health-first, cautious progression), Balanced (standard training guidelines), or Aggressive (pushes toward your limits, less conservative recovery).
   - **Personality** — the coach's voice and tone. Cheerleader (high energy, celebratory), No-Nonsense (direct, brief), Nerd (data-heavy, loves explaining the science), Zen (calm, process-focused), or write your own custom personality.

---

## Training Plans

### Creating a Plan

Pick a goal:

- **Race goals** — 5K, 10K, Half Marathon, Marathon, or any custom distance (15K, 50 miles, whatever). Optionally set a goal time; if you don't, the coach sets a target based on your fitness. Race goals require a target race date.
- **Non-race goals** — Base Building (grow your aerobic fitness and weekly volume) or Recovery (low-volume block after a race or hard cycle).
- **Custom goals** — anything goes ("Run every day for 30 days," "First ultramarathon").

You can also choose to include **strength and core work** in your plan. If you do, you tell the app what equipment you have (bodyweight only, dumbbells, kettlebells, bands, full gym — or any combination). The coach tailors exercises to what's available.

The coach then proposes a plan: how many weeks, what peak weekly volume to build toward, and how the volume ramps up and down week by week. You can adjust the peak volume if the coach's suggestion feels too high or too low. Once you're happy, activate the plan.

### How Plans Are Structured

- Your plan is built around a **peak week volume** — the highest volume week in the plan.
- Every other week is expressed as a **percentage of that peak**. Early weeks might be 60–70%, building toward 100% at peak, then tapering back down before a race.
- Each week has a training emphasis — aerobic base, speed development, race-specific prep, recovery, etc.
- Detailed workouts are generated **one week at a time**, so the coach can factor in how your recent training has gone before deciding what comes next.

### Workout Types

| Type | What It Is |
|---|---|
| **Easy Run** | Comfortable, conversational pace |
| **Long Run** | Your longest run of the week — builds endurance |
| **Tempo** | Sustained effort at lactate threshold pace |
| **Intervals** | Hard repeats at VO2max effort with recovery jogs |
| **Repetitions** | Short, fast reps focusing on speed and form |
| **Recovery** | Very easy, short run for active recovery |

Each workout has a structured breakdown — warmup, main set, cooldown — with specific pace zones for each segment. Paces are based on your VDOT and update automatically when your fitness changes.

**Track workouts** use precise distances (400m, 800m, 1600m — always in meters). If you can't get to the track on a given day, you can convert to a time-based equivalent. If you don't have track access at all, the coach gives you time-based or course-based workouts by default.

**Courses** — you can define your own measured routes (a 1-mile neighborhood loop, a 1K park path) and the coach will use them for interval workouts as an alternative to a track.

**Strength workouts** (if included) are 15–30 minute sessions focused on runner-relevant movements — hip stability, single-leg strength, core, posterior chain. They're scheduled on hard running days to keep your easy days truly easy. Strength intensity is periodized alongside your running: heavier during base building, lighter near races, minimal during taper.

### Doubles

If your weekly volume is high enough that single daily runs would be excessively long, the coach may schedule two runs on some days. Only one will be a hard effort — the other is a short, easy volume run. If you'd rather not do doubles, tell the coach and it'll accommodate (though single runs will be longer).

---

## During Your Training

### Automatic Workout Tracking

When you finish a run (recorded on your Apple Watch or iPhone), the app automatically detects it and matches it to the planned workout. If it's a clear match, it's done automatically. If the app isn't sure, it asks you to confirm.

Unplanned runs (a spontaneous jog with a friend, an extra shakeout) are tracked too — the coach factors them into your fatigue and volume totals.

### Post-Run Check-In

After each run, the app prompts you with a quick check-in:

- **RPE (1–10)** — how hard did it feel? This is optional but valuable. The coach uses the gap between how hard it *should* have felt and how hard it *actually* felt as a key signal.
- **Effort modifiers** — quick-tap tags for things that affected the run: pushed a stroller, ran with a dog, trail/off-road, treadmill, high altitude, poor sleep, feeling unwell, or your own custom note.
- **Notes** — anything else you want the coach to know.

### Coach Feedback

After your check-in (or after a delay if you skip it), the coach gives you feedback on the workout:

- How it compared to the plan — pace compliance, volume, heart rate context.
- **Grade-Adjusted Pace (GAP)** — on hilly runs, the coach uses elevation data to calculate what your pace would have been on flat ground. A "slow" hilly run might actually be right on target when you account for the climbing.
- **Heart rate analysis** — the coach checks whether your heart rate matched the intended effort. An easy run where your heart rate was unusually high might signal fatigue, even if your pace looked fine.
- Concrete adjustments to upcoming workouts if something is off — not just commentary.

The coach looks for **trends**, not single data points. One bad run doesn't change your plan. A string of runs where easy efforts feel hard (or hard efforts feel easy) triggers real adjustments.

### Pace Zones

All paces come from the VDOT system:

| Zone | What It Targets |
|---|---|
| **Easy (E)** | Aerobic development, recovery |
| **Marathon (M)** | Marathon race pace |
| **Tempo (T)** | Lactate threshold |
| **Interval (I)** | VO2max |
| **Repeat (R)** | Speed and economy |

The coach may also prescribe race-specific paces (5K pace, 10K pace, Half Marathon pace) for race-sharpening workouts. Your paces update automatically when your VDOT changes — primarily from race results, occasionally from a consistent trend in training data.

---

## Flexibility and Life Happens

### Skipping a Workout

If you know you can't do a workout, tap "Skip" and optionally tell the coach why (schedule conflict, fatigue, soreness, weather, or your own reason). The coach adjusts the rest of the week — redistributing volume, swapping workouts around, or just absorbing the gap. No guilt trips.

If a workout just goes unrecorded (you didn't skip it, didn't do it, no explanation), the coach sends a gentle check-in rather than assuming the worst.

### Rescheduling

You can move a workout to a different day within the same week. The app warns you if the move would stack hard efforts on consecutive days but lets you do it. You can also **bump** a workout forward, which cascades the rest of the week's workouts by one day until a rest day absorbs the shift.

### Weekly Schedule Changes

Traveling? Busy week at work? You can override your availability for any specific week — remove days, adjust time windows, add a note ("Conference Wed–Fri"). The coach sees the constraint and adjusts the week accordingly.

### Injury and Illness

Hit the "I need to pause" button on the dashboard. The coach walks you through a conversation to understand what's going on, then adapts:

- **Minor issue** — reduced volume and intensity for 1–2 weeks, no quality sessions, monitoring until you're ready to ramp back up.
- **Significant time off** — the plan pauses. When you're ready to return, the coach builds a gradual ramp-up before resuming the plan's structure.
- **Goal race at risk** — the coach is honest about what the lost time means and gives you options: adjust the goal time, switch to a shorter distance, or move the race date.

### Changing Your Goal

Training for a marathon but realize you'd rather target a half? Sign up for a 10K mid-base-build? You can change your goal without starting over. The coach evaluates where you are, restructures the remaining weeks around the new goal, and carries forward everything you've already built. If the new goal is a stretch given the time and fitness available, the coach tells you straight.

### Adding Races

You can add tune-up races to your plan at any time. The race replaces a hard workout for that week, and the result becomes a data point for updating your fitness level. Tapers are only for your goal race — tune-up races slot into training as-is. You can remove upcoming races if plans change, but completed races stay in your history.

---

## What the App Tracks

### Your Dashboard

- Next scheduled workout with full details
- Weekly progress (completed vs. planned volume)
- Latest coach message
- Current VDOT with trend and predicted race times

### Plan View

- Week-by-week overview showing volume progression and training emphasis
- Tap any week to see its workouts
- Visual indicators for weeks affected by injury/illness

### History

- All past workouts with feedback, planned vs. actual comparisons, and segment-by-segment breakdowns for structured sessions
- VDOT trend over time

### Coach Chat

- A conversational interface where the coach posts feedback, weekly summaries, and milestone notes
- You can ask questions, request changes, or just talk about your training
- Injury/illness conversations and goal changes happen here too

---

## End-of-Plan Assessment

When your plan wraps up, the coach generates a full assessment:

- Planned vs. actual volume and pace trends
- Key milestones and breakthroughs
- Areas for improvement
- How your fitness (VDOT) changed over the plan
- A discussion about what's next and a proposed follow-up plan

---

## Apple Watch Integration

Upcoming workouts (next 7 days) sync to your Apple Watch automatically, including the full workout structure — segments, pace targets, everything — so the Watch can guide you during the run. You can also manually push any workout to the Watch on demand.

---

## Other Details

- **Calendar sync** — optionally push workouts to an iCloud calendar so your training shows up alongside the rest of your schedule.
- **Weather awareness** — the coach pulls a weekly weather forecast for your location and adjusts pace expectations and guidance for heat, humidity, or cold.
- **Offline** — you can view your plan and log workouts offline. AI features (coach feedback, plan generation) need a connection.
- **Data export** — export all your data as JSON from Settings.
- **Privacy** — your health data stays in Apple Health and your private iCloud account. The app reads what it needs for coaching and doesn't share raw health data externally.
- **Units** — defaults to your phone's setting (metric or imperial). Track workouts always display in meters. Course distances always display in whatever unit you defined them in.
