# Onboarding → Commit → Paywall Flow

Design spec for the three screens that turn a finished plan into a paid, committed
sprint. The core idea: **payment is framed as the act of committing, not a wall.**
Each screen escalates the ask, and the money-back guarantee appears on all three so
risk never resurfaces as an objection.

**Flow:** `Plan Ready + Commit` → `Commitment Bridge` → `Paywall (activation)`

**Voice:** honest, direct, action-first. No hype. State the price and the terms plainly.

---

## Screen 1 — Plan Ready + Commit

*The "this is yours now" moment. Show the plan is real and personalized, then ask for
commitment (not payment yet).*

```
┌─────────────────────────────┐
│  ‹                          │  ← back only, no skip
│                             │
│  Your 28-day plan is        │  ← H1, left-aligned, bold
│  ready, {name}.             │     (use their name)
│                             │
│  Built from what you told   │  ← subhead, muted
│  me. One small task a day.  │
│                             │
│  ┌───────────────────────┐ │
│  │ 🎯  Your idea          │ │  ← plan summary card
│  │ {echoes user input}    │ │     (echoes their input)
│  ├───────────────────────┤ │
│  │ ⏱  ~25 min / day       │ │
│  ├───────────────────────┤ │
│  │ 🧾  Every task needs   │ │
│  │    proof — no faking   │ │
│  ├───────────────────────┤ │
│  │ 🚦  Ship-or-kill call  │ │
│  │    on Day 14 & Day 28  │ │
│  └───────────────────────┘ │
│                             │
│  Day 1 is waiting:          │  ← tiny commitment primer
│  "Message 3 people who      │     (shows first task =
│   might have this problem"  │      lowers activation cost)
│                             │
│  ┌───────────────────────┐ │
│  │  Commit to my sprint  │ │  ← primary CTA, full-width
│  └───────────────────────┘ │
│                             │
│  🔒 Finish all 28 days +    │  ← exact promise, small,
│     paid customer + proof   │     directly under CTA
└─────────────────────────────┘
```

**Copy rationale:** naming the idea back proves it's personalized; showing Day 1's
actual task uses the "tiny task" principle to make committing feel cheap; the guarantee
sits on the CTA to kill risk at the decision point. CTA says *commit*, not *pay* —
payment is the next beat.

---

## Screen 2 — The Commitment Bridge

*One screen between "commit" and "pay." Reframes payment as locking in, and sets the
binding deadline (behavioral science).*

```
┌─────────────────────────────┐
│                             │
│  Here's the deal.           │  ← H1, plain-spoken
│                             │
│  ┌───────────────────────┐ │
│  │ ●  Your plan is built  │ │  ← vertical timeline
│  │ │                     │ │     step 1 = done (✓ filled)
│  │ ●  You start today     │ │     step 2 = unlocked (ring)
│  │ │  Day 1, one task     │ │
│  │ ●  First customer by   │ │     step 3 = the goal
│  │    Day 28              │ │     (dashed/outlined)
│  └───────────────────────┘ │
│                             │
│  This only works if you     │  ← the honest contract
│  actually show up. So the   │     (states the "why",
│  clock starts the moment    │      creates binding deadline)
│  you're in.                 │
│                             │
│  ┌───────────────────────┐ │
│  │   I'm in — let's go    │ │  ← primary CTA
│  └───────────────────────┘ │
│                             │
│  Finish the work + paid     │  ← promise restated,
│  customer + proof = refund  │     one line
└─────────────────────────────┘
```

**Copy rationale:** the timeline visually links "plan exists → start now → deadline,"
so paying reads as *starting the clock*, not hitting a wall. "This only works if you
show up" matches the honest, accountability-first landing-page tone — and primes the
binding deadline.

---

## Screen 3 — The Paywall (feels like activation)

*The CTA is framed as finishing setup, not paying. One-time price, matching the $49
model.*

```
┌─────────────────────────────┐
│                          ✕  │  ← closeable, low pressure
│                             │
│  Lock in your 28 days       │  ← H1 = activation, not "upgrade"
│                             │
│  ┌───────────────────────┐ │
│  │ ✓ 28 daily tasks,      │ │  ← what you're paying for,
│  │   built for your idea  │ │     framed as the plan itself
│  │ ✓ Proof-checked every  │ │
│  │   day so you can't drift│ │
│  │ ✓ Bo, your AI co-      │ │
│  │   founder, on call     │ │
│  │ ✓ Ship-or-kill reviews │ │
│  └───────────────────────┘ │
│                             │
│      $49  one time          │  ← price, big + honest
│      No subscription        │  ← no later charge
│                             │
│  ┌───────────────────────┐ │
│  │   Start Day 1          │ │  ← CTA = the action,
│  └───────────────────────┘ │     not "Subscribe" / "Pay"
│                             │
│  🔒 Complete all 28 days    │  ← exact risk reversal
│  + paid customer + evidence │
│                             │
│  Secured by Stripe · Terms  │  ← trust row, muted
└─────────────────────────────┘
```

