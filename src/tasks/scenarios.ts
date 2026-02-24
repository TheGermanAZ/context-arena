import type { LLMMessage } from "../utils/llm";

export interface Scenario {
  name: string;
  description: string;
  // The conversation steps — alternating user messages that build context
  steps: string[];
  // The final question that tests memory
  finalQuestion: string;
  // Function to check if the answer is correct
  checkAnswer: (answer: string) => boolean;
  // System prompt for the agent during the scenario
  systemPrompt: string;
}

/**
 * Scenario 1: EARLY FACT RECALL
 * Tests whether the agent remembers specific details from the very beginning
 * of a long conversation after many intervening messages.
 */
const earlyFactRecall: Scenario = {
  name: "Early Fact Recall",
  description:
    "Can the agent remember specific facts stated at the beginning after 20+ exchanges?",
  systemPrompt:
    "You are a helpful assistant managing a project. Answer questions based on what you've been told in this conversation. If you don't know something, say so.",
  steps: [
    "Our project is called Mercury. The budget is exactly $347,250. The deadline is March 15, 2027. The project lead is Dr. Sarah Chen.",
    "We need to hire 3 backend engineers and 2 frontend engineers. The backend engineers will work on the API layer using Rust.",
    "The first milestone is the database schema design, due January 10, 2027. Use PostgreSQL with TimescaleDB extension.",
    "Actually, I need to update something. The frontend team will use Svelte, not React. Everything else stays the same.",
    "We had a meeting today. The stakeholders want weekly progress reports sent every Friday at 3pm EST.",
    "The QA team lead is Marcus Williams. He wants integration tests to cover at least 85% of API endpoints.",
    "We got approval to use AWS us-east-1 region for production. The staging environment will be in us-west-2.",
    "The design team finished the mockups. There are 47 screens total. The login flow has 5 screens.",
    "Legal reviewed the contracts. The data retention policy requires 7 years of audit logs.",
    "We need to integrate with three external APIs: Stripe for payments, SendGrid for email, and Twilio for SMS.",
    "The security audit is scheduled for February 28, 2027. We need SOC 2 Type II compliance.",
    "HR confirmed the salary ranges. Backend engineers: $145k-$175k. Frontend engineers: $130k-$160k.",
    "The mobile app is a phase 2 deliverable. Phase 1 is web only. Mobile should start after the March deadline.",
    "Infrastructure costs are estimated at $12,400 per month for production. Staging is roughly $3,100 per month.",
    "The project sponsor is VP of Engineering, James Rodriguez. He reports to the CTO, Lisa Park.",
    "We decided on two-week sprints. Sprint 1 starts January 6, 2027. Sprint reviews are on Fridays.",
    "The API rate limit should be 1000 requests per minute for standard tier, 5000 for premium tier.",
    "Customer data must be encrypted at rest using AES-256 and in transit using TLS 1.3.",
    "The backup strategy is: full backup daily at 2am UTC, incremental every 6 hours, retained for 30 days.",
    "Performance requirements: API response time p95 under 200ms, page load time under 2 seconds.",
  ],
  finalQuestion:
    "I need a summary for the board. What is the exact project budget, who is the project lead, what is the deadline, and what frontend framework are we using?",
  checkAnswer: (answer: string) => {
    const lower = answer.toLowerCase();
    return (
      lower.includes("347,250") &&
      lower.includes("sarah chen") &&
      lower.includes("march 15") &&
      lower.includes("2027") &&
      lower.includes("svelte")
    );
  },
};

/**
 * Scenario 2: STATE CHANGE TRACKING
 * Tests whether the agent correctly tracks updates/corrections to previously stated facts.
 */
