---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Word each question so "yes" accepts your recommended answer.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Track confirmed decisions, recommendations awaiting approval, and ambiguous answers separately. Do not promote a recommendation into a requirement merely because the user answered nearby questions. When an answer could mean either exclusive control or exclusive attachment, for example, ask a concrete scenario that distinguishes them before treating either as settled.

When the user corrects the target application or architecture, replace the invalid branch of the design tree and retain unrelated confirmed requirements. Verify the relevant client, backend, and repository boundaries before recommending an integration approach; a similarly named terminal application and graphical client can have entirely different extension points.

Keep research-completion messages short and decision-relevant. Fold new facts into the next unanswered frontier instead of repeating the interview or advancing to questions whose prerequisites remain unanswered.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent with a fresh context window to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

For features spanning clients and remote hosts, use [distributed application decisions](references/distributed-applications.md) to expose execution, persistence, and permission boundaries before discussing implementation details.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
