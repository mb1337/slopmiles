# SlopMiles — UI & Style Guide

This document defines the visual design language, component patterns, and UX conventions for SlopMiles. The app targets **iOS 26+** and adopts Apple's **Liquid Glass** design system throughout.

---

## 1. Compatibility & Fallback Policy

SlopMiles has a single deployment target of **iOS 26+** (see `SPEC.md` §6 Platform). There is no downlevel runtime support below iOS 26.

Fallback guidance in this section exists to keep behavior stable when APIs vary by SDK surface or when code is shared across modules/platforms.

### 1.1 Policy

- The app **MUST** compile cleanly against the active iOS SDK used by the project.
- The app **MUST** preserve core workflows even if visual enhancements are unavailable.
- When a preferred API is unavailable, teams **MUST** use the documented fallback instead of inventing ad-hoc alternatives.
- A visual polish feature **MAY** become a no-op only when marked "No-op acceptable: Yes" in the matrix.

### 1.2 API Compatibility Matrix

| Area | Preferred API | Fallback | No-op acceptable | Deployment target |
|---|---|---|---|---|
| Tab minimization | `.tabBarMinimizeBehavior(.onScrollDown)` | Standard `TabView` behavior without minimization | Yes | iOS 26 |
| Tab accessory slot | `.tabViewBottomAccessory` | `ToolbarItem(placement: .bottomBar)` or inline contextual CTA in content | No | iOS 26 |
| Glass surfaces | `.glassEffect(...)` | `.background(.ultraThinMaterial)` + standard shape and stroke | No | iOS 26 |
| Glass button styles | `.buttonStyle(.glass)` / `.glassProminent` | `.buttonStyle(.bordered)` / `.borderedProminent` + semantic tint | No | iOS 26 |
| Nav subtitle | `.navigationSubtitle()` | Subtitle text in `.toolbar` principal item or top content header | No | iOS 26 |
| Scroll edge softening | `.scrollEdgeEffectStyle(...)` | Gradient fade overlay at scroll edge | Yes | iOS 26 |
| Morph transitions | `.matchedTransitionSource(...)` + `.navigationTransition(.zoom())` | `.sheet`/push with `.transition(.opacity)` | Yes | iOS 26 |
| Spring duration convenience | `.spring(duration: ...)` | `.spring(response:dampingFraction:blendDuration:)` | No | iOS 26 (SDK-dependent signature) |

### 1.3 Reliability Rules

- Availability checks are **REQUIRED** only when introducing APIs newer than the active deployment target or when sharing code across targets with different minimum OS values.
- Fallback components **MUST** keep interaction order and information architecture identical.
- Fallback visuals **SHOULD** preserve hierarchy and contrast even if motion/material richness is reduced.

---

## 2. Design Principles

### 2.1 Liquid Glass Foundation

Liquid Glass is Apple's design language introduced in iOS 26. It uses translucent materials that reflect and refract surrounding content, creating depth through layered transparency rather than opaque surfaces.

Three pillars govern its application:

| Pillar | Meaning |
|---|---|
| **Hierarchy** | Controls and navigation float above content via glass materials. Importance is communicated through depth and visual weight, not just size or color. |
| **Harmony** | UI shapes align with the device's rounded geometry. Corner radii, capsule shapes, and concentric curves echo the hardware. |
| **Consistency** | Standard platform conventions are followed so the app feels native across all Apple platforms. |

### 2.2 The Core Rule

**Liquid Glass is for navigation, not content.** Glass effects **MUST** be applied only to:
- Tab bars (automatic)
- Navigation bars and toolbars (automatic)
- Floating action buttons
- Sheets and overlays
- Custom control surfaces that sit above content

Glass effects **MUST NOT** be applied to content areas. Workout cards, data lists, charts, and text blocks remain solid and readable beneath glass layers.

---

## 3. Navigation

### 3.1 Tab Bar

The app uses a five-tab structure (Dashboard, Plan, History, Coach, Settings). iOS 26 renders this as a **floating tab bar** with Liquid Glass automatically applied.