const stateChangeTracking: Scenario = {
  name: "State Change Tracking",
  description:
    "Can the agent track updates and corrections across a long conversation?",
  systemPrompt:
    "You are tracking inventory for a warehouse. Keep track of all items and their quantities. When asked, report the CURRENT state based on all updates.",
  steps: [
    "We just received a shipment. Add to inventory: 500 units of Widget-A, 300 units of Widget-B, 200 units of Gadget-X.",
    "A customer ordered 50 units of Widget-A. Remove them from inventory.",
    "Quality control found 15 defective units of Widget-B. Remove them from inventory.",
    "New shipment arrived: 100 more units of Widget-A and 75 units of a new item called Gizmo-Z.",
    "Customer returned 10 units of Widget-A (from the earlier order). Add them back.",
    "We're discontinuing Gadget-X. Move all remaining units to the clearance section. The count stays the same but mark it as clearance.",
    "Warehouse fire damaged 30 units of Widget-B. Remove them from inventory.",
    "Emergency order: customer needs 200 units of Widget-A shipped today. Remove from inventory.",
    "Received a bulk shipment: 1000 units of Widget-B to replace damaged and sold stock.",
    "Internal transfer: send 50 units of Gizmo-Z to the downtown location. Remove from our inventory.",
    "Year-end audit correction: we actually had 10 more Widget-A than we thought. Add 10 to inventory.",
    "Customer ordered 100 units of Widget-B and 25 units of Gizmo-Z.",
    "New product launch: add 400 units of MegaPart-Q to inventory.",
    "Widget-A price change to $24.99 per unit (was $19.99). Quantities unchanged.",
    "Transfer 150 units of Widget-B to the east warehouse.",
  ],
  finalQuestion:
    "What is the current inventory count for each item at our location? List every item with its exact quantity.",
  checkAnswer: (answer: string) => {
    // Widget-A: 500 - 50 + 100 + 10 - 200 + 10 = 370
    // Widget-B: 300 - 15 - 30 + 1000 - 100 - 150 = 1005
    // Gadget-X: 200 (clearance)
    // Gizmo-Z: 75 - 50 - 25 = 0
    // MegaPart-Q: 400
    const lower = answer.toLowerCase();
    const hasWidgetA = answer.includes("370");
    const hasWidgetB = answer.includes("1005") || answer.includes("1,005");
    const hasGadgetX = answer.includes("200");
    const hasMegaPartQ = answer.includes("400");
    // Gizmo-Z should be 0
    const hasGizmoZ =
      lower.includes("gizmo") && (answer.includes(" 0") || lower.includes("zero") || lower.includes("none"));

    return hasWidgetA && hasWidgetB && hasGadgetX && hasMegaPartQ;
  },
};

/**
 * Scenario 3: CONTRADICTION RESOLUTION
 * Tests whether the agent correctly identifies and resolves conflicting information.
 */
const contradictionResolution: Scenario = {
  name: "Contradiction Resolution",
  description:
    "Can the agent handle conflicting information and use the most recent version?",
  systemPrompt:
    "You are a travel assistant planning a trip. Remember all details and always use the most recent information when details change.",
  steps: [
    "I'm planning a trip to Tokyo. I want to go from June 1 to June 14. My budget is $5,000.",
    "I found a flight on ANA airlines for $1,200 round trip. Let's book that.",
    "For the hotel, I want to stay at the Park Hyatt Tokyo. It's $450 per night.",
    "Actually, I just checked and the Park Hyatt is fully booked. Let's switch to the Aman Tokyo at $800 per night.",
    "I want to visit the Tsukiji fish market on June 3. Wait, I just learned it moved to Toyosu. So Toyosu Market on June 3.",
    "My friend Kenji lives in Shibuya. His phone number is 090-1234-5678. Let's plan dinner with him on June 5.",
    "Budget update: my boss approved a travel bonus. New budget is $8,500 instead of $5,000.",
    "Wait, I made an error. The Aman Tokyo is actually $600 per night, not $800. I was looking at the wrong room type.",
    "Change of plans: Kenji moved to Shinjuku last month. And his new number is 090-8765-4321.",
    "I want to take the bullet train to Kyoto on June 7, return June 9. That's a round trip ticket at approximately $280.",
    "Actually, let's extend the trip. New dates: June 1 to June 18. Same flights, just changing the return date.",
    "The ANA flight change fee is $150, so the total flight cost is now $1,350.",
    "I found a cooking class in Kyoto on June 8 for $95. And a tea ceremony for $60 on the same day.",
    "Kenji actually wants to meet on June 10 instead of June 5. He's busy that first week.",
    "One more thing: I found the Aman has a deal — $500 per night if I book for 10+ nights. Since I'm staying 17 nights, that applies.",
  ],
  finalQuestion:
    "Give me a complete trip summary: dates, total budget, flight cost, hotel name and nightly rate, total hotel cost for my stay, Kenji's neighborhood and phone number, and when I'm meeting Kenji.",
  checkAnswer: (answer: string) => {
    const lower = answer.toLowerCase();
    return (
      lower.includes("june 1") &&
      (lower.includes("june 18") || lower.includes("june 18th") || lower.includes("1-18") || lower.includes("1–18") || lower.includes("1 to june 18") || lower.includes("1 - 18")) &&
      lower.includes("8,500") &&
      lower.includes("1,350") &&
      lower.includes("aman") &&
      lower.includes("500") &&
      lower.includes("shinjuku") &&
      lower.includes("090-8765-4321") &&
      lower.includes("june 10")
    );
  },
};

