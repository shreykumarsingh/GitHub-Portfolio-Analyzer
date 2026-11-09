import React, { useState, useRef } from "react";

const API = "https://api.github.com";

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

async function fetchProfile(username) {
  const token = import.meta.env.VITE_GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github.v3+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const userRes = await fetch(`${API}/users/${username}`, { headers });
  if (!userRes.ok) {
    if (userRes.status === 404) throw new Error("GitHub user not found. Please check the username.");
    if (userRes.status === 403) throw new Error("GitHub API rate limit exceeded. Please wait a bit or configure a GitHub Token.");
    throw new Error(`GitHub API error: ${userRes.statusText}`);
  }
  const user = await userRes.json();

  const reposRes = await fetch(`${API}/users/${username}/repos?per_page=100&sort=updated&type=owner`, { headers });
  if (!reposRes.ok) throw new Error(`Could not fetch repositories (${reposRes.statusText})`);
  const reposData = await reposRes.json();
  const allRepos = Array.isArray(reposData) ? reposData : [];

  // Separate forked and original
  const originalRepos = allRepos.filter((r) => !r.fork);
  const forkedRepos = allRepos.filter((r) => r.fork);

  // Top repos by stars, then by recent push
  const topRepos = [...originalRepos]
    .sort((a, b) => b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 10);

  // Deep fetch for top repos: README, languages, recent commits
  const repoDetails = await Promise.all(
    topRepos.map(async (repo) => {
      const detail = { ...repo, readmeContent: null, readmeLength: 0, languages: {}, recentCommits: [], commitMessages: [] };

      // README
      try {
        const res = await fetch(`${API}/repos/${username}/${repo.name}/readme`, { headers: { ...headers, Accept: "application/vnd.github.v3.raw" } });
        if (res.ok) {
          detail.readmeContent = await res.text();
          detail.readmeLength = detail.readmeContent.length;
        }
      } catch {}

      // Languages
      try {
        const res = await fetch(`${API}/repos/${username}/${repo.name}/languages`, { headers });
        if (res.ok) {
          const langs = await res.json();
          if (langs && typeof langs === "object" && !Array.isArray(langs)) detail.languages = langs;
        }
      } catch {}

      // Recent commits (for commit message quality) — 409 = empty repo, 404 = no access
      try {
        const res = await fetch(`${API}/repos/${username}/${repo.name}/commits?per_page=20`, { headers });
        if (res.ok) {
          const commits = await res.json();
          if (Array.isArray(commits)) {
            detail.recentCommits = commits;
            detail.commitMessages = commits.map((c) => c.commit?.message || "").filter(Boolean);
          }
        }
      } catch {}

      return detail;
    })
  );

  // Events for activity analysis
  const eventsRes = await fetch(`${API}/users/${username}/events/public?per_page=100`, { headers });
  const eventsData = eventsRes.ok ? await eventsRes.json() : [];
  const events = Array.isArray(eventsData) ? eventsData : [];

  return { user, allRepos, originalRepos, forkedRepos, repoDetails, events };
}

// ── Real-World Recruiter Scoring Engine ──
//
// Based on:
// 1. How recruiters actually evaluate GitHub (Reczee, LinkedIn recruiter guides, ITeachRecruiters)
// 2. What hiring managers look at: README first, then activity graph, then code
// 3. Real hiring signals: live demos, commit quality, project storytelling, consistency
// 4. Red flags recruiters mention: empty READMEs, all forked repos, no descriptions, irregular activity