```swift
TabView {
    Tab("Dashboard", systemImage: "house.fill") { DashboardView() }
    Tab("Plan", systemImage: "calendar") { PlanView() }
    Tab("History", systemImage: "clock.fill") { HistoryView() }
    Tab("Coach", systemImage: "bubble.left.and.text.bubble.right.fill") { CoachView() }
    Tab("Settings", systemImage: "gearshape.fill") { SettingsView() }
}
.tabBarMinimizeBehavior(.onScrollDown)
```

- **Minimize on scroll** — tab bar collapses to a single pill on scroll down and re-expands on scroll up.
- **Fallback** — when minimize behavior is unavailable, keep normal `TabView` behavior.
- **Tab accessory** — reserve `.tabViewBottomAccessory` for contextual actions (for example, a "Rate Effort" button on Dashboard when a recently completed workout needs RPE input).

```swift
.tabViewBottomAccessory {
    Button("Rate Effort") { /* ... */ }
        .glassEffect(.regular.interactive())
}
```

- **Fallback** — if `.tabViewBottomAccessory` is unavailable, place the same action in `.toolbar` with `.bottomBar` placement.

### 3.2 Navigation Bars & Toolbars

Toolbars receive Liquid Glass automatically. Teams **MUST** follow these conventions:

- Prefer **SF Symbols over text labels** in toolbar items.
- Use `ToolbarSpacer(.fixed)` to visually group related actions.
- Use `.navigationSubtitle()` for contextual detail (for example, week number, plan status).
- Use `.badge()` on toolbar items for unread coach messages or pending feedback.
- Toolbar confirmation actions (for example, "Save Plan") use `.buttonStyle(.glassProminent)` automatically via `.confirmationAction` placement.

### 3.3 Sheets

Sheets float above content with Liquid Glass applied by the system.

- Teams **MUST NOT** set `.presentationBackground()` for standard sheets.
- Use `.presentationDetents([.medium, .large])` for partial-height sheets (workout detail, RPE input, effort modifiers).
- Use morphing transitions from toolbar buttons via `.matchedTransitionSource()` and `.navigationTransition(.zoom())` for contextual detail views.
- **Fallback** — if morph transitions are unavailable, use standard push/sheet transitions with hierarchy-preserving animation.

### 3.4 Scroll Edge Effects

Apply scroll edge effects to soften content edges beneath floating glass elements:

```swift
.scrollEdgeEffectStyle(.soft, for: .bottom)
```

- Use `.soft` for immersive scrolling views (History, Plan week list, Coach chat).
- Use `.hard` when discrete sections need visual separation (Settings groups).
- **Fallback** — where unsupported, use a subtle gradient mask/overlay near bottom edge.

---

## 4. Typography

### 4.1 Text Styles

Teams **MUST** use built-in text styles to ensure Dynamic Type support. Teams **MUST NOT** hardcode production font sizes.

Point sizes below are **reference values only** and **MUST NOT** be encoded as fixed sizes.

| Usage | Text Style | SwiftUI | Reference |
|---|---|---|---|
| Screen titles | Large Title | `.font(.largeTitle)` | ~34pt |
| Section headers | Title 2 | `.font(.title2)` | ~22pt |
| Card titles (workout type, plan name) | Title 3 | `.font(.title3)` | ~20pt |
| Primary labels | Headline | `.font(.headline)` | ~17pt semibold |
| Body text, coach messages | Body | `.font(.body)` | ~17pt |
| Secondary info (dates, metadata) | Subheadline | `.font(.subheadline)` | ~15pt |
| Tertiary info (units, annotations) | Footnote | `.font(.footnote)` | ~13pt |
| Chart labels, timestamps | Caption | `.font(.caption)` | ~12pt |

### 4.2 Weight Conventions

- **Bold** — screen titles, primary metrics (pace, distance, VDOT value).
- **Semibold** — section headers, workout type labels, card titles.
- **Regular** — body text, coach commentary, descriptions.
- **Light / Ultralight** — **MUST NOT** be used due to legibility risk on small screens.