**Copy rationale:** "Lock in" + "Start Day 1" makes the payment button the same as
beginning the work. Listing the plan contents *as* the value keeps it honest — you're
buying the sprint, not "premium features." Price and refund conditions are stated
plainly because hiding either would break the voice.

---

## Visual Design Direction — GoClub × Alan

The look combines two references:

- **Alan** brings *warmth and reassurance* — peach gradients, soft rounded white cards,
  a friendly 3D mascot, generous whitespace. Used for the calm, human moments.
- **GoClub** brings *energy and momentum* — bold color, oversized numerals, glassmorphic
  pill CTAs, high contrast. Used to make the sprint feel urgent and worth committing to.

The rule of thumb: **Alan carries the emotion, GoClub carries the numbers.** Warm base
+ one bold action accent. Calm where we ask for trust; loud where we show stakes.

### Design tokens

```
COLOR
  --warm-bg-top      #FFF3E9   // Alan peach gradient (top)
  --warm-bg-bottom   #FDE7D6   // Alan peach gradient (bottom)
  --bold-bg          #2E2EF0   // GoClub cobalt (paywall / deadline moments)
  --accent-primary   #5B5BF5   // indigo — bridges Alan violet + GoClub cobalt
  --accent-action    #E8FF3A   // GoClub acid yellow — highlights, progress, "now"
  --card             #FFFFFF   // soft white cards
  --ink              #1A1A2E   // near-black text
  --ink-muted        #6B6B80   // subheads, captions

TYPE
  H1        heavy grotesk, 30–34px, tight tracking   (GoClub weight)
  Numeral   oversized display, 56–72px               (GoClub — Day 28, $49)
  Body      friendly sans, 16px, relaxed leading     (Alan warmth)
  Caption   14px, --ink-muted

SHAPE & DEPTH
  Card radius        20px, soft ambient shadow        (Alan)
  CTA                floating glass pill, full-width   (GoClub)
  Weather/goal orb   radial glass blur                (GoClub, optional)

MASCOT — "Bo"
  Byqqa's AI co-founder as a 3D character (Alan's mascot role).
  Changes pose per screen to carry the emotional beat.

MOTION
  Calm screens   gentle spring, fade + rise           (Alan)
  Bold screens   snappy count-up on numerals, confetti burst on commit  (GoClub)
```

### Per-screen treatment

| Screen | Anchor | Background | Hero element | Accent use |
|---|---|---|---|---|
| 1 · Plan Ready + Commit | **Alan** | Warm peach gradient | Bo, welcoming pose, beside plan card | Indigo CTA; acid-yellow tick on "Day 1 waiting" |
| 2 · Commitment Bridge | **Alan → GoClub** | Peach, cooling toward footer | Vertical timeline, Bo pointing at Day 28 | Acid-yellow "today" node; indigo CTA |
| 3 · Paywall | **GoClub** | Cobalt (or peach→cobalt) | Oversized **$49** and **Day 28** numerals | Acid-yellow price highlight; glass pill "Start Day 1" |

The gradient literally warms → cools as the user moves from "we've got you" (Alan) to
"the clock is running, lock it in" (GoClub). The mascot keeps it human the whole way;
the numerals do the persuading at the paywall.

### Applying it to the wireframes above

- **Screen 1:** peach bg, Bo top-right waving, plan card in soft white, `Commit to my
  sprint` as an indigo pill. The `Day 1 is waiting` line gets an acid-yellow accent dot.
- **Screen 2:** same peach base but the timeline's "You start today" node glows
  acid-yellow (GoClub's "now" energy); Day 28 node in indigo. Bo points to it.
- **Screen 3:** shift to cobalt. `$49` and `Day 28` rendered as oversized GoClub-style
  numerals with an acid-yellow underline on the price; `Start Day 1` is a glass pill.
  Confetti on tap.

---

## Flow logic

1. **Commit** — emotional ownership, free.
2. **Bridge** — the contract + binding deadline.
3. **Pay** — framed as starting.

Each CTA escalates: **"Commit to my sprint" → "I'm in — let's go" → "Start Day 1."**
The exact refund conditions appear at the decision point and link to the terms.

## Copy inventory (quick reference)

| Screen | H1 | Primary CTA | Guarantee line |
|---|---|---|---|
| 1 · Plan Ready | Your 28-day plan is ready, {name}. | Commit to my sprint | See the clear refund conditions |
| 2 · Bridge | Here's the deal. | I'm in — let's go | One payment, no subscription |
| 3 · Paywall | Lock in your 28 days | Start Day 1 | Complete all 28 days with a paid customer and evidence |