function computeScores(data) {
  const { user, allRepos, originalRepos, forkedRepos, repoDetails, events } = data;
  const now = new Date();

  // ════════════════════════════════════════════════
  // 1. PROFILE COMPLETENESS (Weight: 10%)
  //    Recruiters first see: avatar, bio, location, website, hireable
  //    "This is the first impression" - Reczee
  // ════════════════════════════════════════════════
  let profileScore = 0;
  const profileChecks = {
    hasAvatar: typeof user?.avatar_url === "string" && !user.avatar_url.includes("identicon"),
    hasBio: !!user.bio && user.bio.length > 10,
    hasLocation: !!user.location,
    hasWebsite: !!user.blog,
    hasCompany: !!user.company,
    hasName: !!user.name,
    hasEmail: !!user.email,
    hasHireable: user.hireable === true,
    hasEnoughFollowers: user.followers >= 5,
    hasTwitter: !!user.twitter_username,
  };
  profileScore += profileChecks.hasAvatar ? 15 : 0;
  profileScore += profileChecks.hasBio ? 20 : 0;
  profileScore += profileChecks.hasName ? 10 : 0;
  profileScore += profileChecks.hasLocation ? 10 : 0;
  profileScore += profileChecks.hasWebsite ? 15 : 0;
  profileScore += profileChecks.hasCompany ? 10 : 0;
  profileScore += profileChecks.hasHireable ? 5 : 0;
  profileScore += profileChecks.hasEnoughFollowers ? 10 : 0;
  profileScore += profileChecks.hasTwitter ? 5 : 0;
  profileScore = Math.min(profileScore, 100);

  // ════════════════════════════════════════════════
  // 2. README & DOCUMENTATION QUALITY (Weight: 25%)
  //    "README is the first impression if the hiring manager opens your repo" - Reczee
  //    "Majority of profiles have not updated README" - Reczee TalentHub
  //    Recruiter spends 6 seconds → README must communicate fast
  // ════════════════════════════════════════════════
  const readmeAnalysis = repoDetails.map((repo) => {
    if (!repo.readmeContent) return { repo: repo.name, score: 0, issues: ["No README file"], strengths: [] };

    const content = repo.readmeContent;
    const lower = content.toLowerCase();
    let score = 0;
    const issues = [];
    const strengths = [];

    // Length tiers (not just exists, but substance)
    if (content.length < 100) { score += 5; issues.push("README too short (< 100 chars)"); }
    else if (content.length < 300) { score += 15; issues.push("README is brief — needs more detail"); }
    else if (content.length < 800) { score += 25; }
    else if (content.length < 2000) { score += 35; strengths.push("Good README length"); }
    else { score += 40; strengths.push("Comprehensive README"); }

    // Has headings/structure (## or ###)
    const headingCount = (content.match(/^#{1,3}\s/gm) || []).length;
    if (headingCount >= 3) { score += 10; strengths.push("Well-structured with headings"); }
    else if (headingCount >= 1) score += 5;
    else issues.push("No section headings");

    // Installation/Setup instructions — critical for recruiters to try the project
    if (/install|setup|getting.?started|how.?to.?run|quick.?start/i.test(lower)) { score += 10; strengths.push("Has setup instructions"); }
    else issues.push("No installation/setup instructions");

    // Code blocks (shows technical documentation)
    const codeBlocks = (content.match(/```/g) || []).length / 2;
    if (codeBlocks >= 2) score += 5;
    else if (codeBlocks >= 1) score += 3;

    // Live demo / deployment link — "even a non-technical recruiter can evaluate"
    if (/https?:\/\/[^\s)]+\.(vercel|netlify|herokuapp|github\.io|surge|render|railway|fly\.dev|app)/i.test(content) ||
        /live.?demo|deployed|play.?store|app.?store|hosted/i.test(lower)) {
      score += 12; strengths.push("Has live demo link");
    } else {
      issues.push("No live demo/deployment link");
    }

    // Screenshots/GIFs/Videos — visual proof
    if (/!\[.*\]\(.*\.(png|jpg|gif|webp|svg)/i.test(content) || /screenshot|demo\.gif|\.mp4|video|screen.?recording/i.test(lower)) {
      score += 8; strengths.push("Has visual demos");
    } else {
      issues.push("No screenshots or demo visuals");
    }

    // Tech stack mentioned
    if (/tech.?stack|built.?with|technologies|framework/i.test(lower)) { score += 5; strengths.push("Tech stack documented"); }

    // Features listed
    if (/features|what.?it.?does|capabilities/i.test(lower)) score += 5;

    // License
    if (/license/i.test(lower)) score += 3;

    // Contributing guide
    if (/contribut/i.test(lower)) score += 2;

    return { repo: repo.name, score: Math.min(score, 100), issues, strengths };
  });

  const reposWithReadme = readmeAnalysis.filter((r) => r.score > 0).length;
  const avgReadmeScore = readmeAnalysis.length > 0
    ? Math.round(readmeAnalysis.reduce((s, r) => s + r.score, 0) / readmeAnalysis.length)
    : 0;

  // Penalty: if majority of top repos have no/bad README
  const noReadmeRatio = repoDetails.filter((r) => !r.readmeContent).length / (repoDetails.length || 1);
  const docScore = Math.max(0, Math.min(100, Math.round(avgReadmeScore * (1 - noReadmeRatio * 0.3))));

  // ════════════════════════════════════════════════
  // 3. COMMIT QUALITY & PATTERNS (Weight: 15%)
  //    "Engineers look at your Git commit history to see what it'd be like to work with you"
  //    Good signals: descriptive messages, consistent style, atomic commits
  //    Red flags: "fix", "update", "asdf", single-word commits
  // ════════════════════════════════════════════════
  const allCommitMessages = repoDetails.flatMap((r) => r.commitMessages || []);
  let commitScore = 0;

  if (allCommitMessages.length > 0) {
    // Message quality
    const goodMessages = allCommitMessages.filter((m) => {
      const first = m.split("\n")[0];
      if (first.length < 5) return false; // too short
      if (/^(fix|update|changes|test|wip|asdf|init|\.+|commit)$/i.test(first.trim())) return false; // lazy
      if (first.length > 10 && first.length < 72) return true; // ideal length
      return first.length >= 5;
    });

    const qualityRatio = goodMessages.length / allCommitMessages.length;
    commitScore += Math.round(qualityRatio * 40);

    // Conventional commits bonus (feat:, fix:, chore:, etc.)
    const conventionalCount = allCommitMessages.filter((m) => /^(feat|fix|chore|docs|style|refactor|test|build|ci|perf)[\(:]/.test(m)).length;
    if (conventionalCount > allCommitMessages.length * 0.3) commitScore += 15;
    else if (conventionalCount > 0) commitScore += 8;

    // Commit frequency across repos
    const totalCommits = repoDetails.reduce((s, r) => s + (r.recentCommits || []).length, 0);
    commitScore += Math.min(totalCommits * 1.5, 25);

    // Atomic commits (not 1 giant commit per repo)
    const avgCommitsPerRepo = totalCommits / (repoDetails.length || 1);
    if (avgCommitsPerRepo >= 10) commitScore += 15;
    else if (avgCommitsPerRepo >= 5) commitScore += 10;
    else if (avgCommitsPerRepo >= 2) commitScore += 5;
    else commitScore -= 5; // red flag: 1 commit repos

    // Penalty for "Initial commit" only repos
    const singleCommitRepos = repoDetails.filter((r) => (r.recentCommits || []).length <= 1).length;
    commitScore -= singleCommitRepos * 3;
  }

  commitScore = Math.max(0, Math.min(100, commitScore));

  // ════════════════════════════════════════════════
  // 4. ACTIVITY & CONSISTENCY (Weight: 20%)
  //    Recruiters look at the green squares: "consistent activity signals dedication"
  //    Key: CONSISTENCY > volume. 3 commits/week for 6 months > 100 commits in 1 day
  // ════════════════════════════════════════════════
  const pushEvents = events.filter((e) => e.type === "PushEvent");
  const allEventDates = events.map((e) => new Date(e.created_at));
  const pushDates = pushEvents.map((e) => new Date(e.created_at));

  // Unique active days in last 90 days
  const last90 = pushDates.filter((d) => now - d < 90 * 24 * 60 * 60 * 1000);
  const uniqueDays90 = new Set(last90.map((d) => d.toDateString())).size;

  // Unique active weeks in last 90 days
  const weekKeys90 = new Set(last90.map((d) => {
    const weekStart = new Date(d);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    return weekStart.toDateString();
  }));
  const activeWeeks = weekKeys90.size;

  // Streak analysis from events
  const sortedDates = [...new Set(pushDates.map((d) => d.toDateString()))].sort((a, b) => new Date(a) - new Date(b));
  let maxStreak = 0, currentStreak = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) { currentStreak = 1; }
    else {
      const diff = (new Date(sortedDates[i]) - new Date(sortedDates[i - 1])) / (24 * 60 * 60 * 1000);
      currentStreak = diff <= 2 ? currentStreak + 1 : 1; // allow 1 day gap
    }
    maxStreak = Math.max(maxStreak, currentStreak);
  }

  // Recent activity (last 30 days)
  const last30Events = events.filter((e) => now - new Date(e.created_at) < 30 * 24 * 60 * 60 * 1000).length;

  // Is profile active at all in last 6 months?
  const lastActivity = allEventDates.length > 0 ? allEventDates[0] : null;
  const daysSinceLastActivity = lastActivity ? (now - lastActivity) / (24 * 60 * 60 * 1000) : 999;

  let activityScore = 0;
  // Weekly consistency (most important for recruiter perception)
  activityScore += Math.min(activeWeeks * 7, 35); // up to 35 for 5+ active weeks in 90 days
  // Daily spread
  activityScore += Math.min(uniqueDays90 * 1.2, 25);
  // Streak bonus
  activityScore += Math.min(maxStreak * 3, 15);
  // Recency bonus
  if (daysSinceLastActivity < 7) activityScore += 15;
  else if (daysSinceLastActivity < 30) activityScore += 10;
  else if (daysSinceLastActivity < 90) activityScore += 5;
  else activityScore -= 10; // red flag: inactive
  // Volume bonus (minor)
  activityScore += Math.min(last30Events * 0.5, 10);

  activityScore = Math.max(0, Math.min(100, Math.round(activityScore)));

  // ════════════════════════════════════════════════
  // 5. REPOSITORY QUALITY & ORGANIZATION (Weight: 15%)
  //    Recruiters check: descriptions, topics, original vs forked, archived
  //    "Repositories without descriptions look abandoned"
  // ════════════════════════════════════════════════
  let repoOrgScore = 0;
  const totalRepos = allRepos.length;
  if (totalRepos > 0) {
    // Original vs forked ratio (recruiters want to see YOUR work)
    const originalRatio = originalRepos.length / totalRepos;
    repoOrgScore += Math.round(originalRatio * 25);

    // Descriptions filled
    const withDesc = allRepos.filter((r) => r.description && r.description.length > 15).length;
    repoOrgScore += Math.round((withDesc / totalRepos) * 20);

    // Topics/tags used
    const withTopics = allRepos.filter((r) => r.topics && r.topics.length > 0).length;
    repoOrgScore += Math.round((withTopics / totalRepos) * 15);

    // Licenses present
    const withLicense = allRepos.filter((r) => r.license).length;
    repoOrgScore += Math.round((withLicense / totalRepos) * 10);

    // Website/homepage linked in repo
    const withHomepage = allRepos.filter((r) => r.homepage && r.homepage.length > 5).length;
    repoOrgScore += Math.round((withHomepage / Math.min(totalRepos, 10)) * 15);

    // Right number of repos (not too few, not too many empty ones)
    if (originalRepos.length >= 5 && originalRepos.length <= 30) repoOrgScore += 10;
    else if (originalRepos.length >= 3) repoOrgScore += 5;

    // Penalty for too many empty/tiny repos
    const emptyRepos = allRepos.filter((r) => r.size < 5 && !r.fork).length;
    repoOrgScore -= emptyRepos * 2;

    // Bonus for diverse repo types
    const hasWebProject = repoDetails.some((r) => {
      const langs = Object.keys(r.languages || {}).map((l) => l.toLowerCase());
      return langs.includes("javascript") || langs.includes("typescript") || langs.includes("html");
    });
    const hasBackendProject = repoDetails.some((r) => {
      const langs = Object.keys(r.languages || {}).map((l) => l.toLowerCase());
      return langs.includes("python") || langs.includes("java") || langs.includes("go") || langs.includes("c#");
    });
    if (hasWebProject && hasBackendProject) repoOrgScore += 5;
  }

  repoOrgScore = Math.max(0, Math.min(100, repoOrgScore));

  // ════════════════════════════════════════════════
  // 6. TECHNICAL DEPTH & DIVERSITY (Weight: 15%)
  //    Recruiters want to see: breadth of skills, non-trivial projects
  //    "Pay attention to technologies and frameworks used"
  // ════════════════════════════════════════════════
  const allLangs = {};
  repoDetails.forEach((r) => {
    Object.entries(r.languages || {}).forEach(([lang, bytes]) => {
      allLangs[lang] = (allLangs[lang] || 0) + bytes;
    });
  });
  const langCount = Object.keys(allLangs).length;

  let techScore = 0;
  // Language diversity (but not TOO scattered)
  if (langCount >= 4 && langCount <= 10) techScore += 25;
  else if (langCount >= 3) techScore += 20;
  else if (langCount >= 2) techScore += 12;
  else if (langCount === 1) techScore += 5;

  // Dominant language depth (shows mastery)
  const sortedLangs = Object.entries(allLangs).sort((a, b) => b[1] - a[1]);
  if (sortedLangs.length > 0 && sortedLangs[0][1] > 50000) techScore += 15; // significant code in primary lang
  else if (sortedLangs.length > 0 && sortedLangs[0][1] > 10000) techScore += 8;

  // Project complexity (size as proxy)
  const largeProjects = repoDetails.filter((r) => r.size > 1000).length;
  const mediumProjects = repoDetails.filter((r) => r.size > 200 && r.size <= 1000).length;
  techScore += Math.min(largeProjects * 8, 20);
  techScore += Math.min(mediumProjects * 3, 10);

  // Multi-language repos (full-stack signal)
  const fullStackRepos = repoDetails.filter((r) => Object.keys(r.languages || {}).length >= 3).length;
  techScore += Math.min(fullStackRepos * 5, 15);

  // Issues & PRs (collaboration signals)
  const hasIssuesEnabled = repoDetails.filter((r) => r.has_issues && r.open_issues_count > 0).length;
  techScore += Math.min(hasIssuesEnabled * 3, 10);

  // Stars received (external validation of technical work)
  const totalStars = allRepos.reduce((s, r) => s + r.stargazers_count, 0);
  techScore += Math.min(totalStars * 2, 15);

  techScore = Math.max(0, Math.min(100, techScore));

  // ════════════════════════════════════════════════
  // OVERALL SCORE (Weighted by recruiter priority)
  // ════════════════════════════════════════════════
  const overall = Math.round(
    profileScore * 0.10 +
    docScore * 0.25 +
    commitScore * 0.15 +
    activityScore * 0.20 +
    repoOrgScore * 0.15 +
    techScore * 0.15
  );

  // ════════════════════════════════════════════════
  // Generate specific red flags & strengths
  // ════════════════════════════════════════════════
  const redFlags = [];
  const strengths = [];

  // Profile red flags
  if (!profileChecks.hasBio) redFlags.push("Missing bio — recruiters skip profiles without context");
  if (!profileChecks.hasName) redFlags.push("No display name set");
  if (!profileChecks.hasWebsite) redFlags.push("No portfolio/website linked");

  // README red flags (THE biggest issue)
  if (noReadmeRatio > 0.5) redFlags.push(`${Math.round(noReadmeRatio * 100)}% of top repos have no README — this is the #1 recruiter turn-off`);
  const noLiveDemo = readmeAnalysis.filter((r) => (r.issues || []).includes("No live demo/deployment link")).length;
  if (noLiveDemo >= repoDetails.length * 0.7) redFlags.push("Almost no projects have live demo links — recruiters can't see your work in action");
  const noScreenshots = readmeAnalysis.filter((r) => (r.issues || []).includes("No screenshots or demo visuals")).length;
  if (noScreenshots >= repoDetails.length * 0.7) redFlags.push("No screenshots/GIFs in READMEs — visual proof matters");

  // Activity red flags
  if (daysSinceLastActivity > 90) redFlags.push(`No activity in ${Math.round(daysSinceLastActivity)} days — profile looks abandoned`);
  if (activeWeeks < 3 && daysSinceLastActivity < 90) redFlags.push("Sporadic activity — recruiters value consistency over bursts");

  // Commit red flags
  const lazyCommits = allCommitMessages.filter((m) => /^(fix|update|changes|test|wip|asdf|init|commit|\.+)$/i.test(m.split("\n")[0].trim()));
  if (lazyCommits.length > allCommitMessages.length * 0.3) redFlags.push("Too many low-effort commit messages (\"fix\", \"update\") — shows poor engineering habits");

  // Repo red flags
  if (forkedRepos.length > originalRepos.length) redFlags.push(`More forked repos (${forkedRepos.length}) than original (${originalRepos.length}) — doesn't show initiative`);
  const noDescRepos = allRepos.filter((r) => !r.description || r.description.length < 10);
  if (noDescRepos.length > totalRepos * 0.5) redFlags.push(`${noDescRepos.length} repos have no description — they look like abandoned experiments`);

  // Strengths
  if (docScore >= 60) strengths.push("Good documentation practices across repos");
  if (activityScore >= 60) strengths.push("Consistent contribution activity — shows dedication");
  if (totalStars >= 10) strengths.push(`${totalStars} total stars — your work has external validation`);
  if (langCount >= 4) strengths.push(`${langCount} languages used — strong technical breadth`);
  if (profileChecks.hasBio && profileChecks.hasWebsite) strengths.push("Complete profile presence — good first impression");
  if (maxStreak >= 5) strengths.push(`${maxStreak}-day contribution streak — shows consistency`);
  if (originalRepos.length >= 8) strengths.push(`${originalRepos.length} original projects — substantial portfolio`);
  if (largeProjects >= 2) strengths.push("Has non-trivial, complex projects");
  if (readmeAnalysis.some((r) => (r.strengths || []).includes("Has live demo link"))) strengths.push("Some projects have live demos — great for recruiter evaluation");

  return {
    overall,
    profile: profileScore,
    documentation: docScore,
    commitQuality: commitScore,
    activity: activityScore,
    repoOrganization: repoOrgScore,
    technicalDepth: techScore,
    languages: allLangs,
    redFlags: redFlags.slice(0, 6),
    strengths: strengths.slice(0, 6),
    readmeAnalysis,
    profileChecks,
    stats: {
      totalRepos: allRepos.length,
      originalRepos: originalRepos.length,
      forkedRepos: forkedRepos.length,
      totalStars,
      totalForks: allRepos.reduce((s, r) => s + r.forks_count, 0),
      followers: user.followers,
      langCount,
      uniqueDays90,
      activeWeeks,
      maxStreak,
      daysSinceLastActivity: Math.round(daysSinceLastActivity),
      commitMessageQuality: allCommitMessages.length > 0
        ? Math.round((allCommitMessages.filter((m) => m.split("\n")[0].length > 10).length / allCommitMessages.length) * 100)
        : 0,
    },
  };
}

// ── AI Analysis ──

async function getAI(data, scores) {
  const { user, repoDetails } = data;
  const repoSummaries = repoDetails.slice(0, 6).map((r) =>
    `- ${r.name}: ${r.description || "no desc"} | ⭐${r.stargazers_count} | Lang: ${Object.keys(r.languages).join(",") || "none"} | README: ${r.readmeLength} chars | Topics: ${(r.topics || []).join(",") || "none"} | Commits: ${(r.recentCommits || []).length} | Homepage: ${r.homepage || "none"}`
  ).join("\n");

  const commitSamples = repoDetails.flatMap((r) => (r.commitMessages || []).slice(0, 3)).slice(0, 10).join("\n  ");

  const prompt = `You are a senior tech recruiter at a FAANG company. You've reviewed 1000s of GitHub profiles. Analyze this developer's profile and give brutally honest, specific feedback.

PROFILE: ${user.login} | ${user.name || "no name"} | Bio: ${user.bio || "none"} | Location: ${user.location || "none"}
Public repos: ${user.public_repos} | Followers: ${user.followers} | Website: ${user.blog || "none"}

SCORES (0-100):
Overall: ${scores.overall} | Profile: ${scores.profile} | Documentation: ${scores.documentation}
Commit Quality: ${scores.commitQuality} | Activity: ${scores.activity}
Repo Organization: ${scores.repoOrganization} | Technical Depth: ${scores.technicalDepth}

TOP REPOS:
${repoSummaries}

SAMPLE COMMIT MESSAGES:
  ${commitSamples || "none available"}

STATS: ${scores.stats.originalRepos} original repos, ${scores.stats.forkedRepos} forked, ${scores.stats.totalStars} stars, ${scores.stats.langCount} languages, ${scores.stats.activeWeeks} active weeks in 90d, ${scores.stats.maxStreak} day streak, ${scores.stats.commitMessageQuality}% good commit messages

RED FLAGS DETECTED: ${scores.redFlags.join(" | ") || "none"}
STRENGTHS DETECTED: ${scores.strengths.join(" | ") || "none"}

Respond ONLY in this JSON format, no markdown no backticks:
{
  "verdict": "One brutally honest sentence on profile quality",
  "recruiterImpression": "What goes through a recruiter's mind in 30 seconds viewing this profile (2-3 sentences)",
  "topPriority": "The single most impactful thing to fix right now",
  "recommendations": [
    {"title": "Short title", "detail": "Specific, actionable step referencing actual repos/issues", "priority": "high", "impact": "What changes after doing this"},
    {"title": "Short title", "detail": "Specific step", "priority": "high", "impact": "What changes"},
    {"title": "Short title", "detail": "Specific step", "priority": "medium", "impact": "What changes"},
    {"title": "Short title", "detail": "Specific step", "priority": "medium", "impact": "What changes"},
    {"title": "Short title", "detail": "Specific step", "priority": "low", "impact": "What changes"}
  ],
  "reposToPin": ["repo1", "repo2", "repo3"],
  "reposToArchive": ["repo1"],
  "weeklyPlan": "A 2-week plan to improve this profile score by 15-20 points"
}`;

  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const groqKey = import.meta.env.VITE_GROQ_API_KEY;
  const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  // 1. Free Option 1: Google Gemini Flash (Generous free tier via Google AI Studio)
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );
      if (res.ok) {
        const result = await res.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return JSON.parse(text);
      }
    } catch (err) {
      console.warn("Gemini API call failed:", err.message);
    }
  }

  // 2. Free Option 2: Groq Cloud (Free LLaMA 3.3 70B via console.groq.com)
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const result = await res.json();
        const text = result.choices?.[0]?.message?.content;
        if (text) return JSON.parse(text);
      }
    } catch (err) {
      console.warn("Groq API call failed:", err.message);
    }
  }

  // 3. Anthropic Claude (if key provided)
  if (anthropicKey) {
    const endpoints = [
      "https://api.anthropic.com/v1/messages",
      "https://corsproxy.io/?url=https://api.anthropic.com/v1/messages",
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "dangerously-allow-browser": "true",
          },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
        });
        if (!res.ok) continue;
        const result = await res.json();
        const text = (result.content || []).map((b) => b.text || "").filter(Boolean).join("");
        if (!text) continue;
        return JSON.parse(text.replace(/```json|```/g, "").trim());
      } catch (err) {
        console.warn(`AI endpoint failed (${endpoint}):`, err.message);
        continue;
      }
    }
  }

  // If all endpoints fail, return a generated fallback based on scores
  return generateFallbackAI(data, scores);
}

