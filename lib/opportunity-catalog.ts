export type Opportunity = {
  id: string;
  label: string;
  detail: string;
  category: string;
  signal: "Paid market signal" | "Open lane";
  tags: string[];
  /** Internal reference only. The evidence register is not sent to founders. */
  evidenceIds?: string[];
  rights: "badger_original" | "open_licence";
};

// This is Badger's founder-facing inspiration library. Every title and
// description is original Badger copy. A card only receives the stronger
// "Paid market signal" label when an awarded, openly licensed procurement
// record is stored in the internal evidence register. Owner-supplied research
// imports remain private until their redistribution rights are documented.
export const OPPORTUNITY_CATALOG: Opportunity[] = [
  {
    id: "landlord-licensing",
    label: "Make landlord licence applications less painful",
    detail: "Keep forms, documents and renewal dates together for small landlords and letting agents.",
    category: "Property",
    signal: "Paid market signal",
    tags: ["property", "landlord", "letting", "licence", "forms", "admin", "compliance"],
    evidenceIds: ["cf-landlord-licensing-2024"],
    rights: "open_licence",
  },
  {
    id: "builder-budget",
    label: "Stop building projects drifting over budget",
    detail: "Show builders how choices, changes and delays affect the final cost before it is too late.",
    category: "Construction",
    signal: "Paid market signal",
    tags: ["builder", "construction", "home", "budget", "project", "trade", "cost"],
    evidenceIds: ["cf-construction-cost-book-2025"],
    rights: "open_licence",
  },
  {
    id: "duplicate-invoices",
    label: "Catch duplicate invoices before they are paid",
    detail: "Help finance teams spot repeated supplier invoices without checking every line by hand.",
    category: "Operations",
    signal: "Paid market signal",
    tags: ["invoice", "admin", "finance", "accounting", "operations", "supplier", "payment"],
    evidenceIds: ["cf-duplicate-payment-2025"],
    rights: "open_licence",
  },
  {
    id: "restaurant-inspections",
    label: "Help small restaurants prepare for inspections",
    detail: "Turn recurring checks and local rules into a practical routine the whole team can follow.",
    category: "Local business",
    signal: "Open lane",
    tags: ["restaurant", "food", "local", "compliance", "hospitality", "checklist", "paperwork"],
    rights: "badger_original",
  },
  {
    id: "home-energy-forms",
    label: "Handle the paperwork for home energy grants",
    detail: "Help homeowners find, prepare and track the forms needed for an energy upgrade.",
    category: "Climate",
    signal: "Open lane",
    tags: ["climate", "home", "energy", "grant", "paperwork", "sustainability"],
    rights: "badger_original",
  },
  {
    id: "older-adult-fitness",
    label: "Give coaches better plans for older clients",
    detail: "Turn a client's mobility, confidence and goals into sessions that feel safe and useful.",
    category: "Health",
    signal: "Open lane",
    tags: ["health", "fitness", "older", "senior", "coach", "care", "mobility"],
    rights: "badger_original",
  },
  {
    id: "plant-messages",
    label: "Send plant care help at the right time",
    detail: "Give people simple, plant-specific reminders through messages instead of another dashboard.",
    category: "Home & garden",
    signal: "Open lane",
    tags: ["plant", "garden", "consumer", "messages", "reminder", "home"],
    rights: "badger_original",
  },
  {
    id: "event-alerts",
    label: "Make last-minute event alerts useful",
    detail: "Tell fans when relevant tickets or price changes appear without making them watch five sites.",
    category: "Events",
    signal: "Open lane",
    tags: ["event", "ticket", "music", "sport", "alert", "consumer"],
    rights: "badger_original",
  },
  {
    id: "newsletter-data",
    label: "Turn raw data into newsletter stories",
    detail: "Help writers find the chart, point and plain explanation hidden inside a report.",
    category: "Creator tools",
    signal: "Open lane",
    tags: ["creator", "newsletter", "content", "data", "writing", "marketing"],
    rights: "badger_original",
  },
  {
    id: "pool-updates",
    label: "Show pool customers what changed after each visit",
    detail: "Turn tests, repairs and next steps into a short update a customer can understand.",
    category: "Local business",
    signal: "Open lane",
    tags: ["pool", "service", "local", "video", "maintenance", "trade", "customer"],
    rights: "badger_original",
  },
  {
    id: "native-plants",
    label: "Choose plants that suit a real garden",
    detail: "Match the site, weather and time available to plants people can actually buy nearby.",
    category: "Home & garden",
    signal: "Open lane",
    tags: ["plant", "garden", "landscape", "climate", "home", "local"],
    rights: "badger_original",
  },
  {
    id: "solo-travel-notes",
    label: "Answer the safety questions solo travellers really ask",
    detail: "Organise recent local experiences around the details that broad hotel reviews miss.",
    category: "Travel",
    signal: "Open lane",
    tags: ["travel", "women", "solo", "safety", "community", "review", "consumer"],
    rights: "badger_original",
  },
  {
    id: "beauty-no-shows",
    label: "Reduce no-shows for independent beauty professionals",
    detail: "Use friendly reminders, deposits and easy rescheduling without making clients feel chased.",
    category: "Local business",
    signal: "Open lane",
    tags: ["beauty", "salon", "appointment", "booking", "local", "reminder"],
    rights: "badger_original",
  },
  {
    id: "childcare-handover",
    label: "Make childcare handovers easier to remember",
    detail: "Give parents and carers one private place for meals, sleep, medicine and the small details.",
    category: "Family",
    signal: "Open lane",
    tags: ["childcare", "parent", "family", "carer", "handover", "routine"],
    rights: "badger_original",
  },
  {
    id: "pet-medicine",
    label: "Help families keep up with pet medicine",
    detail: "Share doses, appointments and changes between everyone looking after the same animal.",
    category: "Pets",
    signal: "Open lane",
    tags: ["pet", "animal", "medicine", "family", "reminder", "care"],
    rights: "badger_original",
  },
  {
    id: "family-care-rota",
    label: "Make family care rotas less stressful",
    detail: "Keep visits, errands and updates clear when several relatives support one person.",
    category: "Care",
    signal: "Open lane",
    tags: ["care", "family", "older", "carer", "rota", "health", "community"],
    rights: "badger_original",
  },
  {
    id: "trade-quote-followup",
    label: "Help tradespeople follow up every quote",
    detail: "Keep enquiries, site visits and promised follow-ups from disappearing into old messages.",
    category: "Trades",
    signal: "Open lane",
    tags: ["trade", "builder", "plumber", "electrician", "quote", "sales", "local"],
    rights: "badger_original",
  },
  {
    id: "rental-checkin",
    label: "Create a clear record when a tenant moves in",
    detail: "Guide tenants and landlords through photos, notes and agreed issues room by room.",
    category: "Property",
    signal: "Open lane",
    tags: ["property", "landlord", "tenant", "rental", "photo", "evidence", "home"],
    rights: "badger_original",
  },
  {
    id: "community-classes",
    label: "Fill spare places in local classes",
    detail: "Give small class organisers a simple way to share availability and handle late bookings.",
    category: "Community",
    signal: "Open lane",
    tags: ["community", "class", "booking", "local", "fitness", "education"],
    rights: "badger_original",
  },
  {
    id: "newcomer-admin",
    label: "Explain local admin to people new to a country",
    detail: "Turn unfamiliar forms and appointments into a clear checklist in plain language.",
    category: "Community",
    signal: "Open lane",
    tags: ["community", "language", "forms", "admin", "newcomer", "local", "guide"],
    rights: "badger_original",
  },
  {
    id: "creator-sponsors",
    label: "Keep creator sponsorships from getting messy",
    detail: "Track the brief, approval, post date and payment without a large agency system.",
    category: "Creator tools",
    signal: "Open lane",
    tags: ["creator", "sponsor", "content", "payment", "campaign", "marketing"],
    rights: "badger_original",
  },
  {
    id: "freelance-scope",
    label: "Catch freelance scope changes early",
    detail: "Turn extra requests into a clear record before they quietly become unpaid work.",
    category: "Freelance",
    signal: "Open lane",
    tags: ["freelance", "client", "scope", "project", "invoice", "work"],
    rights: "badger_original",
  },
  {
    id: "market-stall-stock",
    label: "Make stock planning easier for market sellers",
    detail: "Use past sales, weather and upcoming markets to plan what to bring and what to leave.",
    category: "Retail",
    signal: "Open lane",
    tags: ["retail", "market", "seller", "stock", "local", "food", "craft"],
    rights: "badger_original",
  },
  {
    id: "home-repair-history",
    label: "Keep a useful repair history for a home",
    detail: "Save the problem, person, cost and result so the next repair starts with context.",
    category: "Home",
    signal: "Open lane",
    tags: ["home", "repair", "property", "maintenance", "trade", "record"],
    rights: "badger_original",
  },
  {
    id: "student-placement",
    label: "Take the admin out of student placements",
    detail: "Keep checks, supervisors, dates and feedback clear for small training providers.",
    category: "Education",
    signal: "Open lane",
    tags: ["student", "education", "training", "placement", "admin", "feedback"],
    rights: "badger_original",
  },
  {
    id: "charity-donor-notes",
    label: "Help small charities remember their supporters",
    detail: "Keep useful notes and follow-ups without forcing a volunteer team into a heavy sales tool.",
    category: "Charity",
    signal: "Open lane",
    tags: ["charity", "volunteer", "donor", "community", "fundraising", "follow-up"],
    rights: "badger_original",
  },
  {
    id: "wedding-suppliers",
    label: "Keep wedding supplier decisions in one place",
    detail: "Bring quotes, choices, deadlines and payments together for couples planning without an organiser.",
    category: "Events",
    signal: "Open lane",
    tags: ["wedding", "event", "supplier", "budget", "planning", "consumer"],
    rights: "badger_original",
  },
  {
    id: "mobile-service-routes",
    label: "Plan a better day for mobile service businesses",
    detail: "Group bookings by location and travel time for barbers, cleaners, tutors and repairers.",
    category: "Local business",
    signal: "Open lane",
    tags: ["local", "route", "booking", "barber", "cleaner", "tutor", "service"],
    rights: "badger_original",
  },
  {
    id: "care-shift-handover",
    label: "Make small care-team handovers clearer",
    detail: "Turn shift notes into the few changes and actions the next person must not miss.",
    category: "Care",
    signal: "Open lane",
    tags: ["care", "health", "shift", "handover", "team", "notes"],
    rights: "badger_original",
  },
  {
    id: "allergen-checks",
    label: "Make allergen checks practical for small food sellers",
    detail: "Keep ingredients, recipe changes and customer questions consistent without a paper chase.",
    category: "Food",
    signal: "Open lane",
    tags: ["food", "allergen", "bakery", "restaurant", "compliance", "local"],
    rights: "badger_original",
  },
  {
    id: "sports-volunteers",
    label: "Fill the jobs that keep a local sports club running",
    detail: "Make it easy for parents and members to take a small shift and know what is needed.",
    category: "Community",
    signal: "Open lane",
    tags: ["sport", "club", "volunteer", "community", "rota", "family"],
    rights: "badger_original",
  },
  {
    id: "holiday-rental-turnover",
    label: "Keep holiday rental changeovers on track",
    detail: "Coordinate cleaning, missing items and guest-ready checks across several properties.",
    category: "Travel",
    signal: "Open lane",
    tags: ["travel", "rental", "property", "cleaning", "guest", "checklist"],
    rights: "badger_original",
  },
  {
    id: "agency-approvals",
    label: "Stop client approvals getting lost in messages",
    detail: "Give small agencies one clear record of what was shown, changed and approved.",
    category: "Agency",
    signal: "Open lane",
    tags: ["agency", "client", "approval", "content", "project", "marketing"],
    rights: "badger_original",
  },
  {
    id: "renewal-calendar",
    label: "Warn small teams before supplier renewals",
    detail: "Bring notice periods, owners and decisions together before another contract rolls over.",
    category: "Operations",
    signal: "Open lane",
    tags: ["operations", "supplier", "contract", "renewal", "admin", "finance"],
    rights: "badger_original",
  },
  {
    id: "repair-quote-compare",
    label: "Make home repair quotes easier to compare",
    detail: "Turn different wording and exclusions into a clear side-by-side view before someone chooses.",
    category: "Home",
    signal: "Open lane",
    tags: ["home", "repair", "quote", "trade", "budget", "consumer"],
    rights: "badger_original",
  },
  {
    id: "training-expiry",
    label: "Keep small teams ahead of training expiry dates",
    detail: "Show who needs what, when it expires and the next practical action without a large HR system.",
    category: "Work",
    signal: "Open lane",
    tags: ["work", "training", "compliance", "reminder", "team", "admin"],
    rights: "badger_original",
  },
];

function stableNumber(value: string): number {
  let total = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    total ^= value.charCodeAt(index);
    total = Math.imul(total, 16777619);
  }
  return total >>> 0;
}

export function matchOpportunities(context: string, audience: string, limit = 6): Opportunity[] {
  const haystack = `${context} ${audience}`.toLocaleLowerCase();
  const seed = stableNumber(haystack || "badger-starting-point");
  const scored = OPPORTUNITY_CATALOG.map((opportunity, index) => ({
    opportunity,
    score: opportunity.tags.reduce((total, tag) => total + (haystack.includes(tag) ? 3 : 0), 0)
      + (haystack.includes(opportunity.category.toLocaleLowerCase()) ? 2 : 0),
    // Rotate ties from the founder's own context so the library feels selected,
    // while remaining deterministic across refreshes and server/client renders.
    tie: stableNumber(`${seed}:${opportunity.id}:${index}`),
  }));

  return scored
    .sort((left, right) => right.score - left.score || left.tie - right.tie)
    .slice(0, Math.max(0, Math.min(limit, OPPORTUNITY_CATALOG.length)))
    .map(({ opportunity }) => opportunity);
}