/**
 * Scenario 4: MULTI-HOP REASONING
 * Tests whether the agent can connect information from different parts of the conversation.
 */
const multiHopReasoning: Scenario = {
  name: "Multi-hop Reasoning",
  description:
    "Can the agent connect scattered facts to answer a question that requires combining multiple pieces?",
  systemPrompt:
    "You are helping organize a company event. Remember all details carefully. You may need to combine information from different parts of our conversation.",
  steps: [
    "We're planning the annual company retreat. It's at the Aspen Mountain Lodge.",
    "The engineering team has 24 people. The sales team has 18. Marketing has 12. HR has 6.",
    "Room assignments: engineering gets floor 3, sales gets floor 2, marketing gets floor 4, HR gets floor 1.",
    "Each floor has exactly 8 rooms. Each room can hold up to 4 people.",
    "The conference room on floor 2 holds 30 people. Floor 3's conference room holds 50. Floor 4's holds 20.",
    "Day 1 agenda: morning keynote (everyone), afternoon team breakout sessions (each team separately).",
    "The keynote speaker is our CEO, Patricia Walsh. The keynote is in the largest conference room available.",
    "Lunch is catered by Alpine Gourmet. Cost is $35 per person per meal. We have 3 catered meals total.",
    "Day 2 has a cross-team hackathon. Teams of 5, mixing departments. That's in the floor 3 conference room.",
    "The outdoor adventure activity is on Day 2 afternoon. It costs $75 per person. Only 40 people signed up.",
    "Transportation: 2 charter buses, each holding 30 people. Departure from Denver at 8am.",
    "The event photographer charges $2,000 for both days. The DJ for the evening party charges $1,500.",
    "Dietary restrictions: 8 people are vegetarian, 3 are vegan, 2 have nut allergies.",
    "The evening party on Day 1 is on the rooftop. Capacity is 80 people. Open bar costs $45 per person.",
    "Budget note: the department heads each contributed from their budget. Engineering: $15k, Sales: $10k, Marketing: $8k, HR: $5k.",
  ],
  finalQuestion:
    "Answer these questions: 1) What is the total number of attendees? 2) What is the total catering cost for all meals? 3) Which floor is the keynote in and why? 4) What is the total budget from all departments? 5) Will everyone fit on the charter buses?",
  checkAnswer: (answer: string) => {
    // Total: 24 + 18 + 12 + 6 = 60
    // Catering: 60 people × $35 × 3 meals = $6,300
    // Keynote: Floor 3 (50 people, largest room — but 60 people won't fit)
    // Budget: 15k + 10k + 8k + 5k = $38,000
    // Buses: 2 × 30 = 60 seats for 60 people — exactly fits
    const lower = answer.toLowerCase();
    return (
      answer.includes("60") &&
      (answer.includes("6,300") || answer.includes("6300")) &&
      lower.includes("floor 3") &&
      (answer.includes("38,000") || answer.includes("38000")) &&
      (lower.includes("exactly") ||
        lower.includes("yes") ||
        lower.includes("just fit") ||
        lower.includes("60 seats") ||
        lower.includes("will fit"))
    );
  },
};

