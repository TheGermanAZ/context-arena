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

/**
 * Scenario 6: CASCADING CORRECTIONS
 * Tests whether correcting one fact propagates to derived/dependent facts.
 * Changing the round size should change post-money valuation, dilution, ownership %.
 */
const cascadingCorrections: Scenario = {
  name: "Cascading Corrections",
  description:
    "When one fact changes, do dependent/derived facts update correctly?",
  systemPrompt:
    "You are a startup financial advisor. Track all deal terms precisely. When a number changes, recalculate all dependent figures. Always use the most recent values for calculations.",
  steps: [
    "We're raising a seed round. The pre-money valuation is $10M. We're raising $2M. So the post-money valuation is $12M and total dilution is 16.67%.",
    "Our lead investor is Sequoia. They're putting in $1M of the $2M round. So Sequoia gets 8.33% ownership.",
    "The second investor is Y Combinator with $500K. That's 4.17% ownership. The remaining $500K is from angels.",
    "Legal fees are estimated at $50K, paid from the round proceeds. So we net $1.95M in usable capital.",
    "We have 10M shares outstanding pre-round. At $10M pre-money, that's $1.00 per share. New shares issued: 2M shares at $1.00 each.",
    "Our runway with $1.95M net proceeds at $150K monthly burn rate is 13 months.",
    "The board structure will be: 2 founder seats, 1 Sequoia seat, 1 independent. Sequoia gets the seat because they're the lead.",
    "Actually, I just got off the phone. We're raising $3M, not $2M. The pre-money valuation stays at $10M.",
    "Sequoia is now putting in $1.5M of the $3M round. Y Combinator stays at $500K. Angels cover the remaining $1M.",
    "Legal fees went up too: $75K now. So net proceeds are $2.925M.",
    "Oh, and our burn rate increased to $175K per month because we're hiring a head of sales.",
    "One more update: the pre-money valuation was renegotiated to $12M, not $10M. Round size stays at $3M.",
    "Sequoia's investment amount stays at $1.5M. YC stays at $500K. Angels still $1M.",
    "The share price needs to be recalculated based on the new $12M pre-money with 10M shares outstanding. That's $1.20 per share now.",
  ],
  finalQuestion:
    "Give me the final deal summary: 1) Pre-money valuation, 2) Round size, 3) Post-money valuation, 4) Total dilution percentage, 5) Sequoia's ownership percentage, 6) Net proceeds after legal fees, 7) Monthly burn rate, 8) Runway in months.",
  checkAnswer: (answer: string) => {
    // Pre-money: $12M
    // Round size: $3M
    // Post-money: $12M + $3M = $15M
    // Total dilution: $3M / $15M = 20%
    // Sequoia: $1.5M / $15M = 10%
    // Net proceeds: $3M - $75K = $2.925M
    // Burn: $175K/month
    // Runway: $2.925M / $175K = 16.7 months ≈ 16-17 months
    const lower = answer.toLowerCase();
    const checks = [
      (lower.includes("12") && lower.includes("pre-money")) || answer.includes("$12M") || answer.includes("12,000,000") || lower.includes("$12 million"),
      answer.includes("$15M") || answer.includes("15,000,000") || lower.includes("$15 million") || /post.money.*15|15.*post.money/i.test(answer),
      answer.includes("20%") || answer.includes("20 %") || lower.includes("20 percent"),
      answer.includes("10%") || answer.includes("10 %") || lower.includes("10 percent"),
      answer.includes("2.925") || answer.includes("2,925"),
      answer.includes("175") && (lower.includes("burn") || lower.includes("month")),
      /\b1[67]\b/.test(answer) && lower.includes("month"),
    ];
    // Need at least 5 of 7 correct
    return checks.filter(Boolean).length >= 5;
  },
};

/**
 * Scenario 7: IMPLICIT CORRECTIONS
 * Tests whether the agent detects corrections that have NO signal words.
 * No "actually", "wait", "change" — just restated values that differ from earlier ones.
 */