### 4.3 Monospaced Digits

Teams **MUST** apply `.monospacedDigit()` to numeric values that update or align vertically (pace displays, timers, volume numbers, VDOT).

```swift
Text("5:32 /km")
    .font(.title2)
    .monospacedDigit()
```

---

## 5. Color System

### 5.1 Semantic Colors

Use system semantic colors so the app adapts to Light Mode, Dark Mode, and Increase Contrast automatically.

| Purpose | Color |
|---|---|
| Primary text | `.primary` (`.label`) |
| Secondary text | `.secondary` (`.secondaryLabel`) |
| Backgrounds | `.systemBackground`, `.secondarySystemBackground` |
| Grouped backgrounds | `.systemGroupedBackground` |
| Separators | `.separator` |

### 5.2 App Accent Colors

Define a minimal palette of custom colors in the asset catalog with Light and Dark variants.

| Token | Usage | Light | Dark |
|---|---|---|---|
| `accentColor` | Primary tint, active tab, key actions | `#2D6AE0` | `#5B8DEF` |
| `easyZone` | Easy pace zone (E) | `#2E8B57` | `#5BC47A` |
| `marathonZone` | Marathon pace zone (M) | `#C49000` | `#E8B84A` |
| `tempoZone` | Tempo pace zone (T) | `#D4691A` | `#F09040` |
| `intervalZone` | Interval pace zone (I) | `#CC3D22` | `#EF6B52` |
| `repeatZone` | Repeat pace zone (R) | `#B51E5A` | `#E84E8A` |
| `racePace` | All race-specific paces (5K, 10K, HM, custom) | `#6B5B95` | `#9B8EC4` |
| `success` | Completed workouts, positive trends | System Green | System Green |
| `warning` | Caution states, high RPE | System Yellow | System Yellow |
| `destructive` | Abandon plan, delete actions | System Red | System Red |

The pace zone palette progresses from cool to hot (`easyZone` -> `repeatZone`), forming an intuitive intensity ramp.

### 5.3 Foreground Pairing Rules

Teams **MUST** use approved foreground pairing for token-backed surfaces.

| Surface token | Default foreground | Allowed alternate |
|---|---|---|
| `accentColor` | White text/icons | `.primary` only if contrast tested >= 4.5:1 |
| `easyZone` | White text/icons | `.primary` if badge is light-tinted and tested |
| `marathonZone` | `.primary` text/icons | White only if contrast tested >= 4.5:1 |
| `tempoZone` | White text/icons | `.primary` if light tint and tested |
| `intervalZone` | White text/icons | None |
| `repeatZone` | White text/icons | None |
| `racePace` | White text/icons | `.primary` if light tint and tested |
| `success` | System default semantic foreground | White on solid success fills only |
| `warning` | `.primary` text/icons | None |
| `destructive` | White text/icons | None |

### 5.4 Contrast Requirements

- Text contrast **MUST** meet **4.5:1** minimum against background.
- Large text contrast **MUST** meet **3:1** minimum (18pt+ regular or 14pt+ bold).
- Teams **MUST** test with **Increase Contrast** in Light and Dark modes.
- Liquid Glass surfaces adapt dynamically, but custom overlays on variable backgrounds **MUST** be tested explicitly.

### 5.5 Pace Zone Color Application

Pace zone colors appear in:
- Workout segment timeline bars.
- Pace zone badges on workout cards.
- Chart series in pace/HR trend charts.
- Glass-tinted buttons when filtering by zone.

**Race pace segments** (5K pace, 10K pace, Half Marathon pace, or any custom race distance — see SPEC §1.12) all use the single `racePace` color. The distance label on the badge or segment distinguishes them (for example, "10K", "HM").

```swift
// Training zone
Button("Tempo") { }
    .glassEffect(.regular.tint(Color.tempoZone).interactive())

// Race pace — same color regardless of distance, label differentiates
Button("10K Pace") { }
    .glassEffect(.regular.tint(Color.racePace).interactive())
```

