import React, { useState, useRef } from "react";

import { fetchProfile, computeScores, getAI, extractUsername } from "./analyzer.js";

// ── UI Components ──

const Spinner = () => (
  <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
    <div style={{ width: 36, height: 36, border: "3px solid rgba(255,255,255,0.06)", borderTop: "3px solid #22d3ee", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
  </div>
);

const ScoreRing = ({ score, size = 150 }) => {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "#22d3ee" : score >= 60 ? "#34d399" : score >= 40 ? "#facc15" : score >= 25 ? "#fb923c" : "#f87171";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)" }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={size * 0.28} fontWeight="700" style={{ transform: "rotate(90deg)", transformOrigin: "center" }} fontFamily="'JetBrains Mono', monospace">{score}</text>
    </svg>
  );
};

const Bar = ({ label, score, detail }) => {
  const color = score >= 80 ? "#22d3ee" : score >= 60 ? "#34d399" : score >= 40 ? "#facc15" : score >= 25 ? "#fb923c" : "#f87171";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{label}</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          {detail && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{detail}</span>}
          <span style={{ color, fontSize: 14, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{score}</span>
        </div>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.04)" }}>
        <div style={{ height: "100%", width: `${score}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: 3, transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
    </div>
  );
};

const Card = ({ children, style = {}, className = "" }) => (
  <div className={className} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 22, ...style }}>{children}</div>
);

const Tag = ({ children, color = "#a78bfa" }) => (
  <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", background: `${color}12`, color, border: `1px solid ${color}25`, display: "inline-block" }}>{children}</span>
);

// ── GitHub Data Fetcher ──

// ── Main App ──

export default function App() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [ai, setAi] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const resultRef = useRef(null);

  const requestId = useRef(0);

  const analyze = async () => {
    let username;
    try { username = extractUsername(input); } catch (err) { setError(err.message); return; }
    const id = ++requestId.current;
    setError(""); setLoading(true); setResult(null); setAi(null); setAiLoading(false);

    try {
      setStage("Fetching profile & repositories...");
      const data = await fetchProfile(username);
      setStage("Analyzing from recruiter's perspective...");
      if (id !== requestId.current) return;
      const scores = computeScores(data);
      setResult({ data, scores });
      setLoading(false);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 200);

      setAiLoading(true);
      const aiResult = await getAI(data, scores);
      if (id !== requestId.current) return;
      setAi(aiResult);
      setAiLoading(false);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.message); setLoading(false); setAiLoading(false);
    }
  };

  const grade = (s) => s >= 80 ? "Excellent" : s >= 65 ? "Strong" : s >= 45 ? "Average" : s >= 25 ? "Needs Work" : "Weak";
  const pColor = { high: "#f87171", medium: "#facc15", low: "#34d399" };

  return (
    <div style={{ minHeight: "100vh", background: "#060a10", color: "white", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes glow { 0%,100%{opacity:.4} 50%{opacity:1} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:#060a10; }
        @media (max-width: 600px) { .responsive-grid { grid-template-columns: 1fr !important; } }
        input::placeholder { color:rgba(255,255,255,0.2); }
        input:focus { outline:none; border-color:#22d3ee !important; }
        .fu { animation: fadeUp 0.5s ease-out forwards; }
        .s1{animation-delay:.1s;opacity:0} .s2{animation-delay:.2s;opacity:0} .s3{animation-delay:.3s;opacity:0} .s4{animation-delay:.4s;opacity:0} .s5{animation-delay:.5s;opacity:0}
      `}</style>

      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.05) 0%, transparent 60%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 880, margin: "0 auto", padding: "0 20px" }}>
        {/* Header */}
        <header style={{ paddingTop: 56, paddingBottom: result ? 20 : 72, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 20, background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.12)", fontSize: 11, color: "#22d3ee", marginBottom: 22, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 0.5 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22d3ee", animation: "glow 2s ease-in-out infinite" }} />
            GitHub Portfolio Review
          </div>

          <h1 style={{ fontSize: result ? 26 : 42, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.1, marginBottom: 10, transition: "font-size 0.4s" }}>
            GitHub Portfolio<span style={{ color: "#22d3ee" }}> Analyzer</span>
          </h1>

          {!result && (
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 15, maxWidth: 460, margin: "0 auto 36px", lineHeight: 1.6 }}>
              Review your public GitHub portfolio. Get a score, red flags, and a clear action plan.
            </p>
          )}

          <div style={{ display: "flex", gap: 10, maxWidth: 500, margin: "0 auto" }}>
            <input aria-label="GitHub username or profile URL" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !loading && analyze()}
              placeholder="username or github.com/username"
              style={{ flex: 1, minWidth: 0, padding: "13px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 14, fontFamily: "'JetBrains Mono',monospace" }}
            />
            <button onClick={analyze} disabled={loading}
              style={{ padding: "13px 26px", borderRadius: 10, border: "none", background: loading ? "rgba(34,211,238,0.15)" : "#22d3ee", color: loading ? "#22d3ee" : "#060a10", fontSize: 13, fontWeight: 600, cursor: loading ? "wait" : "pointer", fontFamily: "'DM Sans',sans-serif" }}>
              {loading ? "Analyzing..." : "Analyze"}
            </button>
          </div>
          {error && <p role="alert" style={{ color: "#f87171", fontSize: 12, marginTop: 10 }}>{error}</p>}
        </header>

        {loading && (
          <div style={{ textAlign: "center", paddingBottom: 40 }}>
            <Spinner />
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", marginTop: 10 }}>{stage}</p>
          </div>
        )}

        {/* ── Results ── */}
        {result && (
          <div ref={resultRef} style={{ paddingBottom: 80, display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Profile Card */}
            <Card style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <img src={result.data.user.avatar_url} alt="" style={{ width: 56, height: 56, borderRadius: 14, border: "2px solid rgba(255,255,255,0.08)" }} />
              <div style={{ flex: 1, minWidth: 180 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>{result.data.user.name || result.data.user.login}</h2>
                <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}>
                  @{result.data.user.login}{result.data.user.location && ` · ${result.data.user.location}`}
                </p>
                {result.data.user.bio && <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 4 }}>{result.data.user.bio}</p>}
              </div>
              <div style={{ display: "flex", gap: 18 }}>
                {[[result.scores.stats.originalRepos, "Original"], [result.scores.stats.forkedRepos, "Forked"], [result.scores.stats.totalStars, "Stars"], [result.scores.stats.followers, "Followers"]].map(([v, l]) => (
                  <div key={l} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{v}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, letterSpacing: 0.5 }}>{l}</div>
                  </div>
                ))}
              </div>
            </Card>

            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Heuristic scores based on public data: up to 10 original repositories, 20 commits per sampled repository, and 100 recent public events. This is not a hiring assessment. {result.data.eventsAvailable === false ? "Public events could not be fetched." : "Public events are a limited sample, not the contribution graph."}</p>
            {/* Score + Breakdown */}
            <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 18 }}>
              <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <ScoreRing score={result.scores.overall} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: result.scores.overall >= 65 ? "#22d3ee" : result.scores.overall >= 40 ? "#facc15" : "#f87171" }}>
                    {grade(result.scores.overall)}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 2, letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace" }}>PORTFOLIO SCORE</div>
                </div>
              </Card>

              <Card>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Bar label="📄 Documentation & READMEs" score={result.scores.documentation} detail="×0.25" />
                  <Bar label="📊 Activity & Consistency" score={result.scores.activity} detail="×0.20" />
                  <Bar label="💬 Commit Quality" score={result.scores.commitQuality} detail="×0.15" />
                  <Bar label="📁 Repo Organization" score={result.scores.repoOrganization} detail="×0.15" />
                  <Bar label="🧠 Technical Depth" score={result.scores.technicalDepth} detail="×0.15" />
                  <Bar label="👤 Profile Completeness" score={result.scores.profile} detail="×0.10" />
                </div>
              </Card>
            </div>

            {/* Quick Stats Row */}
            <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                [result.scores.stats.activeWeeks, "Active Weeks", "last 90 days"],
                [result.scores.stats.maxStreak, "Day Streak", "longest"],
                [`${result.scores.stats.commitMessageQuality}%`, "Good Commits", "message quality"],
                [result.scores.stats.langCount, "Languages", "detected"],
              ].map(([v, l, sub]) => (
                <Card key={l} style={{ textAlign: "center", padding: 16 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: "#22d3ee" }}>{v}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{l}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{sub}</div>
                </Card>
              ))}
            </div>

            {/* Red Flags & Strengths */}
            <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              {result.scores.redFlags.length > 0 && (
                <Card>
                  <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#f87171" }}>⚑ Potential Improvements</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {result.scores.redFlags.map((f, i) => (
                      <div key={i} style={{ display: "flex", gap: 8 }}>
                        <span style={{ color: "#f87171", fontSize: 12, marginTop: 2, flexShrink: 0 }}>✕</span>
                        <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 1.5 }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              {result.scores.strengths.length > 0 && (
                <Card>
                  <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#34d399" }}>✦ What's Working</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {result.scores.strengths.map((s, i) => (
                      <div key={i} style={{ display: "flex", gap: 8 }}>
                        <span style={{ color: "#34d399", fontSize: 12, marginTop: 2, flexShrink: 0 }}>✓</span>
                        <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 1.5 }}>{s}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Languages */}
            {Object.keys(result.scores.languages).length > 0 && (
              <Card>
                <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "rgba(255,255,255,0.5)" }}>Tech Stack</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(result.scores.languages).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([lang, bytes]) => (
                    <Tag key={lang} color="#a78bfa">{lang} <span style={{ opacity: 0.5 }}>{bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)}M` : `${(bytes / 1e3).toFixed(0)}K`}</span></Tag>
                  ))}
                </div>
              </Card>
            )}

            {/* README Health per Repo */}
            <Card>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "rgba(255,255,255,0.5)" }}>README Health Check</h3>
              <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {result.scores.readmeAnalysis.map((r) => (
                  <div key={r.repo} style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", color: "#22d3ee" }}>{r.repo}</span>
                      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: r.score >= 50 ? "#34d399" : r.score >= 25 ? "#facc15" : "#f87171" }}>{r.score}/100</span>
                    </div>
                    {(r.issues || []).slice(0, 2).map((issue, i) => (
                      <div key={i} style={{ fontSize: 10, color: "rgba(248,113,113,0.7)", marginTop: 2 }}>✕ {issue}</div>
                    ))}
                    {(r.strengths || []).slice(0, 2).map((s, i) => (
                      <div key={i} style={{ fontSize: 10, color: "rgba(52,211,153,0.7)", marginTop: 2 }}>✓ {s}</div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>

            {/* AI Section */}
            {aiLoading && (
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Spinner />
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>AI recruiter is reviewing your profile...</span>
                </div>
              </Card>
            )}

            {ai && (
              <>
                <Card style={{ borderColor: "rgba(34,211,238,0.15)" }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 18 }}>🎯</span>
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{ai.source === "local" ? "Built-in Review" : "AI Review"}</h3>
                      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, lineHeight: 1.6, marginBottom: 10 }}>{ai.verdict}</p>
                      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, lineHeight: 1.6 }}>{ai.recruiterImpression}</p>
                    </div>
                  </div>
                </Card>

                {ai.topPriority && (
                  <Card style={{ background: "rgba(248,113,113,0.04)", borderColor: "rgba(248,113,113,0.12)" }}>
                    <div style={{ display: "flex", gap: 10 }}>
                      <span style={{ fontSize: 16 }}>🔥</span>
                      <div>
                        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#f87171", marginBottom: 4 }}>#1 Priority Fix</h3>
                        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 1.5 }}>{ai.topPriority}</p>
                      </div>
                    </div>
                  </Card>
                )}

                <Card>
                  <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "rgba(255,255,255,0.5)" }}>Action Plan</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {ai.recommendations?.map((rec, i) => (
                      <div key={i} style={{ display: "flex", gap: 12, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: `${pColor[rec.priority]}15`, color: pColor[rec.priority], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{rec.title}</span>
                            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${pColor[rec.priority]}15`, color: pColor[rec.priority], fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase", letterSpacing: 0.5 }}>{rec.priority}</span>
                          </div>
                          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, lineHeight: 1.5 }}>{rec.detail}</p>
                          {rec.impact && <p style={{ color: "rgba(34,211,238,0.5)", fontSize: 11, marginTop: 3 }}>→ {rec.impact}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Pin & Archive Suggestions */}
                <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                  {ai.reposToPin?.length > 0 && (
                    <Card>
                      <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#34d399" }}>📌 Pin These Repos</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {ai.reposToPin.map((r, i) => (
                          <span key={i} style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.6)" }}>→ {r}</span>
                        ))}
                      </div>
                    </Card>
                  )}
                  {ai.reposToArchive?.length > 0 && (
                    <Card>
                      <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#fb923c" }}>🗄️ Consider Archiving</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {ai.reposToArchive.map((r, i) => (
                          <span key={i} style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.6)" }}>→ {r}</span>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>

                {ai.weeklyPlan && (
                  <Card style={{ background: "rgba(139,92,246,0.03)", borderColor: "rgba(139,92,246,0.1)" }}>
                    <div style={{ display: "flex", gap: 10 }}>
                      <span style={{ fontSize: 16 }}>📅</span>
                      <div>
                        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#a78bfa", marginBottom: 6 }}>2-Week Improvement Plan</h3>
                        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-line" }}>{ai.weeklyPlan}</p>
                      </div>
                    </div>
                  </Card>
                )}
              </>
            )}

            {/* Profile Checklist */}
            <Card>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "rgba(255,255,255,0.5)" }}>Profile Setup Checklist</h3>
              <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {Object.entries(result.scores.profileChecks).map(([key, val]) => {
                  const labels = { hasAvatar: "Profile photo", hasBio: "Bio filled", hasLocation: "Location set", hasWebsite: "Website/portfolio linked", hasCompany: "Company listed", hasName: "Display name", hasEmail: "Public email", hasHireable: "Hireable flag on", hasEnoughFollowers: "5+ followers", hasTwitter: "Twitter linked" };
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: val ? "rgba(52,211,153,0.7)" : "rgba(255,255,255,0.3)" }}>
                      <span>{val ? "✓" : "○"}</span> {labels[key] || key}
                    </div>
                  );
                })}
              </div>
            </Card>

            <div style={{ textAlign: "center", padding: "16px 0", color: "rgba(255,255,255,0.15)", fontSize: 11 }}>
              GitHub Portfolio Analyzer
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, maxWidth: 560, margin: "0 auto" }}>
            {[
              ["📊", "6-Dimension Score", "Heuristic portfolio metrics"],
              ["🎯", "Portfolio Feedback", "Honest, specific feedback"],
              ["🛤️", "2-Week Plan", "Prioritized improvements"],
            ].map(([i, t, s]) => (
              <div key={t} style={{ padding: 18, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", textAlign: "center" }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{i}</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{t}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{s}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}