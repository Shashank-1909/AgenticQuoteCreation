# Dynamic AI-Driven Recommendations for Quote Management

This document outlines the **recommended and best practice approach** for implementing dynamic UI transitions (Creation → Update → Preview) in the Agentic Quoting Accelerator without hard-coding specific logic flows.

## 1. Core Philosophy: The "Action-Oriented Protocol"

Instead of hard-coding `if (quoteCreated) showPreview()`, we transition to a **Metadata-Driven UI**. The AI Agent determines the "Next Best Action" based on tool outputs, and the Frontend dynamically reacts to structured metadata in the response.

### Architectural Flow:
1.  **Tool Output**: The Salesforce tool (e.g., `evaluate_quote_graph`) returns a Success status + Record ID.
2.  **Agent Reasoning**: The AI Agent (Quote Architect/Updator) sees the success and identifies that a "Preview" or "Follow-up Update" is the logical next step.
3.  **Structured Response**: The Agent includes a hidden or structured `action_recommendation` block in its response.
4.  **Frontend Dispatcher**: The UI parses this block and triggers the corresponding component (e.g., Opening the Preview Modal).

---

## 2. Implementation: Backend (Tools & Agents)

### A. Enhancing Tool Metadata
Tools should return a standardized `recommendation` hint. This provides "contextual fuel" for the AI.

**Example: Updated `evaluate_quote_graph` response**
```json
{
  "status": "success",
  "quote_id": "0Q0...",
  "message": "Quote Created",
  "recommendation": {
    "action": "PREVIEW_QUOTE",
    "params": { "id": "0Q0..." },
    "label": "View Quote Preview"
  }
}
```

### B. Agent Instruction Update
Update the `instruction` in `quote_architect.py` and `quote_updator.py` to ensure it always propagates these recommendations.

**New Instruction Snippet:**
> "If a tool returns a success message for Quote Creation or Update, you MUST include a structured recommendation at the end of your response in the format: 
> `[RECOMMENDATION: ACTION_NAME | PARAMS_JSON]`"

---

## 3. Implementation: Frontend (The Dynamic Handler)

The Frontend should have a **Global Action Interceptor** that scans the Agent's response for recommendation tokens.

### A. The Action Interceptor (Logic)
```javascript
// Example logic in your Agent Service or Component
handleAgentResponse(response) {
  const recommendationRegex = /\[RECOMMENDATION:\s*(\w+)\s*\|\s*({.*?})\]/;
  const match = response.text.match(recommendationRegex);

  if (match) {
    const action = match[1];
    const params = JSON.parse(match[2]);
    
    // Trigger dynamic UI transition
    this.executeRecommendation(action, params);
  }
}
```

### B. Dynamic Action Registry
Create a registry to map `action` strings to UI functions:
- `PREVIEW_QUOTE` → `openPreviewModal(id)`
- `UPDATE_QUOTE` → `switchToAddOnPanel(id)`
- `SUCCESS_NOTIFICATION` → `showToast(msg)`

---

## 4. Best Practices for "Zero Hard-Coding"

### 1. Let the AI Decide Context
Instead of always showing a preview button, the AI can choose based on the user's "vibe":
- User: "Just create it, I'll check later." → **Action: None**
- User: "Create it and let me see the final numbers." → **Action: PREVIEW_QUOTE**

### 2. Use "UI Hints" in JSON
Include UI styling hints in the recommendation metadata:
```json
{
  "action": "PREVIEW_QUOTE",
  "style": "primary",
  "auto_trigger": true
}
```

### 3. Progressive Disclosure
If a quote is updated, the recommendation should be specific to the change.
- *Updated Discount?* → Recommendation: **Review Pricing Impact**.
- *Added Product?* → Recommendation: **Review Inventory Allocation**.

---

## 5. Summary of Workflow Improvements

| Step | Old Way (Hard-coded) | Recommended Way (AI-Dynamic) |
| :--- | :--- | :--- |
| **Logic Location** | Frontend Component (`if/else`) | AI Agent + Tool Metadata |
| **Flexibility** | Rigid, requires code change to reorder | Flexible, AI reorders steps based on intent |
| **Maintenance** | High (UX changes break flows) | Low (New actions added to Registry only) |
| **UX Feel** | Static/Predictable | Adaptive and "Agentic" |

---

### Next Steps:
1. **Update `server.py`**: Add `recommendation` fields to `evaluate_quote_graph` and `manage_quote_line_items`.
2. **Update Agent Prompts**: Instruct Agents to format recommendations as `[RECOMMENDATION: ACTION | PARAMS]`.
3. **Frontend Integration**: Implement the regex-based parser in your `ResultsVault` component.
