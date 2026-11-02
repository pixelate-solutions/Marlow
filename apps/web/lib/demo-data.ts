/**
 * Deterministic demo workspace.
 *
 * Every person, company, domain, and address below is fictional. Domains use the
 * reserved `.example` TLD so nothing here can resolve or receive mail. Demo mode
 * never calls Apollo, the model provider, research providers, or a mailbox.
 */
import type { CampaignProfile } from "@marlow/shared";

export const DEMO_IDS = {
  organization: "10000000-0000-4000-8000-000000000001",
  user: "11000000-0000-4000-8000-000000000001",
  campaign: "20000000-0000-4000-8000-000000000001",
  facilitiesCampaign: "20000000-0000-4000-8000-000000000002",
  refrigerationCampaign: "20000000-0000-4000-8000-000000000003",
  readyCampaign: "20000000-0000-4000-8000-000000000004",
  prospect: "40000000-0000-4000-8000-000000000001",
  draft: "70000000-0000-4000-8000-000000000001",
} as const;

const SENDER = {
  name: "Alex Morgan",
  title: "Founder",
  company: "Fieldline",
  mailbox: "alex@fieldline.example",
  signature: "Alex Morgan\nFounder, Fieldline",
  postalAddress: "418 Harbor Street, Suite 200, Grand Rapids, MI 49503",
};
const COMPLIANCE_FOOTER = `${SENDER.postalAddress}\nNot relevant? Reply and I won’t follow up.`;

export const demoCampaigns = [
  {
    id: DEMO_IDS.campaign,
    name: "Midwest HVAC operations leaders",
    objective: "Book discovery calls with operations leaders at commercial HVAC contractors",
    status: "PENDING_USER_APPROVAL",
    progress: 90,
    prospects: 34,
    qualified: 14,
    drafts: 7,
    sent: 3,
    updated: "8 minutes ago",
    color: "teal" as const,
    followUpNeeded: 1,
    followUpDraftId: DEMO_IDS.draft,
  },
  {
    id: DEMO_IDS.facilitiesCampaign,
    name: "Facilities services expansion",
    objective: "Introduce dispatch visibility to multi-site facilities services firms",
    status: "RESEARCHING",
    progress: 64,
    prospects: 18,
    qualified: 4,
    drafts: 1,
    sent: 0,
    updated: "2 minutes ago",
    color: "blue" as const,
    followUpNeeded: 0,
    followUpDraftId: null,
  },
  {
    id: DEMO_IDS.refrigerationCampaign,
    name: "Commercial refrigeration pilot",
    objective: "Test messaging with refrigeration service contractors",
    status: "PAUSED",
    progress: 50,
    prospects: 9,
    qualified: 2,
    drafts: 0,
    sent: 1,
    updated: "Yesterday",
    color: "amber" as const,
    followUpNeeded: 0,
    followUpDraftId: null,
  },
  {
    id: DEMO_IDS.readyCampaign,
    name: "Ohio plumbing contractors",
    objective: "Reach service managers at growing commercial plumbing firms",
    status: "READY",
    progress: 15,
    prospects: 0,
    qualified: 0,
    drafts: 0,
    sent: 0,
    updated: "Just now",
    color: "teal" as const,
    followUpNeeded: 0,
    followUpDraftId: null,
  },
];