### 5.6 Color-Blind Safety

- Teams **MUST NOT** use red and green as the sole differentiator.
- State indicators **MUST** pair color with iconography and/or textual labels.

---

## 6. Components

### 6.1 Workout Cards

Workout cards are the primary content unit in Dashboard, Week Detail, and History.

| Element | Style |
|---|---|
| Card surface | `.secondarySystemBackground` with standard corner radius |
| Workout type | `.font(.headline)` + workout type SF Symbol |
| Volume | `.font(.title3).monospacedDigit()` — for example, "45 min" or "8.5 km" |
| Pace zone badges | Capsule-shaped, zone-colored background, `.font(.caption)` text |
| Date | `.font(.subheadline).foregroundStyle(.secondary)` |
| Status indicator | SF Symbol — checkmark (completed), clock (planned), xmark (skipped) |

Completed workout cards show actual vs. planned pace, distance, duration, and RPE badge when provided.

### 6.2 Progress Ring

The week progress ring on Dashboard shows completed vs. planned volume. Use a custom circular progress view, not `HKActivityRingView`.

- Single ring, colored with app accent.
- Center label shows percentage or absolute volume completed.
- Fill animation on appearance uses spring motion; when Reduce Motion is enabled, use opacity-only change.

### 6.3 VDOT Badge

A compact display showing current VDOT with trend indicator.

- Rounded rectangle or capsule shape.
- VDOT number in `.font(.title2).bold().monospacedDigit()`.
- Trend arrow (`arrow.up.right`, `arrow.down.right`, `minus`) with semantic coloring.
- Tappable expansion shows predicted race times and VDOT history.

### 6.4 Coach Message Bubbles

In Coach chat:

| Element | Style |
|---|---|
| Coach messages | Leading-aligned, `.secondarySystemBackground` bubble |
| User messages | Trailing-aligned, accent-colored bubble, white text |
| Timestamp | `.font(.caption2).foregroundStyle(.tertiary)`, grouped by date |
| Rich cards (assessment, weekly summary) | Full-width structured card inside chat flow |

### 6.5 Segment Timeline

Workout segments displayed as horizontal bar or vertical list:

- Each segment uses pace-zone color.
- Width is proportional to segment duration/distance.
- Labels show segment name and target (for example, "4x800m @ I").
- Rest segments appear as narrow neutral gaps.

### 6.6 Volume Chart (Plan Overview)

The Plan Overview shows horizontal scrollable weekly volume bars.

- Bar height equals percentage of peak week volume.
- Current week highlighted with accent color; past weeks filled; future weeks outlined or dimmed.
- Emphasis label below each bar (for example, "Base", "Speed", "Taper").
- Use Swift Charts `BarMark` with `.foregroundStyle(by:)` for emphasis-based coloring.

### 6.7 Buttons & Actions

| Context | Style |
|---|---|
| Primary action (Start Plan, Confirm) | `.buttonStyle(.glassProminent)` with accent tint |
| Secondary action (Edit, Reschedule) | `.buttonStyle(.glass)` |
| Destructive action (Abandon Plan, Delete) | `.buttonStyle(.glass)` with `.tint(Color.destructive)` |
| Inline action (RPE submit, modifier select) | `.buttonStyle(.borderedProminent)` or `.glass` depending on context |
| Close/dismiss | `Button(role: .close)` system-standard close affordance |

If glass styles are unavailable, use bordered/borderedProminent fallback from §1.2.

### 6.8 Effort Modifier Tags

Quick-select tags for post-workout effort modifiers (stroller, trail, treadmill, etc.):

- Capsule toggles in horizontal scroll or flow layout.
- Unselected: outlined, `.foregroundStyle(.secondary)`.
- Selected: filled with subtle accent or neutral tint.
- Custom modifier reveals text field when "Custom" is selected.

### 6.9 RPE Input

A 1-10 scale input presented after workout matching:

- Horizontal numbered circles or segmented slider.
- Selected value filled with accent color.
- Optional descriptive label (for example, "7 - Hard").
- Clear "Skip" option.