const implicitCorrections: Scenario = {
  name: "Implicit Corrections",
  description:
    "Can the agent detect corrections when there are no signal words like 'actually' or 'wait'?",
  systemPrompt:
    "You are a personal chef assistant. Track all recipe details precisely. The user may restate ingredients or instructions — always use the most recently stated value for any item.",
  steps: [
    "I'm making a three-course dinner. Appetizer: bruschetta. Main: pan-seared salmon. Dessert: tiramisu.",
    "For the bruschetta: 6 Roma tomatoes, 4 cloves garlic, fresh basil, baguette, olive oil, balsamic vinegar. Serves 4.",
    "Salmon recipe: 4 salmon fillets (6oz each), 2 tablespoons butter, lemon juice, capers, dill. Cook at 400°F for 12 minutes.",
    "Side dish with the salmon: roasted asparagus. 1 bunch asparagus, olive oil, salt, pepper. Roast at 425°F for 10 minutes.",
    "Tiramisu: 6 egg yolks, 3/4 cup sugar, 1 1/3 cups mascarpone, 2 cups heavy cream, 2 cups espresso, 3 tablespoons coffee liqueur, 24 ladyfingers.",
    "Shopping list note: we need to buy mascarpone, ladyfingers, and capers. Everything else we have.",
    "For the tomatoes, use 8 San Marzano tomatoes.",
    "The salmon fillets — 8oz each.",
    "I want the asparagus at 400°F alongside the salmon. 15 minutes.",
    "Use 5 egg yolks for the tiramisu.",
    "The dinner is for 6 people, so scale the bruschetta accordingly.",
    "For the garlic in the bruschetta, 6 cloves.",
    "The salmon needs 3 tablespoons of butter.",
    "Heavy cream for the tiramisu: 2.5 cups.",
    "Ladyfingers — we need 30 of them.",
    "Cook the salmon for 14 minutes.",
  ],
  finalQuestion:
    "Give me the final recipe card for each course with exact quantities and cooking instructions. Include: 1) Bruschetta ingredients and serving size, 2) Salmon ingredients, weight per fillet, butter amount, cooking temp and time, 3) Asparagus temp and time, 4) Tiramisu: egg yolks, heavy cream, and ladyfinger count.",
  checkAnswer: (answer: string) => {
    const lower = answer.toLowerCase();
    // Use regex with proximity to avoid cross-item false positives
    const checks = [
      // Bruschetta: 8 San Marzano (not 6 Roma)
      /8\s*(san marzano|tomato)/i.test(answer),
      // 6 cloves garlic (not 4)
      /6\s*clove/i.test(answer),
      // Serves 6 (not 4)
      /serv\w*\s*6|for\s*6\s*(people|guest|person)/i.test(answer),
      // Salmon: 8oz fillets (not 6oz)
      /8\s*(-?\s*)oz|8\s*(-?\s*)ounce/i.test(answer),
      // 3 tbsp butter (not 2)
      /3\s*(tablespoon|tbsp).*butter|butter.*3\s*(tablespoon|tbsp)/i.test(answer),
      // 14 minutes cook time (not 12)
      /14\s*min/i.test(answer),
      // Asparagus: 400°F (not 425°F) — check proximity
      /asparagus[\s\S]{0,100}400|400[\s\S]{0,100}asparagus/i.test(answer),
      // Tiramisu: 5 egg yolks (not 6) — \b prevents matching "2.5"
      /\b5\s*egg\s*yolk/i.test(answer),
      // 2.5 cups heavy cream (not 2)
      /2\.5\s*(cup)?.*cream|cream.*2\.5/i.test(answer),
      // 30 ladyfingers (not 24)
      /30\s*lady\s*finger/i.test(answer),
    ];
    // Need at least 7 of 10 correct
    return checks.filter(Boolean).length >= 7;
  },
};

/**
 * Scenario 8: RAPID-FIRE CORRECTIONS
 * Tests whether the agent can handle many corrections in quick succession.
 * Seating chart with frequent swaps — the final state is all that matters.
 */