/** The structured ideal customer profile Marlow built from the discovery chat. */
export const demoCampaignProfile: CampaignProfile = {
  campaignObjective:
    "Book 20-minute discovery calls with operations leaders at commercial HVAC contractors",
  sender: {
    name: SENDER.name,
    title: SENDER.title,
    companyName: SENDER.company,
    companyWebsite: "https://fieldline.example",
    sendingMailboxId: "demo-mailbox",
    signature: SENDER.signature,
    postalAddress: SENDER.postalAddress,
  },
  offer: {
    productOrService: "Fieldline dispatch and job costing",
    summary:
      "Scheduling, dispatch, and job-costing software built for commercial mechanical contractors.",
    primaryValue: "One live view of every technician, job, and unbilled hour",
    painsSolved: [
      "Dispatch run from whiteboards and spreadsheets",
      "Unbilled time discovered weeks after the job closes",
      "No shared view across branches",
    ],
    differentiators: ["Built for commercial service agreements", "Branch-level job costing"],
    approvedProof: [{ claim: "Used by mechanical contractors across four Midwest states" }],
    callToAction: "A 20-minute call to compare dispatch workflows",
  },
  targetAccount: {
    industries: ["Commercial HVAC", "Mechanical contracting", "Building services"],
    employeeRange: { min: 50, max: 500 },
    locations: ["Michigan", "Ohio", "Indiana", "Illinois", "Wisconsin"],
    technologies: [],
    keywords: ["service agreements", "preventive maintenance", "commercial mechanical"],
    buyingSignals: [
      "Hiring dispatchers or service coordinators",
      "Opened a new branch in the last 12 months",
      "Publicly growing service-agreement business",
    ],
  },
  targetPersonas: [
    {
      jobFunctions: ["Operations", "Field service"],
      titles: ["VP of Operations", "Director of Service Operations", "COO", "General Manager"],
      seniorities: ["VP", "Director", "C-suite"],
      likelyResponsibilities: ["Dispatch", "Technician utilization", "Branch performance"],
    },
  ],
  disqualifiers: [
    "Residential-only contractors",
    "Fewer than 30 field technicians",
    "Existing Fieldline customers",
  ],
  messaging: {
    tone: "Direct, warm, and conversational",
    maximumWords: 110,
    bannedPhrases: ["synergy", "game-changer", "just checking in"],
  },
  limits: { requestedProspects: 40, dailySendLimit: 25, apolloCreditBudget: 100 },
  readiness: { score: 100, missingRequiredFields: [], unresolvedQuestions: [] },
};

type ProspectStatus = "DRAFTED" | "SENT" | "REPLIED" | "RESEARCHING" | "QUALIFIED" | "SKIPPED";

export type DemoProspect = {
  id: string;
  campaignId: string;
  name: string;
  initials: string;
  title: string;
  company: string;
  location: string;
  employees: number;
  score: number;
  status: ProspectStatus;
  note: string;
  draftId: string | null;
};

type ProspectSeed = Omit<DemoProspect, "id" | "initials" | "draftId"> & { draft?: number };