---

## 7. Charts & Data Visualization

### 7.1 Framework

Use **Swift Charts** for all data visualization.

### 7.2 Chart Types by Context

| Data | Chart Type | Mark |
|---|---|---|
| Weekly mileage/volume over plan | Bar chart | `BarMark` |
| Pace trend over time | Line chart | `LineMark` |
| VDOT progression | Line chart with point markers | `LineMark` + `PointMark` |
| Heart rate zone distribution | Stacked bar or area | `BarMark` / `AreaMark` |
| Volume planned vs. actual | Grouped bar | `BarMark` with `.position(by:)` |
| Workout splits | Bar chart (horizontal) | `BarMark` with `.horizontal` orientation |

### 7.3 Chart Styling

- Use pace-zone palette for zone charts; use accent + secondary for plan vs. actual.
- Add `.chartYAxis { AxisMarks(position: .leading) }` for left-aligned Y axis in LTR locales.
- Use `.chartXAxisLabel()` and `.chartYAxisLabel()` for clarity.
- Keep chart heights between **160-240pt** in cards; full-screen charts may be taller.
- Provide meaningful `.accessibilityLabel()` on chart containers.

---

## 8. Layout & Spacing

### 8.1 Standard Spacing Scale

Use SwiftUI built-in spacing and padding. When explicit values are required:

| Token | Value | Usage |
|---|---|---|
| `xxs` | 4pt | Tight inline spacing (icon-to-label) |
| `xs` | 8pt | Compact element spacing |
| `sm` | 12pt | Default content padding, stack spacing |
| `md` | 16pt | Card internal padding, section spacing |
| `lg` | 24pt | Section gaps, group separation |
| `xl` | 32pt | Major section breaks |

### 8.2 Content Width

- Content **MUST** respect safe area and use standard SwiftUI padding.
- On larger screens (iPad, landscape), constrain content width to about 672pt max for readability.

### 8.3 Touch Targets

- Interactive elements **MUST** provide at least **44 x 44pt** tappable area.
- Elements may render smaller visually, but hit area **MUST** meet minimum.
- Interactive elements **SHOULD** be spaced at least **12pt** apart.

---

## 9. Iconography

### 9.1 SF Symbols

Use **SF Symbols** for UI icons. Do not use custom control icons unless SF Symbols lacks coverage. Slop (see §14) is a separate illustration system for empty states, onboarding, and celebrations.

Recommended symbols:

| Concept | Symbol |
|---|---|
| Dashboard / Home | `house.fill` |
| Plan | `calendar` |
| History | `clock.fill` |
| Coach / Chat | `bubble.left.and.text.bubble.right.fill` |
| Settings | `gearshape.fill` |
| Running workout | `figure.run` |
| Easy run | `figure.walk` |
| Intervals / Speed | `bolt.fill` |
| Heart rate | `heart.fill` |
| VDOT / Performance | `chart.line.uptrend.xyaxis` |
| Strength workout | `dumbbell.fill` |
| Timer / Duration | `timer` |
| Distance | `point.topleft.down.to.point.bottomright.curvepath` |
| Pace | `speedometer` |
| Calendar event | `calendar.badge.clock` |
| Weather | `cloud.sun.fill` |
| Track | `point.forward.to.point.capsulepath.fill` |
| Trophy / Race | `trophy.fill` |
| Trend up | `arrow.up.right` |
| Trend down | `arrow.down.right` |
| Checkmark | `checkmark.circle.fill` |
| Warning | `exclamationmark.triangle.fill` |
| RPE / Effort | `flame.fill` |

### 9.2 Symbol Rendering

- Use `.symbolRenderingMode(.hierarchical)` as default.
- Use `.symbolRenderingMode(.palette)` when two distinct colors are required.
- Use `.symbolRenderingMode(.multicolor)` for weather symbols.
- Match symbol weight to accompanying text weight with `.fontWeight()`.

---

## 10. Animation & Motion

### 10.1 Principles

