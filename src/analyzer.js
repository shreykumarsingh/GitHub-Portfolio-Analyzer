async function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
}

const API = "https://api.github.com";

export function extractUsername(input) {
  const value = input.trim();
  let username = value;
  if (/^(https?:\/\/|(?:www\.)?github\.com\/)/i.test(value)) {
    let url;
    try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); } catch { throw new Error("Enter a valid GitHub profile URL"); }
    if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port) throw new Error("Enter a github.com profile URL");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) throw new Error("Enter a profile URL, rather than a repository URL");
    username = parts[0];
  }
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username) || username.includes("--")) throw new Error("Enter a valid GitHub username or profile URL");
  return username;
}

export function validateAI(value) {
  if (!value || typeof value !== "object" || ["verdict", "recruiterImpression", "topPriority", "weeklyPlan"].some(key => typeof value[key] !== "string") || !Array.isArray(value.recommendations) || !value.recommendations.length || value.recommendations.some(rec => !rec || typeof rec.title !== "string" || typeof rec.detail !== "string" || (rec.impact != null && typeof rec.impact !== "string") || !["high", "medium", "low"].includes(rec.priority)) || ["reposToPin", "reposToArchive"].some(key => !Array.isArray(value[key]) || value[key].some(name => typeof name !== "string"))) throw new Error("Invalid AI response");
  return { ...value, source: "provider" };
}