const prospectSeeds: ProspectSeed[] = [
  // Midwest HVAC operations leaders
  {
    campaignId: DEMO_IDS.campaign,
    name: "Maya Chen",
    title: "VP of Operations",
    company: "Harrowgate Mechanical",
    location: "Grand Rapids, MI",
    employees: 240,
    score: 92,
    status: "DRAFTED",
    note: "Follow-up drafted after 7 days",
    draft: 1,
  },
  {
    campaignId: DEMO_IDS.campaign,
    name: "Daniel Okafor",
    title: "Director of Service Operations",
    company: "Copperline HVAC",
    location: "Columbus, OH",
    employees: 310,
    score: 89,
    status: "DRAFTED",
    note: "Hiring three dispatchers",
    draft: 3,
  },
  {
    campaignId: DEMO_IDS.campaign,
    name: "Rachel Lindqvist",
    title: "Chief Operating Officer",
    company: "Pine & Ridge Facilities",
    location: "Madison, WI",
    employees: 180,
    score: 88,
    status: "DRAFTED",
    note: "New Green Bay branch",
    draft: 4,
  },
  {
    campaignId: DEMO_IDS.campaign,
    name: "Marcus Webb",
    title: "VP of Field Operations",
    company: "Tri-County Climate Services",
    location: "Fort Wayne, IN",
    employees: 135,
    score: 86,
    status: "DRAFTED",
    note: "Service agreements up publicly",
    draft: 5,
  },
  {
    campaignId: DEMO_IDS.campaign,
    name: "Sofia Alvarez",
    title: "Operations Director",
    company: "Lakeshore Building Systems",
    location: "Milwaukee, WI",
    employees: 420,
    score: 84,
    status: "DRAFTED",
    note: "Hiring service coordinator",
    draft: 6,
  },
  {
    campaignId: DEMO_IDS.campaign,
    name: "Ben Hartley",
    title: "General Manager",
    company: "Ironwood Mechanical",
    location: "Toledo, OH",
    employees: 95,
    score: 83,
    status: "DRAFTED",
    note: "Acquired a controls firm",
    draft: 7,
  },
  {
    campaignId: DEMO_IDS.campaign,
    name: "Priya Raman",
    title: "Director of Operations",
    company: "Summit Air Partners",
    location: "Naperville, IL",
    employees: 160,
    score: 81,
    status: "DRAFTED",
    note: "Expanding preventive maintenance",
    draft: 8,
  },
  {
    campaignId: DEMO_IDS.campaign,
    name: "Tom Kessler",
    title: "VP of Operations",
    company: "Keystone Comfort Group",
    location: "Dayton, OH",
    employees: 275,
    score: 87,
    status: "REPLIED",
    note: "Replied, asked for Tuesday",
  },
  {
    campaignId: DEMO_IDS.campaign,
    name: "Aisha Grant",
    title: "Chief Operating Officer",
    company: "Northgate Service Co.",
    location: "Ann Arbor, MI",
    employees: 205,
    score: 85,
    status: "SENT",
    note: "Sent 2 days ago via Gmail",
  },
  {
    campaignId: DEMO_IDS.campaign,
    name: "Luis Moreno",
    title: "Service Operations Manager",
    company: "Bluewater Mechanical",
    location: "Saginaw, MI",
    employees: 70,
    score: 80,
    status: "SENT",
    note: "Sent 4 days ago via Gmail",
  },
  {
    campaignId: DEMO_IDS.campaign,
    name: "Hannah Brooks",
    title: "Director of Field Service",
    company: "Redline Refrigeration & Air",
    location: "Indianapolis, IN",
    employees: 150,
    score: 78,
    status: "RESEARCHING",
    note: "Reading 3 public sources",
  },
  {
    campaignId: DEMO_IDS.campaign,
    name: "Greg Novak",
    title: "VP of Operations",
    company: "Westbrook Mechanical",
    location: "Cleveland, OH",
    employees: 330,
    score: 77,
    status: "RESEARCHING",
    note: "Verifying branch count",
  },
  {
    campaignId: DEMO_IDS.campaign,
    name: "Nina Petrov",
    title: "Operations Lead",
    company: "Elmhurst Climate",
    location: "Rockford, IL",
    employees: 60,
    score: 58,
    status: "SKIPPED",
    note: "Residential-only work",
  },
  {
    campaignId: DEMO_IDS.campaign,
    name: "Owen Fitzgerald",
    title: "Owner",
    company: "Fitzgerald Heating",
    location: "Lansing, MI",
    employees: 12,
    score: 41,
    status: "SKIPPED",
    note: "Below 30 technicians",
  },
  // Facilities services expansion
  {
    campaignId: DEMO_IDS.facilitiesCampaign,
    name: "Jon Bell",
    title: "Chief Operating Officer",
    company: "Brightline Facility Services",
    location: "Chicago, IL",
    employees: 460,
    score: 87,
    status: "DRAFTED",
    note: "Opened a third regional hub",
    draft: 2,
  },
  {
    campaignId: DEMO_IDS.facilitiesCampaign,
    name: "Carmen Ortiz",
    title: "VP of Operations",
    company: "Meridian Property Services",
    location: "Detroit, MI",
    employees: 290,
    score: 82,
    status: "RESEARCHING",
    note: "Reading 2 public sources",
  },
  {
    campaignId: DEMO_IDS.facilitiesCampaign,
    name: "Ethan Park",
    title: "Director of Operations",
    company: "Halcyon Building Maintenance",
    location: "Minneapolis, MN",
    employees: 220,
    score: 79,
    status: "QUALIFIED",
    note: "Queued for research",
  },
  {
    campaignId: DEMO_IDS.facilitiesCampaign,
    name: "Grace Whitman",
    title: "Regional Operations Director",
    company: "Stonebridge Facilities",
    location: "St. Louis, MO",
    employees: 380,
    score: 74,
    status: "SKIPPED",
    note: "Existing customer",
  },
  // Commercial refrigeration pilot
  {
    campaignId: DEMO_IDS.refrigerationCampaign,
    name: "Victor Hale",
    title: "VP of Service",
    company: "Coldfront Refrigeration",
    location: "Louisville, KY",
    employees: 115,
    score: 83,
    status: "SENT",
    note: "Sent last week via Outlook",
  },
  {
    campaignId: DEMO_IDS.refrigerationCampaign,
    name: "Leah Sorensen",
    title: "Operations Manager",
    company: "Polar Systems Group",
    location: "Des Moines, IA",
    employees: 88,
    score: 76,
    status: "QUALIFIED",
    note: "Paused before research",
  },
];

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const draftId = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const demoProspects: DemoProspect[] = prospectSeeds.map(({ draft, ...seed }, index) => ({
  ...seed,
  id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  initials: initials(seed.name),
  draftId: draft ? draftId(draft) : null,
}));