- Animation **MUST** communicate state, transition, or interactive feedback.
- Decorative-only animation **SHOULD NOT** be used.
- Prefer system transitions and matched geometry where available.

### 10.2 Standard Animations

| Context | Preferred | Fallback |
|---|---|---|
| State changes (toggle, selection) | `.animation(.default, value:)` | No explicit animation when Reduce Motion is on |
| View transitions (push, sheet) | System-managed | `.transition(.opacity)` |
| Progress ring fill | `.spring(duration: 0.6)` | `.spring(response: 0.6, dampingFraction: 0.85, blendDuration: 0)` |
| Glass element morphing | `.bouncy` via `withAnimation` | `.easeInOut(duration: 0.25)` |
| Chart data updates | `.easeInOut(duration: 0.3)` | Same |
| Content appearing | `.transition(.opacity)` or `.move(edge:)` | `.opacity` only |

### 10.3 Reduce Motion

Always check `@Environment(\.accessibilityReduceMotion)` and gate non-essential animation.

```swift
@Environment(\.accessibilityReduceMotion) var reduceMotion

withAnimation(reduceMotion ? .none : .spring(duration: 0.6)) {
    // state change
}
```

- Spatial animations (slides, bounces, ring fills) **MUST** degrade to opacity changes.
- Liquid Glass may reduce its own motion automatically; custom animations **MUST** also comply.

---

## 11. Accessibility

### 11.1 VoiceOver

- Interactive controls **MUST** expose clear accessible names.
- Custom `.accessibilityLabel()` is **REQUIRED** when the system-generated label is ambiguous, icon-only, duplicated, or missing context.
- Workout cards should announce full context (for example, "Easy run, 45 minutes, Tuesday, completed").
- Chart containers should include purpose-focused `.accessibilityLabel()`.
- Progress ring should announce as a gauge (for example, "Weekly volume, 65% complete, 32 of 50 kilometers").
- Coach messages should announce role and content (for example, "Coach says:").

### 11.2 Dynamic Type

- All text uses built-in text styles.
- Layouts **MUST** be tested at all Dynamic Type sizes, including accessibility sizes AX1-AX5.
- Layouts **MUST** reflow without truncation where practical; use `ViewThatFits`, `ScrollView`, or adaptive stacks.
- Fixed-height text containers that clip at larger sizes **MUST NOT** be used.

### 11.3 Color & Contrast

- Color **MUST NOT** be the sole state indicator.
- Pace zone badges include both color and text label (E, M, T, I, R).
- Workout status uses both color and SF Symbol (checkmark, clock, xmark).

---

## 12. App Icon

### 12.1 Design Specifications

- **Canvas:** 1024 x 1024 px, PNG, fully opaque (no transparency).
- **Safe zone:** Keep essential shapes within central **70%** of canvas.
- **Foreground:** Slop's face, bold and simplified, instantly recognizable (see §14). Use front or 3/4 angle with tongue out and floppy ears.
- **Background:** Simple low-contrast surface for clean Liquid Glass highlights.
- Do **not** bake shadows, borders, or reflections into the icon.
- Test at small size (minimum 60 x 60 px preview) for expression legibility.

---

## 13. Platform Conventions

### 13.1 Units

- Distances and paces **MUST** use the user's preferred unit (km or mi), stored in `UserProfile.volumePreference`.
- Unit labels **MUST** be shown with values (for example, "5:30 /km", "8.2 mi").
- Number formatting **MUST** use locale-aware formatters.

### 13.2 Dates & Times

- Use system locale via `Date.FormatStyle`.
- Use relative dates for recent items ("Today", "Yesterday", "3 days ago").
- Use explicit dates for schedules (for example, "Tue, Feb 24").

### 13.3 Empty States

- Every list and data view **MUST** define a meaningful empty state.
- Empty states include a Slop illustration matching context (see §14.4), short message, and clear CTA.
- If Slop art is unavailable, use a large SF Symbol with `.foregroundStyle(.tertiary)`.

### 13.4 Loading & Error States