export async function fetchProfile(username) {
  const token = import.meta.env?.VITE_GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github.v3+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const userRes = await fetchWithTimeout(`${API}/users/${username}`, { headers });
  if (!userRes.ok) {
    if (userRes.status === 404) throw new Error("GitHub user not found. Please check the username.");
    if (userRes.status === 403) throw new Error("GitHub API rate limit exceeded. Please wait a bit or configure a GitHub Token.");
    throw new Error(`GitHub API error: ${userRes.statusText}`);
  }
  const user = await userRes.json();

  const allRepos = [];
  for (let page = 1; ; page++) {
  const reposRes = await fetchWithTimeout(`${API}/users/${username}/repos?per_page=100&sort=updated&type=owner&page=${page}`, { headers });
  if (!reposRes.ok) throw new Error(`Could not fetch repositories (${reposRes.statusText})`);
  const reposData = await reposRes.json();
  if (!Array.isArray(reposData)) throw new Error("Invalid repository response from GitHub");
  allRepos.push(...reposData);
  if (reposData.length < 100) break;
  }

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
      const detail = { ...repo, readmeContent: null, readmeLength: 0, readmeStatus: "unavailable", languages: {}, recentCommits: [], commitMessages: [] };

      // README
      try {
        const res = await fetchWithTimeout(`${API}/repos/${username}/${repo.name}/readme`, { headers: { ...headers, Accept: "application/vnd.github.v3.raw" } });
        if (res.ok) {
          detail.readmeStatus = "loaded";
          detail.readmeContent = await res.text();
          detail.readmeLength = detail.readmeContent.length;
        } else if (res.status === 404) {
          detail.readmeStatus = "missing";
        }
      } catch {}

      // Languages
      try {
        const res = await fetchWithTimeout(`${API}/repos/${username}/${repo.name}/languages`, { headers });
        if (res.ok) {
          const langs = await res.json();
          if (langs && typeof langs === "object" && !Array.isArray(langs)) detail.languages = langs;
        }
      } catch {}

      // Recent commits (for commit message quality) — 409 = empty repo, 404 = no access
      try {
        const res = await fetchWithTimeout(`${API}/repos/${username}/${repo.name}/commits?per_page=20`, { headers });
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
  let events = [];
  let eventsAvailable = false;
  try {
  const eventsRes = await fetchWithTimeout(`${API}/users/${username}/events/public?per_page=100`, { headers });
  const eventsData = eventsRes.ok ? await eventsRes.json() : [];
  events = Array.isArray(eventsData) ? eventsData : [];
  eventsAvailable = eventsRes.ok;
  } catch {}

  return { user, allRepos, originalRepos, forkedRepos, repoDetails, events, eventsAvailable };
}

// ── Real-World Recruiter Scoring Engine ──
//
// Based on:
// 1. How recruiters actually evaluate GitHub (Reczee, LinkedIn recruiter guides, ITeachRecruiters)
// 2. What hiring managers look at: README first, then activity graph, then code
// 3. Real hiring signals: live demos, commit quality, project storytelling, consistency
// 4. Red flags recruiters mention: empty READMEs, all forked repos, no descriptions, irregular activity

export function computeScores(data) {
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
    if (repo.readmeStatus === "unavailable") return { repo: repo.name, score: 0, issues: ["README could not be fetched; score unavailable"], strengths: [] };
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
  const noReadmeRatio = repoDetails.filter((r) => r.readmeStatus !== "unavailable" && !r.readmeContent).length / (repoDetails.length || 1);
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
  const uniqueDays90 = new Set(last90.map((d) => d.toISOString().slice(0, 10))).size;

  // Unique active weeks in last 90 days
  const weekKeys90 = new Set(last90.map((d) => {
    const weekStart = new Date(d);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    return weekStart.toISOString().slice(0, 10);
  }));
  const activeWeeks = weekKeys90.size;

  // Streak analysis from events
  const sortedDates = [...new Set(pushDates.map((d) => d.toISOString().slice(0, 10)))].sort((a, b) => new Date(a) - new Date(b));
  let maxStreak = 0, currentStreak = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) { currentStreak = 1; }
    else {
      const diff = (new Date(sortedDates[i]) - new Date(sortedDates[i - 1])) / (24 * 60 * 60 * 1000);
      currentStreak = diff === 1 ? currentStreak + 1 : 1; // allow 1 day gap
    }
    maxStreak = Math.max(maxStreak, currentStreak);
  }

  // Recent activity (last 30 days)
  const last30Events = events.filter((e) => now - new Date(e.created_at) < 30 * 24 * 60 * 60 * 1000).length;

  // Is profile active at all in last 6 months?
  const lastActivity = allEventDates.length > 0 ? new Date(Math.max(...allEventDates)) : null;
  const daysSinceLastActivity = lastActivity ? (now - lastActivity) / (24 * 60 * 60 * 1000) : null;

  let activityScore = 0;
  // Weekly consistency (most important for recruiter perception)
  activityScore += Math.min(activeWeeks * 7, 35); // up to 35 for 5+ active weeks in 90 days
  // Daily spread
  activityScore += Math.min(uniqueDays90 * 1.2, 25);
  // Streak bonus
  activityScore += Math.min(maxStreak * 3, 15);
  // Recency bonus
  if (daysSinceLastActivity !== null && daysSinceLastActivity < 7) activityScore += 15;
  else if (daysSinceLastActivity !== null && daysSinceLastActivity < 30) activityScore += 10;
  else if (daysSinceLastActivity !== null && daysSinceLastActivity < 90) activityScore += 5;
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
    repoOrgScore += Math.round((Math.min(withHomepage, 10) / Math.min(totalRepos, 10)) * 15);

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
  if (repoDetails.length > 0 && noLiveDemo >= repoDetails.length * 0.7) redFlags.push("Almost no projects have live demo links — recruiters can't see your work in action");
  const noScreenshots = readmeAnalysis.filter((r) => (r.issues || []).includes("No screenshots or demo visuals")).length;
  if (repoDetails.length > 0 && noScreenshots >= repoDetails.length * 0.7) redFlags.push("No screenshots/GIFs in READMEs — visual proof matters");

  // Activity red flags
  if (daysSinceLastActivity === null) redFlags.push("No public activity available in the fetched event sample; private contributions are not included");
  if (daysSinceLastActivity !== null && daysSinceLastActivity > 90) redFlags.push(`No activity in ${Math.round(daysSinceLastActivity)} days — profile looks abandoned`);
  if (activeWeeks < 3 && daysSinceLastActivity !== null && daysSinceLastActivity < 90) redFlags.push("Sporadic activity — recruiters value consistency over bursts");

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
      daysSinceLastActivity: daysSinceLastActivity === null ? null : Math.round(daysSinceLastActivity),
      commitMessageQuality: allCommitMessages.length > 0
        ? Math.round((allCommitMessages.filter((m) => m.split("\n")[0].length > 10).length / allCommitMessages.length) * 100)
        : 0,
    },
  };
}

// ── AI Analysis ──