type DraftSource = { title: string; path: string; sourceType: string; date: string };
type DraftSeed = {
  n: number;
  prospect: string;
  domain: string;
  subject: string;
  body: string;
  kind?: "FOLLOW_UP";
  selectionReason: string;
  companySummary: string;
  signals: string[];
  angle: string;
  uncertainty: string;
  sources: DraftSource[];
};

const draftSeeds: DraftSeed[] = [
  {
    n: 1,
    prospect: "Maya Chen",
    domain: "harrowgate.example",
    kind: "FOLLOW_UP",
    subject: "Re: Dispatch across the Lansing branch",
    body: "Maya, following up on my note about keeping dispatch consistent as Harrowgate brings the Lansing branch online. If a single view of technicians and unbilled hours across both sites is still on your list, I would be glad to show how other commercial mechanical teams set it up.\n\nWould 20 minutes next week be useful?",
    selectionReason:
      "VP-level operations owner, 240 employees, and a new branch in the last 90 days",
    companySummary:
      "Harrowgate Mechanical is a 240-person commercial HVAC and mechanical contractor in West Michigan that opened a second branch in Lansing this summer.",
    signals: ["Opened Lansing branch", "Hiring two dispatchers", "240 employees"],
    angle: "Keep dispatch and job costing consistent while a second branch ramps up.",
    uncertainty:
      "The careers page confirms dispatcher hiring but does not say how dispatch is run today.",
    sources: [
      {
        title: "Harrowgate opens Lansing branch",
        path: "/news/lansing",
        sourceType: "Official press release",
        date: "Jul 11, 2026",
      },
      {
        title: "Harrowgate Careers: Dispatcher",
        path: "/careers/dispatcher",
        sourceType: "Official job posting",
        date: "Jul 19, 2026",
      },
    ],
  },
  {
    n: 2,
    prospect: "Jon Bell",
    domain: "brightline-fs.example",
    subject: "Three hubs, one dispatch board",
    body: "Jon, congratulations on opening Brightline’s third regional hub. Fieldline helps multi-site facilities teams see every technician and open work order in one place, so a new hub does not mean a new spreadsheet.\n\nWould a short comparison of how you dispatch today be useful next week?",
    selectionReason: "COO at a 460-person multi-site firm with a recent expansion",
    companySummary:
      "Brightline Facility Services provides commercial building maintenance across the Chicago metro from three regional hubs.",
    signals: ["Opened a third regional hub", "Hiring site leads"],
    angle: "Visibility across sites during network expansion.",
    uncertainty: "No public information on current dispatch software was found.",
    sources: [
      {
        title: "Brightline newsroom: Joliet hub",
        path: "/news/joliet-hub",
        sourceType: "Official press release",
        date: "Jul 15, 2026",
      },
    ],
  },
  {
    n: 3,
    prospect: "Daniel Okafor",
    domain: "copperline.example",
    subject: "Three new dispatchers at Copperline",
    body: "Daniel, I noticed Copperline is hiring three dispatchers at once, which usually means the board is getting crowded. Fieldline gives service teams one live view of technicians, open calls, and unbilled hours so new dispatchers ramp faster.\n\nOpen to a 20-minute look next week?",
    selectionReason: "Owns service operations; hiring signal matches the campaign exactly",
    companySummary:
      "Copperline HVAC is a 310-person commercial HVAC service contractor serving central Ohio.",
    signals: ["Hiring three dispatchers", "310 employees", "Service-agreement focus"],
    angle: "Help a growing dispatch team ramp without losing visibility.",
    uncertainty: "Hiring volume is public; current tooling is not.",
    sources: [
      {
        title: "Copperline Careers",
        path: "/careers",
        sourceType: "Official job posting",
        date: "Jul 21, 2026",
      },
      {
        title: "Copperline service agreements",
        path: "/service-agreements",
        sourceType: "Company website",
        date: "Jul 2026",
      },
    ],
  },
  {
    n: 4,
    prospect: "Rachel Lindqvist",
    domain: "pineridge.example",
    subject: "Green Bay and Madison on one schedule",
    body: "Rachel, Pine & Ridge’s new Green Bay branch caught my eye. When a second location opens, the hardest part is usually seeing both schedules and both P&Ls without stitching reports together.\n\nFieldline handles that for commercial mechanical teams. Worth a quick conversation?",
    selectionReason: "COO with branch expansion, inside size and geography range",
    companySummary:
      "Pine & Ridge Facilities is a 180-person mechanical and facilities contractor headquartered in Madison, Wisconsin.",
    signals: ["Opened Green Bay branch", "180 employees"],
    angle: "Branch-level job costing as the company adds locations.",
    uncertainty: "The announcement does not state the branch headcount.",
    sources: [
      {
        title: "Pine & Ridge expands to Green Bay",
        path: "/news/green-bay",
        sourceType: "Official press release",
        date: "Jun 30, 2026",
      },
    ],
  },
  {
    n: 5,
    prospect: "Marcus Webb",
    domain: "tricountyclimate.example",
    subject: "Service agreements at Tri-County",
    body: "Marcus, Tri-County’s push to grow service agreements stood out. More agreements usually means more preventive maintenance visits to schedule and more hours to bill accurately.\n\nFieldline keeps those visits, technicians, and billable time in one view. Would a short call be helpful?",
    selectionReason: "Field operations owner at a company publicly growing recurring service",
    companySummary:
      "Tri-County Climate Services is a 135-person commercial HVAC contractor in northeast Indiana.",
    signals: ["Growing service-agreement program", "135 employees"],
    angle: "Scheduling preventive maintenance at scale.",
    uncertainty: "Agreement growth is described qualitatively, without numbers.",
    sources: [
      {
        title: "Tri-County maintenance plans",
        path: "/maintenance-plans",
        sourceType: "Company website",
        date: "Jul 2026",
      },
    ],
  },
  {
    n: 6,
    prospect: "Sofia Alvarez",
    domain: "lakeshorebuilding.example",
    subject: "Your new service coordinator role",
    body: "Sofia, I saw Lakeshore is hiring a service coordinator to sit between dispatch and billing. That role tends to exist because jobs close before anyone knows what they cost.\n\nFieldline ties each visit to its hours and parts as it happens. Open to comparing notes for 20 minutes?",
    selectionReason: "Operations director at the top of the size range with a matching hire",
    companySummary:
      "Lakeshore Building Systems is a 420-person mechanical, controls, and service contractor in Milwaukee.",
    signals: ["Hiring service coordinator", "420 employees"],
    angle: "Close the gap between dispatch and billing.",
    uncertainty: "The posting does not mention software, so the pain is inferred.",
    sources: [
      {
        title: "Lakeshore Careers: Service Coordinator",
        path: "/careers/service-coordinator",
        sourceType: "Official job posting",
        date: "Jul 17, 2026",
      },
    ],
  },
  {
    n: 7,
    prospect: "Ben Hartley",
    domain: "ironwoodmech.example",
    subject: "Bringing the controls team onto one board",
    body: "Ben, congratulations on Ironwood’s acquisition of a building controls firm. Merging two field teams usually means two schedules for a while.\n\nFieldline gives mechanical contractors one dispatch board and per-job costing across crews. Would a short walkthrough be useful as you integrate?",
    selectionReason: "General manager at a 95-person firm with a recent acquisition",
    companySummary:
      "Ironwood Mechanical is a 95-person commercial mechanical contractor in Toledo.",
    signals: ["Acquired a controls company", "95 employees"],
    angle: "Unifying dispatch after an acquisition.",
    uncertainty: "Acquisition terms and team size were not disclosed.",
    sources: [
      {
        title: "Ironwood acquires controls partner",
        path: "/news/acquisition",
        sourceType: "Official press release",
        date: "Jul 8, 2026",
      },
    ],
  },
  {
    n: 8,
    prospect: "Priya Raman",
    domain: "summitair.example",
    subject: "Preventive maintenance at Summit Air",
    body: "Priya, Summit Air’s new preventive maintenance offering looks like a strong recurring revenue play. The tricky part is usually scheduling those visits around emergency calls without overbooking technicians.\n\nFieldline helps commercial HVAC teams balance both. Would 20 minutes next week work?",
    selectionReason: "Operations director at a contractor launching recurring maintenance",
    companySummary:
      "Summit Air Partners is a 160-person commercial HVAC contractor in the western Chicago suburbs.",
    signals: ["Launched maintenance program", "160 employees"],
    angle: "Balancing scheduled maintenance with emergency calls.",
    uncertainty: "Launch date is inferred from the page update.",
    sources: [
      {
        title: "Summit Air preventive maintenance",
        path: "/maintenance",
        sourceType: "Company website",
        date: "Jul 2026",
      },
    ],
  },
];