/**
 * Scenario 5: LONG-HORIZON TASK WITH NOISE
 * Tests memory when mixed with lots of irrelevant conversation (chit-chat, digressions).
 */
const longHorizonWithNoise: Scenario = {
  name: "Long Horizon + Noise",
  description:
    "Can the agent extract signal from noise over a long, meandering conversation?",
  systemPrompt:
    "You are a personal assistant. Help with whatever the user needs and remember important details.",
  steps: [
    "I need to remember this for later: my doctor appointment is with Dr. Martinez at 2:30pm on Thursday at the Riverside Medical Center. My patient ID is RMC-2847.",
    "Oh by the way, did you see that game last night? The Lakers won 112-108. LeBron had 34 points. Crazy game.",
    "What's a good recipe for chicken tikka masala? I want to make it this weekend.",
    "Hmm, I should also note that my prescription is for Lisinopril 10mg, taken once daily in the morning.",
    "Actually, speaking of food, my wife's birthday is coming up on March 8th. I should plan something special.",
    "Can you explain how blockchain works? I keep hearing about it at work.",
    "Oh wait, I need to remember: the car needs an oil change. The mechanic's number is 555-0147. He said to bring it in before 40,000 miles and we're at 38,500.",
    "What's the weather usually like in Cancun in April? We might go for spring break.",
    "Random thought: do you think AI will replace software engineers? I've been thinking about this a lot.",
    "Important: my son's school play is on Friday March 14 at 6pm at Jefferson Elementary. He's playing the lead role as Peter Pan.",
    "Can you write me a haiku about winter?",
    "I need to call the insurance company. The policy number is HLT-99284-B. The claim reference is CLM-2024-0892.",
    "What are some good books about leadership? My manager recommended one but I forgot the title.",
    "My wife likes peonies and her favorite restaurant is Bella Notte on Main Street. Maybe I should book a table for her birthday.",
    "Tell me a fun fact about octopuses.",
    "Almost forgot: the house alarm code changed to 8472. The old one was 1234. Security company is SafeGuard.",
    "What's the difference between a crocodile and an alligator?",
    "Reminder: renew my passport before June. The current one expires July 3. Passport number is P-847291.",
    "Can you help me understand the difference between term life and whole life insurance?",
    "Last thing: my flight to Denver on March 20 is United flight UA447, departing at 7:15am from gate B12. Confirmation code XKRM47.",
  ],
  finalQuestion:
    "I need all my important personal information: 1) Doctor appointment details including patient ID, 2) My prescription, 3) Car mechanic's number and mileage situation, 4) Son's school play details, 5) Insurance policy and claim numbers, 6) House alarm code, 7) Flight details and confirmation code. Just the facts, no fluff.",
  checkAnswer: (answer: string) => {
    const checks = [
      answer.includes("Martinez") && answer.includes("2:30") && answer.includes("RMC-2847"),
      answer.toLowerCase().includes("lisinopril") && answer.includes("10mg"),
      answer.includes("555-0147"),
      answer.includes("Jefferson") && answer.includes("Peter Pan"),
      answer.includes("HLT-99284-B") && answer.includes("CLM-2024-0892"),
      answer.includes("8472"),
      answer.includes("UA447") && answer.includes("XKRM47"),
    ];
    return checks.filter(Boolean).length >= 5; // At least 5 of 7
  },
};

export const ALL_SCENARIOS: Scenario[] = [
  earlyFactRecall,
  stateChangeTracking,
  contradictionResolution,
  multiHopReasoning,
  longHorizonWithNoise,
];
