import re

def resolve():
    with open('rca-agentic-frontend/src/components/AgentforceView.jsx', 'r', encoding='utf-8') as f:
        content = f.read()

    conflicts = list(re.finditer(r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> winloss_clean', content, re.DOTALL))
    print(f"Found {len(conflicts)} conflicts.")

    new_content = content
    # Process from right to left so indices don't change
    for i in range(len(conflicts)-1, -1, -1):
        match = conflicts[i]
        head = match.group(1)
        winloss = match.group(2)
        idx = i + 1

        resolved = ""
        if idx == 1:
            resolved = "  Send, Loader2, Zap, Settings, ArrowLeft, ArrowRight, BrainCircuit,\n  CheckCircle2, Package, TrendingUp, Sparkles, Database,\n  Eye, ExternalLink, Search, LayoutDashboard, FileText,\n  ZoomIn, ZoomOut, Paperclip, MapPin, Layers, ShieldCheck, PlusCircle, Sun, Moon"
        elif idx == 2:
            resolved = winloss.replace(', setIsDark', '')
        elif idx == 3:
            resolved = head + "\n" + winloss
        elif idx == 4:
            resolved = """
  const handleWsMessageRef = useRef(null);
  useEffect(() => {
    handleWsMessageRef.current = handleWsMessage;
  });

  useEffect(() => {
    ws.current = new WebSocket('ws://localhost:8001/ws/orchestrate');
    ws.current.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        handleWsMessageRef.current?.(data);
      } catch (err) {
        console.error('[WS] parse error', err);
      }
    };
    return () => ws.current?.close();
  }, []);

  const handleWsMessage = (data) => {
    switch (data.type) {
      case 'STATE':
        setWorkflowState(data.state);
        if (data.state === 'completed') {
          clearSummarizeTimeouts();
          setReasoning(null);
          setOrchestration(prev => {
            const n = { ...prev };
            if (isWinRateRequestRef.current) {
              n.coordinator = 'done';
              n.Quote_Analyst = {
                state: 'done',
                routedByDm: true,
                tools: [
                  { name: 'get_my_accounts', state: 'done' },
                  { name: 'get_deal_history', state: 'done' },
                  { name: 'win_rate', state: 'done' }
                ]
              };
            } else if (isSummarizeRequestRef.current) {
              n.coordinator = 'done';
              n.Quote_Analyst = {
                state: 'done',
                routedByDm: true,
                tools: [
                  { name: 'get_my_accounts', state: 'done' },
                  { name: 'get_deal_history', state: 'done' },
                  { name: 'summary_node', state: 'done' }
                ]
              };
            } else {
              if (n.coordinator === 'active') n.coordinator = 'done';
              for (const k of ['Requirements_Parser', 'Catalog_Scout', 'Quote_Architect', 'Quote_Updator', 'Quote_Analyst']) {
                if (n[k] && n[k].state === 'active') {
                  n[k] = { ...n[k], state: 'done' };
                  if (n[k].tools) {
                    n[k].tools = n[k].tools.map(t => ({ ...t, state: 'done' }));
                  }
                }
              }
            }"""
        elif idx == 5:
            resolved = """          const name = data.agent;
          const n = { ...prev };
          if (name === 'Deal_Manager') {
            n.coordinator = 'active';
          } else if (
            name === 'Requirements_Parser' ||
            name === 'Catalog_Scout' ||
            name === 'Quote_Architect' ||
            name === 'Quote_Updator' ||
            name === 'Quote_Analyst'
          ) {
            for (const k of ['Requirements_Parser', 'Catalog_Scout', 'Quote_Architect', 'Quote_Updator', 'Quote_Analyst']) {"""
        elif idx == 6:
            resolved = """          for (const k of ['Requirements_Parser', 'Catalog_Scout', 'Quote_Architect', 'Quote_Updator', 'Quote_Analyst']) {"""
        elif idx == 7:
            resolved = """          for (const k of ['Requirements_Parser', 'Catalog_Scout', 'Quote_Architect', 'Quote_Updator', 'Quote_Analyst']) {
            if (n[k] && n[k].tools && n[k].tools.some(t => t.name === data.tool)) {"""
        elif idx == 8:
            resolved = winloss
        elif idx == 9:
            resolved = "    // Auto redirect to orchestration flow (graph) when user sends any request\n    setWorkspaceView('graph');\n\n    // Support dynamic preview/summary commands\n    const cmd = text.toLowerCase();\n\n" + winloss
        elif idx == 10:
            resolved = head
        elif idx == 11:
            resolved = "            {(dealHistoryLoading || dealHistoryData) ? (\n              <div className=\"w-full h-full bg-slate-50 overflow-hidden\">\n                {isWinRateRequestRef.current ? (\n                  <WinRateBattleCard\n                    data={dealHistoryData}\n                    accountName={dealHistoryAccount}\n                    isLoading={dealHistoryLoading}\n                    isQuoteMode={isQuoteWinRateRequestRef.current}\n                    messages={messages}\n                  />\n                ) : (\n                  <DealHistoryPanel\n                    data={dealHistoryData}\n                    accountName={dealHistoryAccount}\n                    isLoading={dealHistoryLoading}\n                  />\n                )}\n              </div>\n            ) : (\n" + head + "\n            )}"
        elif idx == 12:
            resolved = winloss
        elif idx == 13:
            resolved = winloss
        elif idx == 14:
            resolved = head + "\n" + winloss
        elif idx == 15:
            # We want to keep suggestions but REMOVE the specific static recommendation buttons
            # wait, the first part is suggestions. Let's see what is there
            resolved = winloss
        elif idx == 16:
            # this is the "Create a quote for the selected products" static button, remove it
            resolved = ""
        elif idx == 17:
            resolved = head
        elif idx == 18:
            resolved = winloss
        elif idx == 19:
            resolved = winloss
        elif idx == 20:
            resolved = winloss
        else:
            resolved = head

        new_content = new_content[:match.start()] + resolved + new_content[match.end():]

    with open('rca-agentic-frontend/src/components/AgentforceView.jsx', 'w', encoding='utf-8') as f:
        f.write(new_content)

resolve()