function generateFallbackAI(data, scores) {
  const { user, repoDetails } = data;
  const s = scores;

  const verdicts = {
    high: "Solid profile with good fundamentals — a few targeted improvements would make this recruiter-ready.",
    mid: "Profile shows potential but has gaps that would cause recruiters to pass. Fixable in 1-2 weeks.",
    low: "Profile needs significant work before it's ready for recruiter evaluation. Focus on README quality and consistency.",
  };

  const recs = [];

  if (s.documentation < 50) {
    const worstReadme = s.readmeAnalysis.sort((a, b) => a.score - b.score)[0];
    recs.push({ title: "Fix READMEs immediately", detail: `Start with '${worstReadme?.repo || "your top repo"}' — add installation steps, screenshots, tech stack, and a live demo link. This is the #1 thing recruiters check.`, priority: "high", impact: "Documentation score jumps 20-30 points" });
  }

  if (s.activity < 40) {
    recs.push({ title: "Build a commit streak", detail: "Make at least 1 meaningful commit every day for the next 14 days. Even small improvements to existing projects count.", priority: "high", impact: "Activity score improves and green squares build recruiter confidence" });
  }

  if (s.commitQuality < 50) {
    recs.push({ title: "Write better commit messages", detail: "Use format: 'feat: add user auth flow' or 'fix: resolve API timeout on large datasets'. Never commit with just 'fix' or 'update'.", priority: "medium", impact: "Shows professional engineering habits" });
  }

  if (s.profile < 60) {
    const missing = [];
    if (!s.profileChecks.hasBio) missing.push("bio");
    if (!s.profileChecks.hasWebsite) missing.push("portfolio link");
    if (!s.profileChecks.hasLocation) missing.push("location");
    recs.push({ title: "Complete your profile", detail: `Add: ${missing.join(", ")}. Recruiters skip incomplete profiles.`, priority: "high", impact: "First impression goes from amateur to professional" });
  }

  if (s.repoOrganization < 50) {
    recs.push({ title: "Clean up repo organization", detail: "Add descriptions to all repos, add topic tags, archive empty/abandoned repos, and set homepage URLs for deployed projects.", priority: "medium", impact: "Profile looks intentional instead of messy" });
  }

  // Fill to 5
  while (recs.length < 5) {
    recs.push({ title: "Add a standout project", detail: "Build one project that solves a real problem, deploy it, write a thorough README with screenshots, and pin it.", priority: "low", impact: "Gives recruiters something impressive to talk about in interviews" });
    if (recs.length < 5) recs.push({ title: "Engage with open source", detail: "Find a project you use and submit a PR — even fixing a typo in docs counts. It shows collaboration skills.", priority: "low", impact: "Demonstrates you can work in real codebases with others" });
  }

  const topRepos = [...repoDetails].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 3).map((r) => r.name);
  const emptyRepos = repoDetails.filter((r) => (r.recentCommits || []).length <= 1 && r.stargazers_count === 0).slice(0, 2).map((r) => r.name);

  return {
    verdict: s.overall >= 65 ? verdicts.high : s.overall >= 35 ? verdicts.mid : verdicts.low,
    recruiterImpression: s.overall >= 65
      ? `Profile has substance. A recruiter would note the ${s.stats.langCount} languages and ${s.stats.originalRepos} original repos. ${s.documentation >= 50 ? "README quality is decent." : "But weak READMEs would raise concerns."}`
      : `A recruiter would spend about 10 seconds here. ${s.documentation < 40 ? "Missing READMEs are the first thing they'd notice." : ""} ${s.activity < 40 ? "Sparse activity graph suggests this isn't someone who codes regularly." : ""} Needs work before sharing with hiring managers.`,
    topPriority: s.documentation < 50
      ? "Write proper READMEs for your top 3 repos with screenshots, setup instructions, and live demo links."
      : s.activity < 40
      ? "Start committing daily — even small improvements. Build a visible streak."
      : "Polish your best repos and pin them to your profile.",
    recommendations: recs.slice(0, 5),
    reposToPin: topRepos,
    reposToArchive: emptyRepos,
    weeklyPlan: `Week 1: Fix READMEs for top 3 repos (add screenshots, setup guide, live links). Complete your profile bio and links. Start daily commits.\nWeek 2: Add descriptions and topics to all repos. Archive empty repos. Write one blog post or detailed project writeup. Your score should improve 15-20 points.`,
  };
}

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

  const extract = (input) => {
    const t = input.trim().replace(/\/+$/, "");
    const m = t.match(/github\.com\/([a-zA-Z0-9-]+)/);
    return m ? m[1] : t;
  };

  const analyze = async () => {
    const username = extract(input);
    if (!username) return setError("Enter a GitHub username or profile URL");
    setError(""); setLoading(true); setResult(null); setAi(null);

    try {
      setStage("Fetching profile & repositories...");
      const data = await fetchProfile(username);
      setStage("Analyzing from recruiter's perspective...");
      const scores = computeScores(data);
      setResult({ data, scores });
      setLoading(false);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 200);

      setAiLoading(true);
      const aiResult = await getAI(data, scores);
      setAi(aiResult);
      setAiLoading(false);
    } catch (err) {
      setError(err.message); setLoading(false);
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
            AI-Powered Recruiter Analysis
          </div>

          <h1 style={{ fontSize: result ? 26 : 42, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.1, marginBottom: 10, transition: "font-size 0.4s" }}>
            GitHub Portfolio<span style={{ color: "#22d3ee" }}> Analyzer</span>
          </h1>

          {!result && (
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 15, maxWidth: 460, margin: "0 auto 36px", lineHeight: 1.6 }}>
              See your GitHub the way a FAANG recruiter does. Get a score, red flags, and a clear action plan.
            </p>
          )}

          <div style={{ display: "flex", gap: 10, maxWidth: 500, margin: "0 auto" }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !loading && analyze()}
              placeholder="username or github.com/username"
              style={{ flex: 1, padding: "13px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 14, fontFamily: "'JetBrains Mono',monospace" }}
            />
            <button onClick={analyze} disabled={loading}
              style={{ padding: "13px 26px", borderRadius: 10, border: "none", background: loading ? "rgba(34,211,238,0.15)" : "#22d3ee", color: loading ? "#22d3ee" : "#060a10", fontSize: 13, fontWeight: 600, cursor: loading ? "wait" : "pointer", fontFamily: "'DM Sans',sans-serif" }}>
              {loading ? "Analyzing..." : "Analyze"}
            </button>
          </div>
          {error && <p style={{ color: "#f87171", fontSize: 12, marginTop: 10 }}>{error}</p>}
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

            {/* Score + Breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 18 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              {result.scores.redFlags.length > 0 && (
                <Card>
                  <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#f87171" }}>⚑ Red Flags Recruiters Will Notice</h3>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Recruiter Verdict</h3>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, maxWidth: 560, margin: "0 auto" }}>
            {[
              ["📊", "6-Dimension Score", "How recruiters actually evaluate"],
              ["🎯", "AI Recruiter View", "Honest, specific feedback"],
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