export const demoDrafts = draftSeeds.map((seed) => {
  const prospect = demoProspects.find((item) => item.name === seed.prospect)!;
  const firstName = prospect.name.split(" ")[0]!.toLowerCase();
  return {
    id: draftId(seed.n),
    campaignId: prospect.campaignId,
    prospectId: prospect.id,
    name: prospect.name,
    initials: prospect.initials,
    title: prospect.title,
    company: prospect.company,
    location: prospect.location,
    email: `${firstName}@${seed.domain}`,
    emailStatus: "Verified",
    score: prospect.score,
    subject: seed.subject,
    body: seed.body,
    signature: SENDER.signature,
    postalAddress: SENDER.postalAddress,
    complianceFooter: COMPLIANCE_FOOTER,
    mailboxId: "demo-mailbox",
    mailbox: SENDER.mailbox,
    sendingProvider: "GMAIL",
    draftKind: (seed.kind ?? "INITIAL") as "INITIAL" | "FOLLOW_UP",
    followUpNumber: seed.kind ? 1 : 0,
    parentEmailSendId: seed.kind ? "80000000-0000-4000-8000-000000000001" : null,
    selectionReason: seed.selectionReason,
    companySummary: seed.companySummary,
    signals: seed.signals,
    angle: seed.angle,
    uncertainty: seed.uncertainty,
    sources: seed.sources.map((source, index) => ({
      id: `60000000-0000-4000-8000-${String(seed.n * 10 + index).padStart(12, "0")}`,
      title: source.title,
      url: `https://${seed.domain}${source.path}`,
      sourceType: source.sourceType,
      date: source.date,
      confidence: "High",
    })),
  };
});

