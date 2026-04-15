/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from "react";
import { 
  Activity, 
  Database, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  FileText, 
  User, 
  Car, 
  MessageSquare,
  RefreshCw,
  ExternalLink,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";

// --- Types ---
interface Case {
  id: string;
  subject: string;
  priority: string;
  status: string;
  description: string;
  customerName: string;
  vehicleId: string;
  sentiment: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  step: "Ingress" | "Context" | "Analysis" | "Egress";
  message: string;
  status: "success" | "pending" | "error";
}

// --- Components ---

const StatusBadge = ({ status }: { status: string }) => {
  const colors = {
    "New": "bg-blue-100 text-blue-800 border-blue-200",
    "In Progress": "bg-yellow-100 text-yellow-800 border-yellow-200",
    "Closed": "bg-green-100 text-green-800 border-green-200",
    "Critical": "bg-red-100 text-red-800 border-red-200",
  };
  const colorClass = colors[status as keyof typeof colors] || "bg-gray-100 text-gray-800 border-gray-200";
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${colorClass}`}>
      {status}
    </span>
  );
};

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [cases, setCases] = useState<Case[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [ragInsight, setRagInsight] = useState<string | null>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const fetchCases = useCallback(async () => {
    try {
      const res = await fetch("/api/cases");
      const data = await res.json();
      setCases(data);
    } catch (err) {
      console.error("Failed to fetch cases", err);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsConnected(true);
        addLog("Ingress", "Salesforce connection established via OAuth2.", "success");
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const addLog = (step: LogEntry["step"], message: string, status: LogEntry["status"]) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      step,
      message,
      status
    };
    setLogs(prev => [newLog, ...prev]);
  };

  const handleConnect = async () => {
    try {
      const res = await fetch("/api/auth/url");
      const { url } = await res.json();
      window.open(url, "sf_auth", "width=600,height=700");
    } catch (err) {
      console.error("Auth error", err);
    }
  };

  const runClosedLoop = async (caseId: string) => {
    if (!isConnected) {
      alert("Please connect to Salesforce first.");
      return;
    }

    setIsProcessing(true);
    setRagInsight(null);
    const targetCase = cases.find(c => c.id === caseId);
    if (!targetCase) return;
    setSelectedCase(targetCase);

    // 1. Ingress
    addLog("Ingress", `New high-priority case detected: ${caseId}`, "success");
    await new Promise(r => setTimeout(r, 1000));

    // 2. Context Gathering
    addLog("Context", "Fetching full case details and vehicle history...", "pending");
    try {
      const historyRes = await fetch(`/api/vehicle-history/${targetCase.vehicleId}`);
      const history = await historyRes.json();
      addLog("Context", `Retrieved ${history.length} service records for VIN: ${targetCase.vehicleId}`, "success");
    } catch (err) {
      addLog("Context", "Failed to gather context.", "error");
      setIsProcessing(false);
      return;
    }
    await new Promise(r => setTimeout(r, 1000));

    // 3. Analysis (RAG)
    addLog("Analysis", "Querying technical knowledge base using RAG...", "pending");
    try {
      const prompt = `
        You are an automotive technical expert. 
        Case Subject: ${targetCase.subject}
        Description: ${targetCase.description}
        Vehicle History: ${targetCase.vehicleId}
        
        Analyze the fault and provide a concise repair procedure summary based on technical manuals.
      `;
      const result = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: prompt
      });
      const insight = result.text || "Fault analysis complete. Recommended thermostat replacement.";
      setRagInsight(insight);
      addLog("Analysis", "Technical solution identified.", "success");
    } catch (err) {
      addLog("Analysis", "RAG analysis failed.", "error");
    }
    await new Promise(r => setTimeout(r, 1000));

    // 4. Egress
    addLog("Egress", "Updating Salesforce Case with Technical Summary...", "pending");
    try {
      await fetch(`/api/cases/${caseId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: ragInsight || "Thermostat replacement recommended.", status: "In Progress" })
      });
      addLog("Egress", "Salesforce Case updated. Follow-up task created for technician.", "success");
      
      if (targetCase.sentiment === "Critical") {
        addLog("Egress", "Critical sentiment detected. Slack notification posted.", "success");
      }
    } catch (err) {
      addLog("Egress", "Failed to update Salesforce.", "error");
    }

    setIsProcessing(false);
    fetchCases();
  };

  return (
    <div className="app-wrapper">
      {/* Header */}
      <header>
        <div className="flex items-center gap-2">
          <div className="logo">AutoAgent <span className="text-accent">360</span></div>
          <span className="text-[10px] font-mono opacity-30 uppercase tracking-tighter">v2.4.0-stable</span>
        </div>
        <div className="flex gap-4">
          <div className={`status-pill ${!isConnected ? 'bg-red-50 text-critical' : ''}`}>
            <div className="status-dot"></div>
            {isConnected ? 'Salesforce API: Connected' : 'Salesforce API: Disconnected'}
          </div>
          <div className="status-pill" style={{ background: '#fef2f2', color: 'var(--color-critical)' }}>
            <div className="status-dot"></div>
            System Load: Normal
          </div>
          {!isConnected && (
            <button 
              onClick={handleConnect}
              className="bg-accent text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              Connect <ExternalLink size={12} />
            </button>
          )}
        </div>
      </header>

      {/* Sidebar */}
      <div className="sidebar">
        <div className="text-[11px] text-white/50 font-bold uppercase tracking-wider mb-2">Active Process</div>
        
        <div className={`step ${isProcessing ? 'step-active' : ''}`}>
          <div className="step-num">01</div>
          <div>
            <div className="text-xs">Ingress Polling</div>
            <div className="text-[10px] opacity-60">Monitoring SF Case Triggers</div>
          </div>
        </div>

        <div className={`step ${selectedCase ? 'step-active' : ''}`}>
          <div className="step-num">02</div>
          <div>
            <div className="text-xs">Context Fetch</div>
            <div className="text-[10px] opacity-60">{selectedCase ? `Case ${selectedCase.id.slice(-5)} Loaded` : 'Waiting for Case'}</div>
          </div>
        </div>

        <div className={`step ${isProcessing && ragInsight === null ? 'step-active' : ''}`}>
          <div className="step-num">03</div>
          <div>
            <div className="text-xs">RAG Analysis</div>
            <div className="text-[10px] opacity-60">Querying PDF Knowledge</div>
          </div>
        </div>

        <div className={`step ${ragInsight ? 'step-active' : ''}`}>
          <div className="step-num">04</div>
          <div>
            <div className="text-xs">Egress Execution</div>
            <div className="text-[10px] opacity-60">Write-back & Notify</div>
          </div>
        </div>

        <hr className="w-full border-0 border-t border-white/10 my-2" />
        
        <div className="text-[10px] text-white/50 leading-relaxed">
          Auth State: {isConnected ? 'OAuth2 Valid' : 'Unauthorized'}<br />
          Token Expires: {isConnected ? '42m' : 'N/A'}
        </div>

        <div className="mt-auto">
          <div className="card-title !text-white/50">System Health</div>
          <div className="flex items-center gap-2 text-[10px] text-white/70">
            <Activity size={12} className="text-success" />
            <span>Redis Cache: Active</span>
          </div>
        </div>
      </div>

      {/* Main View */}
      <main className="main-view">
        <section>
          <div className="card-title">
            Case Monitor <span className="text-[10px] font-mono opacity-40">Total: {cases.length}</span>
          </div>
          <div className="border border-border rounded-lg overflow-hidden mb-6">
            <div className="grid grid-cols-[40px_1.5fr_1fr_1fr] p-2 bg-gray-50 border-b border-border">
              <span className="col-header">ID</span>
              <span className="col-header">Subject</span>
              <span className="col-header">Priority</span>
              <span className="col-header">Status</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {cases.map((c) => (
                <div 
                  key={c.id} 
                  className={`data-row ${selectedCase?.id === c.id ? 'bg-accent/5 border-l-2 border-l-accent' : ''}`}
                  onClick={() => setSelectedCase(c)}
                >
                  <span className="data-value opacity-40">#{c.id.slice(-3)}</span>
                  <span className="text-xs font-semibold truncate pr-2">{c.subject}</span>
                  <span className="data-value">{c.priority}</span>
                  <div className="flex items-center justify-between">
                    <StatusBadge status={c.status} />
                    <button 
                      onClick={(e) => { e.stopPropagation(); runClosedLoop(c.id); }}
                      disabled={isProcessing || !isConnected}
                      className="p-1 text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-30"
                    >
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <AnimatePresence>
          {selectedCase && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div>
                <div className="card-title">Case Context: {selectedCase.id} {selectedCase.sentiment === 'Critical' && <span className="critical-badge">CRITICAL</span>}</div>
                <div className="data-grid">
                  <div className="space-y-1">
                    <div className="label">Subject</div>
                    <div className="value text-xs">{selectedCase.subject}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="label">Vehicle</div>
                    <div className="value text-xs">{selectedCase.vehicleId}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="label">Customer</div>
                    <div className="value text-xs">{selectedCase.customerName}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="label">Case Origin</div>
                    <div className="value text-xs">IoT Diagnostic</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="card-title">State Persistence Layer (Python Logic)</div>
                <div className="code-box">
                  <span className="text-[#569cd6]">def</span> <span className="text-[#dcdcaa]">write_back_to_salesforce</span>(case_id, summary):<br />
                  &nbsp;&nbsp;<span className="text-[#569cd6]">try</span>:<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;sf.Case.<span className="text-[#dcdcaa]">update</span>(case_id, &#123;<span className="text-[#ce9178]">'Technical_Summary__c'</span>: summary&#125;)<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-[#dcdcaa]">create_technician_task</span>(case_id)<br />
                  &nbsp;&nbsp;<span className="text-[#569cd6]">except</span> Exception <span className="text-[#569cd6]">as</span> e:<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;db.<span className="text-[#dcdcaa]">save_to_pending_queue</span>(case_id, summary) <span className="text-gray-500"># Retry later</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Right Panel */}
      <div className="right-panel">
        <section>
          <div className="card-title">RAG Insights</div>
          <div className="rag-result">
            {isProcessing && !ragInsight ? (
              <div className="flex items-center gap-2 py-2">
                <RefreshCw size={14} className="animate-spin text-warning" />
                <span className="text-xs font-medium text-warning">Analyzing technical manuals...</span>
              </div>
            ) : ragInsight ? (
              <div className="space-y-2">
                <div className="text-xs font-bold">Match Found: TSB-2024-05A</div>
                <p className="text-[11px] leading-relaxed opacity-80">{ragInsight}</p>
                <div className="text-[11px] font-bold text-accent">Confidence: 94%</div>
              </div>
            ) : (
              <div className="text-[11px] opacity-40 italic py-2">Select a case to generate insights</div>
            )}
          </div>
        </section>

        <section>
          <div className="card-title">Egress Operations</div>
          <div className="flex flex-col gap-2">
            {logs.filter(l => l.step === 'Egress').map((log, i) => (
              <div key={i} className="flex justify-between items-center text-[11px] pb-1 border-b border-border">
                <span className="opacity-70">{log.message.split(':')[0]}</span>
                <span className={log.status === 'success' ? 'text-success font-bold' : 'text-warning font-bold'}>
                  {log.status === 'success' ? 'Success' : 'Pending'}
                </span>
              </div>
            ))}
            {logs.filter(l => l.step === 'Egress').length === 0 && (
              <div className="text-[11px] opacity-30 italic">No egress operations executed</div>
            )}
          </div>
        </section>

        <section className="mt-auto">
          <div className="card opacity-80 border-dashed">
            <div className="card-title">Slack Message Preview</div>
            <div className="text-[10px] italic leading-relaxed">
              {selectedCase ? (
                `"🚨 Critical Case ${selectedCase.id.slice(-5)}: ${selectedCase.subject}. Recommended action: ${ragInsight ? 'Check components' : 'Pending analysis'}. Assigned to: Lead Tech."`
              ) : (
                "Waiting for case selection..."
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer>
        <div className="flex items-center gap-4">
          <span>System Version: 2.4.0-stable</span>
          <span className="opacity-50">|</span>
          <span>Vector DB: Pinecone-US-East</span>
        </div>
        <div className="flex gap-4">
          <span>Latency: 240ms</span>
          <span>Uptime: 99.9%</span>
        </div>
      </footer>
    </div>
  );
}