const rapidFireCorrections: Scenario = {
  name: "Rapid-fire Corrections",
  description:
    "Can the agent handle many corrections in quick succession and report the final state?",
  systemPrompt:
    "You are a wedding planner managing the seating chart. Track every guest's table assignment. When guests are moved, update immediately. Only the final assignment matters.",
  steps: [
    "We have 5 tables. Table 1 is the head table (bride & groom's family). Tables 2-5 are guest tables. Each table seats 8.",
    "Initial assignments: Table 1: Alice, Bob, Carol, David, Emma, Frank. Table 2: Grace, Henry, Iris, Jack. Table 3: Karen, Leo, Mia, Noah. Table 4: Olivia, Paul, Quinn, Rose. Table 5: Sam, Tina, Uma, Victor.",
    "Move Grace from Table 2 to Table 1. She's the bride's sister, she should be at the head table.",
    "Jack and Iris don't get along. Move Jack to Table 4.",
    "Actually, move Jack to Table 5 instead. Table 4 is full enough.",
    "Paul and Quinn are a couple — put them together at Table 3 with Karen and Leo.",
    "That means we need to move Mia and Noah somewhere. Put Mia at Table 2 and Noah at Table 4.",
    "Rose wants to sit with her college friends. Move her from Table 4 to Table 5.",
    "New guest: Wendy. Add her to Table 2.",
    "New guest: Xavier. Add him to Table 4.",
    "Uma can't make it anymore. Remove her from Table 5.",
    "Move Sam from Table 5 to Table 2. He knows Henry well.",
    "Actually, move Sam to Table 3 instead. Table 2 is getting crowded.",
    "Tina wants to be at Table 4 with Olivia. Move Tina from Table 5 to Table 4.",
    "New guest: Yuki. Add her to Table 5. And new guest: Zara, also Table 5.",
    "Final swap: move Frank from Table 1 to Table 3. He's not immediate family.",
  ],
  finalQuestion:
    "Give me the final seating chart. List every table with its guests. Make sure the count per table is right.",
  checkAnswer: (answer: string) => {
    const lower = answer.toLowerCase();
    // Table 1: Alice, Bob, Carol, David, Emma, Grace (Frank moved out, Grace moved in)
    // Table 2: Henry, Iris, Mia, Wendy (Grace→T1, Jack→T5, +Mia, +Wendy, Sam→T3)
    // Table 3: Karen, Leo, Paul, Quinn, Sam, Frank (Mia→T2, Noah→T4, +Paul, +Quinn from T4, +Sam, +Frank)
    // Table 4: Olivia, Noah, Jack, Xavier, Tina (Jack from T2→T5→wait, Jack went to T5. Let me retrace.)

    // Let me retrace carefully:
    // Initial: T1:[Alice,Bob,Carol,David,Emma,Frank] T2:[Grace,Henry,Iris,Jack] T3:[Karen,Leo,Mia,Noah] T4:[Olivia,Paul,Quinn,Rose] T5:[Sam,Tina,Uma,Victor]
    // Move Grace T2→T1: T1:[Alice,Bob,Carol,David,Emma,Frank,Grace] T2:[Henry,Iris,Jack]
    // Move Jack T2→T4: T2:[Henry,Iris] T4:[Olivia,Paul,Quinn,Rose,Jack]
    // Move Jack T4→T5: T4:[Olivia,Paul,Quinn,Rose] T5:[Sam,Tina,Uma,Victor,Jack]
    // Move Paul,Quinn T4→T3: T3:[Karen,Leo,Mia,Noah,Paul,Quinn] T4:[Olivia,Rose]
    // Move Mia T3→T2, Noah T3→T4: T2:[Henry,Iris,Mia] T3:[Karen,Leo,Paul,Quinn] T4:[Olivia,Rose,Noah]
    // Move Rose T4→T5: T4:[Olivia,Noah] T5:[Sam,Tina,Uma,Victor,Jack,Rose]
    // Add Wendy T2: T2:[Henry,Iris,Mia,Wendy]
    // Add Xavier T4: T4:[Olivia,Noah,Xavier]
    // Remove Uma T5: T5:[Sam,Tina,Victor,Jack,Rose]
    // Move Sam T5→T2: T2:[Henry,Iris,Mia,Wendy,Sam] T5:[Tina,Victor,Jack,Rose]
    // Move Sam T2→T3: T2:[Henry,Iris,Mia,Wendy] T3:[Karen,Leo,Paul,Quinn,Sam]
    // Move Tina T5→T4: T4:[Olivia,Noah,Xavier,Tina] T5:[Victor,Jack,Rose]
    // Add Yuki,Zara T5: T5:[Victor,Jack,Rose,Yuki,Zara]
    // Move Frank T1→T3: T1:[Alice,Bob,Carol,David,Emma,Grace] T3:[Karen,Leo,Paul,Quinn,Sam,Frank]

    // FINAL:
    // T1(6): Alice, Bob, Carol, David, Emma, Grace
    // T2(4): Henry, Iris, Mia, Wendy
    // T3(6): Karen, Leo, Paul, Quinn, Sam, Frank
    // T4(4): Olivia, Noah, Xavier, Tina
    // T5(5): Victor, Jack, Rose, Yuki, Zara

    // Split answer into table sections to verify actual assignments
    // Look for "Table N" headers and check which names follow each one
    const getTableSection = (tableNum: number): string => {
      // Match from "table N" to the next "table" or end of string
      const pattern = new RegExp(
        `table\\s*${tableNum}[^]*?(?=table\\s*[${tableNum + 1}-9]|$)`,
        "i"
      );
      const match = lower.match(pattern);
      return match ? match[0] : "";
    };

    const t1 = getTableSection(1);
    const t2 = getTableSection(2);
    const t3 = getTableSection(3);
    const t4 = getTableSection(4);
    const t5 = getTableSection(5);

    const checks = [
      // Table 1: Grace IN, Frank OUT
      t1.includes("grace") && !t1.includes("frank"),
      // Table 2: Henry, Iris, Mia, Wendy
      t2.includes("henry") && t2.includes("wendy"),
      // Table 3: Karen, Leo, Paul, Quinn, Sam, Frank
      t3.includes("frank") && t3.includes("sam"),
      t3.includes("paul") && t3.includes("quinn"),
      // Table 4: Olivia, Noah, Xavier, Tina
      t4.includes("xavier") && t4.includes("tina"),
      t4.includes("olivia") && t4.includes("noah"),
      // Table 5: Victor, Jack, Rose, Yuki, Zara
      t5.includes("yuki") && t5.includes("zara"),
      t5.includes("jack") && t5.includes("victor"),
      // Uma should NOT appear in any table
      !t1.includes("uma") && !t2.includes("uma") && !t3.includes("uma") && !t4.includes("uma") && !t5.includes("uma"),
    ];
    // Need at least 7 of 9
    return checks.filter(Boolean).length >= 7;
  },
};

export const ALL_SCENARIOS: Scenario[] = [
  earlyFactRecall,
  stateChangeTracking,
  contradictionResolution,
  multiHopReasoning,
  longHorizonWithNoise,
  cascadingCorrections,
  implicitCorrections,
  rapidFireCorrections,
];