export async function getAI(data, scores) {
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

  const geminiKey = import.meta.env?.VITE_GEMINI_API_KEY;
  const groqKey = import.meta.env?.VITE_GROQ_API_KEY;
  const anthropicKey = import.meta.env?.VITE_ANTHROPIC_API_KEY;

  // 1. Free Option 1: Google Gemini Flash (Generous free tier via Google AI Studio)
  if (geminiKey) {
    try {
      const res = await fetchWithTimeout(
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
        if (text) {
          const cleaned = text.replace(/```(?:json)?/gi, "").trim();
          return validateAI(JSON.parse(cleaned));
        }
      }
    } catch (err) {
      console.warn("Gemini API call failed:", err.message);
    }
  }

  // 2. Free Option 2: Groq Cloud (Free LLaMA 3.3 70B via console.groq.com)
  if (groqKey) {
    try {
      const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
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
        if (text) {
          const cleaned = text.replace(/```(?:json)?/gi, "").trim();
          return validateAI(JSON.parse(cleaned));
        }
      }
    } catch (err) {
      console.warn("Groq API call failed:", err.message);
    }
  }

  // 3. Anthropic Claude (if key provided)
  if (anthropicKey) {
    const endpoints = [
      "https://api.anthropic.com/v1/messages",
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await fetchWithTimeout(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
        });
        if (!res.ok) continue;
        const result = await res.json();
        const text = (result.content || []).map((b) => b.text || "").filter(Boolean).join("");
        if (!text) continue;
        return validateAI(JSON.parse(text.replace(/```json|```/g, "").trim()));
      } catch (err) {
        console.warn(`AI endpoint failed (${endpoint}):`, err.message);
        continue;
      }
    }
  }

  // If all endpoints fail, return a generated fallback based on scores
  return generateFallbackAI(data, scores);
}

export function generateFallbackAI(data, scores) {
  const { user, repoDetails } = data;
  const s = scores;

  const verdicts = {
    high: "Solid profile with good fundamentals — a few targeted improvements would make this recruiter-ready.",
    mid: "Profile shows potential but has gaps that would cause recruiters to pass. Fixable in 1-2 weeks.",
    low: "Profile needs significant work before it's ready for recruiter evaluation. Focus on README quality and consistency.",
  };

  const recs = [];

  if (s.documentation < 50) {
    const worstReadme = [...s.readmeAnalysis].sort((a, b) => a.score - b.score)[0];
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
    if (!missing.length) missing.push("display name or other relevant profile details");
    recs.push({ title: "Complete your profile", detail: `Add: ${missing.join(", ")}. Recruiters skip incomplete profiles.`, priority: "high", impact: "First impression goes from amateur to professional" });
  }

  if (s.repoOrganization < 50) {
    recs.push({ title: "Clean up repo organization", detail: "Add descriptions to all repos, add topic tags, archive empty/abandoned repos, and set homepage URLs for deployed projects.", priority: "medium", impact: "Profile looks intentional instead of messy" });
  }

  // Fill to 5
  if (recs.length < 5) {
    recs.push({ title: "Add a standout project", detail: "Build one project that solves a real problem, deploy it, write a thorough README with screenshots, and pin it.", priority: "low", impact: "Gives recruiters something impressive to talk about in interviews" });
    if (recs.length < 5) recs.push({ title: "Engage with open source", detail: "Find a project you use and submit a PR — even fixing a typo in docs counts. It shows collaboration skills.", priority: "low", impact: "Demonstrates you can work in real codebases with others" });
  }

  for (const title of ["Add project tests", "Document project decisions", "Review your pinned projects"]) {
    if (recs.length < 5) recs.push({ title, detail: "Choose a representative project and make a concrete improvement that helps visitors understand or verify it.", priority: "low", impact: "Makes your work easier to evaluate" });
  }
  const topRepos = [...repoDetails].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 3).map((r) => r.name);
  const emptyRepos = repoDetails.filter((r) => (r.recentCommits || []).length <= 1 && r.stargazers_count === 0).slice(0, 2).map((r) => r.name);

  return {
    source: "local",
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
    weeklyPlan: `Week 1: Fix READMEs for top 3 repos (add screenshots, setup guide, live links). Complete your profile bio and links. Start daily commits.\nWeek 2: Add descriptions and topics to all repos. Archive empty repos. Write one blog post or detailed project writeup. Re-run the analysis to review changes; score improvements are not guaranteed.`,
  };
}