- Indeterminate loading states **MUST** use a Slop-the-dog-running animation.
- `ProgressView()` is only an acceptable fallback when Slop animation assets are unavailable.
- Coach AI responses show a typing indicator (three animated dots) in chat bubble.
- Recoverable network errors show inline message with Retry action; blocking alerts **SHOULD NOT** be used for recoverable failures.
- Offline mode shows cached data plus subtle limited-functionality banner.

### 13.5 Haptics

Use haptics for key interactions only.

| Event | Semantic intent | Recommended API |
|---|---|---|
| Workout completed, plan activated | Success confirmation | `UINotificationFeedbackGenerator().notificationOccurred(.success)` |
| RPE value changed, modifier toggled | Selection acknowledgement | `UISelectionFeedbackGenerator().selectionChanged()` |
| Destructive confirmation accepted | Warning confirmation | `UINotificationFeedbackGenerator().notificationOccurred(.warning)` |

- Haptics **MUST** fire on confirmed state changes, not on every tap attempt.
- Repeated events **SHOULD** be debounced/rate-limited to avoid haptic spam.
- Haptics **MAY** be skipped when system settings disable them.

---

## 14. Mascot — Slop the Dog

### 14.1 Character

The app mascot is **Slop**, a goofy, energetic yellow Labrador Retriever. Slop embodies the spirit of the app: enthusiastic about running, slightly sloppy, and always ready to go.

### 14.2 Personality Traits

| Trait | Expression |
|---|---|
| **Energetic** | Always in motion: running, stretching, bounding. |
| **Goofy** | Tongue out, floppy ears, slightly clumsy; endearing, never polished. |
| **Encouraging** | Celebrates every effort; no judgmental tone. |
| **Relatable** | Sometimes tired, sometimes distracted; not a perfect athlete. |

### 14.3 Visual Guidelines

- **Breed:** Yellow Labrador Retriever with consistent golden/yellow coat.
- **Style:** Simple expressive illustration with bold shapes and minimal detail.
- **Expressions:** Exaggerated and legible at small sizes.
- **Accessories:** Running bandana, bib number, or sweatband are acceptable.
- **Color:** Use app accent color for accessories.

### 14.4 Usage Contexts

| Context | Slop Appearance |
|---|---|
| Empty states | Contextual Slop pose (for example, sleeping for "No workouts yet") |
| Onboarding | Slop guides setup screens |
| Celebrations | Slop cheers for completion/milestones |
| Error states | Slop appears confused/tangled |
| Coach personality | Slop informs coach tone: friendly and enthusiastic |
| App icon | Slop face as primary icon element (see §12) |

### 14.5 Tone Alignment

Coach voice should align with Slop: supportive, casual, and lightly playful. Avoid corporate fitness tone.

---

## 15. Implementation Mapping & Definition of Done

### 15.1 Design Token Source of Truth

- Color tokens **MUST** be defined in Asset Catalog with Light/Dark variants.
- Spacing tokens **SHOULD** be centralized in a shared Swift type (for example, `Spacing`).
- Inline hex values in feature view code **MUST NOT** be used.

### 15.2 Mapping Standards

- `accentColor`, zone colors, and status colors should map to named `Color` extensions.
- Destructive actions should use `Color.destructive` token consistently.
- Version-sensitive visual APIs should be wrapped in reusable helpers/modifiers to avoid repeated availability logic.

### 15.3 Definition of Done Checklist

Each PR that affects UI **MUST** verify:

- Dynamic Type pass at standard and AX1-AX5 sizes.
- Light Mode, Dark Mode, and Increase Contrast pass.
- VoiceOver labels and reading order pass.
- Reduce Motion pass (non-essential motion removed).
- Minimum 44 x 44pt touch targets and 12pt minimum spacing for dense controls.
- Fallback behavior for unavailable APIs listed in §1.2.

### 15.4 QA Evidence

- PR description **SHOULD** include screenshots for Light/Dark and at least one accessibility-size capture.
- PR description **SHOULD** mention which fallback path was tested when using version-sensitive APIs.