export const demoActivity = [
  {
    id: "a1",
    text: "Follow-up drafted for Maya Chen",
    detail: "No reply after 7 days · Harrowgate Mechanical",
    time: "Just now",
    type: "draft",
  },
  {
    id: "a2",
    text: "Researching Redline Refrigeration & Air",
    detail: "3 public sources found",
    time: "2m",
    type: "research",
  },
  {
    id: "a3",
    text: "Reply detected from Tom Kessler",
    detail: "Keystone Comfort Group · follow-up cancelled",
    time: "11m",
    type: "sent",
  },
  {
    id: "a4",
    text: "Skipped Nina Petrov",
    detail: "Score 58 · residential-only contractor",
    time: "18m",
    type: "skipped",
  },
  {
    id: "a5",
    text: "Qualified 14 of 34 Apollo matches",
    detail: "Midwest HVAC operations leaders",
    time: "24m",
    type: "qualified",
  },
];

/** A completed discovery conversation for the campaign that is ready to start. */
export const demoReadyDiscovery = {
  messages: [
    {
      role: "assistant" as const,
      content: "Tell me about your company, what you sell, and who you’re trying to reach.",
      activity: [],
    },
    {
      role: "user" as const,
      content:
        "We’re Fieldline (fieldline.example). Dispatch and job costing software for commercial contractors. This campaign is for commercial plumbing firms in Ohio.",
      activity: [],
    },
    {
      role: "assistant" as const,
      content:
        "I read fieldline.example and saved the offer: **one live view of every technician, job, and unbilled hour**. Which roles feel the dispatch pain most at a plumbing contractor?",
      activity: [
        {
          id: "site",
          kind: "tool" as const,
          label: "Company website",
          detail: "Read 4 public pages on fieldline.example.",
          status: "complete" as const,
        },
      ],
    },
    {
      role: "user" as const,
      content:
        "Service managers and operations directors. 40 to 300 employees. Skip residential-only shops.",
      activity: [],
    },
    {
      role: "assistant" as const,
      content:
        "Got it. Here is the profile I’ll search with:\n\n- **Accounts:** commercial plumbing contractors in Ohio, 40 to 300 employees\n- **Personas:** Service Manager, Director of Operations, VP of Operations\n- **Signals:** hiring dispatchers, new branches, service-agreement growth\n- **Excluded:** residential-only shops and existing customers\n- **Limits:** 30 prospects, 60 Apollo credits, 25 sends per day\n\nEvery email will wait in your review queue. Nothing is sent until you approve it.",
      activity: [
        {
          id: "validate",
          kind: "validation" as const,
          label: "Readiness check",
          detail: "All required fields are complete.",
          status: "complete" as const,
        },
      ],
    },
  ],
  readinessScore: 100,
  missingRequiredFields: [] as string[],
  unresolvedQuestions: [] as string[],
};

export const demoSendingSettings = {
  defaultMailboxId: "demo-mailbox",
  senderName: SENDER.name,
  senderTitle: SENDER.title,
  postalAddress: SENDER.postalAddress,
  unsubscribeText: "Not relevant? Reply and I won’t follow up.",
  unsubscribeUrl: "",
  dailyLimit: 25,
  organizationDailyLimit: 100,
  quietHoursStart: "18:00",
  quietHoursEnd: "08:00",
  timezone: "America/Detroit",
  allowedDays: [1, 2, 3, 4, 5],
};

export const demoSuppressions = [
  {
    id: "sup-1",
    type: "DOMAIN",
    value: "stonebridge-facilities.example",
    reason: "Existing customer",
    source: "User block",
    createdAt: "Jul 12, 2026",
  },
  {
    id: "sup-2",
    type: "EMAIL",
    value: "optout@example.com",
    reason: "Unsubscribed",
    source: "Unsubscribe",
    createdAt: "Jul 9, 2026",
  },
  {
    id: "sup-3",
    type: "COMPANY",
    value: "Internal Test Co",
    reason: "Internal test account",
    source: "Admin block",
    createdAt: "Jun 28, 2026",
  },
];
