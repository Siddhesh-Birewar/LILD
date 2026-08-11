/* ═══ STATE ═══ */
const ADMIN_PW = 'admin123';
let currentUserId = null, currentSessionId = null, currentSessionNumber = 0;
let currentUserName = '', currentUserRoll = '', currentUserBranch = '', currentUserSem = '';
let sessionMode = 'fresh', allAdminUsers = [], allAdminSessions = [];
let dbConnected = false, userSessions = [], adminTrendChart = null;
let sessionScore = 0, sessionTotalPossible = 0, sessionQuestionsSolved = 0;
let M = [], V = [], S = 0, RC = 0, RTC = 0, LD = 0;
let userRankInput = null, userTypeInput = null, userRelationInput = null;

window.addEventListener('DOMContentLoaded', function () { checkDBConnection() });

function setDBStatus(state, msg) { var el = document.getElementById('dbStatus'); el.className = 'db-status ' + state; el.innerHTML = '<div class="dot"></div> ' + msg }

/* ═══ API HELPERS ═══ */
async function apiPost(url, data) { var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return r.json() }
async function apiPatch(url, data) { var r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return r.json() }
async function apiGet(url) { var r = await fetch(url); return r.json() }
async function apiDelete(url) { var r = await fetch(url, { method: 'DELETE' }); return r.json() }
async function checkDBConnection() { setDBStatus('checking', 'Checking Backend…'); try { await apiGet('/api/admin/stats'); dbConnected = true; setDBStatus('connected', 'System Online') } catch (e) { dbConnected = false; setDBStatus('disconnected', 'System Offline') } }

function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(function () { t.classList.remove('show') }, 2800) }

/* ═══ LOGIN ═══ */
async function handleLogin() {
    var name = document.getElementById('sName').value.trim();
    var roll = document.getElementById('sRoll').value.trim();
    var email = document.getElementById('sEmail').value.trim();
    var branch = document.getElementById('sBranch').value;
    var sem = document.getElementById('sSem').value;
    var dob = document.getElementById('sDob').value;
    var emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    document.getElementById('emailErr').style.display = 'none';
    document.getElementById('loginErr').style.display = 'none';
    var valid = !!(name && roll && email && branch && sem && dob);
    if (email && !emailRx.test(email)) { document.getElementById('emailErr').style.display = 'block'; valid = false }
    if (!valid) { document.getElementById('loginErr').style.display = 'block'; return }
    var sp = document.getElementById('loginSpinner'); sp.innerHTML = '<span class="spinner"></span>';
    try {
        var res = await apiPost('/api/login', { name: name, roll: roll, email: email, branch: branch, sem: sem, dob: dob });
        sp.innerHTML = '';
        currentUserName = name; currentUserRoll = roll; currentUserBranch = branch; currentUserSem = sem;
        if (res.status === 'returning') {
            currentUserId = res.user.id;
            currentUserName = res.user.name || name; currentUserRoll = res.user.roll || roll;
            currentUserBranch = res.user.branch || branch; currentUserSem = res.user.sem || sem;
            userSessions = res.sessions || [];
            showWelcomeBack(res.user, userSessions);
        } else if (res.status === 'new') {
            currentUserId = res.user.id; userSessions = [];
            showStudentDashboard();
        } else {
            toast('❌ Login failed: ' + (res.message || 'Unknown error'));
        }
    } catch (e) { sp.innerHTML = ''; toast('❌ Connection error') }
}

function showWelcomeBack(user, sessions) {
    document.getElementById('wbAvatar').textContent = (user.name || '?')[0].toUpperCase();
    document.getElementById('wbTitle').textContent = 'Welcome back, ' + user.name + '!';
    document.getElementById('wbSubtitle').textContent = sessions.length + ' previous session' + (sessions.length !== 1 ? 's' : '') + ' found';
    var totalQ = 0, totalS = 0, totalT = 0, bestPct = 0;
    sessions.forEach(function (s) { totalQ += s.questions_solved || 0; totalS += s.score || 0; totalT += s.total_marks || 0; if (s.total_marks > 0) { var p = Math.round(s.score / s.total_marks * 100); if (p > bestPct) bestPct = p } });
    var avgPct = totalT > 0 ? Math.round(totalS / totalT * 100) : 0;
    document.getElementById('wbStats').innerHTML =
        '<div class="wb-stat"><div class="wb-stat-val">' + sessions.length + '</div><div class="wb-stat-label">Sessions</div></div>' +
        '<div class="wb-stat"><div class="wb-stat-val">' + totalQ + '</div><div class="wb-stat-label">Questions</div></div>' +
        '<div class="wb-stat"><div class="wb-stat-val">' + avgPct + '%</div><div class="wb-stat-label">Avg Score</div></div>' +
        '<div class="wb-stat"><div class="wb-stat-val">' + bestPct + '%</div><div class="wb-stat-label">Best Score</div></div>';
    document.getElementById('welcomeBackModal').classList.add('open');
}

function cancelWelcomeBack() { document.getElementById('welcomeBackModal').classList.remove('open') }

async function startSessionDirect(mode) {
    sessionMode = mode;
    document.getElementById('welcomeBackModal').classList.remove('open');
    try {
        var res = await apiPost('/api/session/start', { user_id: currentUserId, mode: mode });
        if (res.status === 'success') {
            currentSessionId = res.session_id; currentSessionNumber = res.session_number;
            if (mode === 'continue') { sessionScore = res.cumulative_score || 0; sessionTotalPossible = res.cumulative_total || 0; sessionQuestionsSolved = res.cumulative_questions || 0 }
            else { sessionScore = 0; sessionTotalPossible = 0; sessionQuestionsSolved = 0 }
            var name = currentUserName || document.getElementById('sName').value.trim();
            var roll = currentUserRoll || document.getElementById('sRoll').value.trim();
            enterApp(name, roll);
            toast('✅ Session #' + currentSessionNumber + ' started (' + mode + ')');
        }
    } catch (e) { toast('❌ Failed to start session') }
}

function enterApp(name, roll) {
    var lp = document.getElementById('loginPage'); lp.classList.add('slide-out');
    setTimeout(function () {
        lp.style.display = 'none';
        document.getElementById('studentDashPage').style.display = 'none';
        var app = document.getElementById('mainApp'), badge = document.getElementById('welcomeBadge');
        badge.innerHTML = '👋 Welcome, <strong>' + name + '</strong> &nbsp;|&nbsp; Roll: <strong>' + roll + '</strong> &nbsp;|&nbsp; Session #' + currentSessionNumber;
        badge.style.display = 'block'; app.style.display = 'block'; app.classList.add('slide-in');
        document.getElementById('backToDashBtn').style.display = 'flex';
        document.getElementById('terminateSessionBtn').style.display = 'flex';
    }, 420);
}

async function terminateSession() {
    if (!confirm("End session and see final results?")) return;
    if (currentSessionId) { try { await apiPost('/api/session/end', { session_id: currentSessionId }) } catch (e) { } }
    currentSessionId = null;
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('terminateSessionBtn').style.display = 'none';
    document.getElementById('backToDashBtn').style.display = 'none';
    showStudentDashboard();
    toast("🏁 Session terminated. Score saved.");
}

function nextProblem() {
    M = []; V = []; S = 0; RC = 0; RTC = 0; LD = 0;
    userRankInput = null; userTypeInput = null; userRelationInput = null;
    ['numVectors', 'dimension'].forEach(function (id) { document.getElementById(id).value = '' });
    ['vectorInputs', 'matrixOutput', 'rankResult', 'relationTypeResult', 'relationResult', 'rankStepsOutput', 'solutionOutput'].forEach(function (id) { document.getElementById(id).innerHTML = '' });
    ['makeMatrixBtn', 'matrixTitle', 'rankSection', 'relationTypeSection', 'relationSection', 'scoreSection', 'nextProblemBtn'].forEach(function (id) { document.getElementById(id).style.display = 'none' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ═══ MATH ═══ */
function generateInputs() {
    var n = +document.getElementById('numVectors').value, d = +document.getElementById('dimension').value;
    if (!n || !d) return alert("Enter valid values");
    var c = document.getElementById('vectorInputs'); c.innerHTML = "<h3 class='section-title'>Enter Vectors</h3>";
    for (var i = 0; i < n; i++)c.innerHTML += '<label>Vector ' + (i + 1) + '</label><input id="vec' + i + '" placeholder="e.g. 1 2 3">';
    document.getElementById('makeMatrixBtn').style.display = "block";
}
function createMatrix() {
    var n = +document.getElementById('numVectors').value, d = +document.getElementById('dimension').value, v = [];
    for (var i = 0; i < n; i++) { var vals = document.getElementById('vec' + i).value.trim().split(/\s+/).map(Number); if (vals.length !== d) return alert('Vector ' + (i + 1) + ' must have ' + d + ' values'); if (vals.some(isNaN)) return alert('Vector ' + (i + 1) + ' has invalid numbers'); v.push(vals) }
    V = v; M = Array.from({ length: d }, function (_, r) { return v.map(function (x) { return x[r] }) });
    document.getElementById('matrixOutput').innerHTML = '<table>' + M.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + x + '</td>' }).join('') + '</tr>' }).join('') + '</table>';
    document.getElementById('matrixTitle').style.display = "block"; document.getElementById('rankSection').style.display = "block";
}
function rref(m) { m = m.map(function (r) { return r.slice() }); var l = 0; var e = 1e-10; for (var r = 0; r < m.length; r++) { if (l >= m[0].length) return m; var i = r; while (Math.abs(m[i][l]) < e) { if (++i === m.length) { i = r; if (++l === m[0].length) return m } } var tmp = m[r]; m[r] = m[i]; m[i] = tmp; var lv = m[r][l]; m[r] = m[r].map(function (x) { return x / lv }); for (var i2 = 0; i2 < m.length; i2++) { if (i2 !== r) { var f = m[i2][l]; m[i2] = m[i2].map(function (x, j) { return x - f * m[r][j] }) } } l++ } return m }
function computeRank(m) { if (!m || !m.length) return 0; return rref(m).filter(function (r) { return r.some(function (v) { return Math.abs(v) > 1e-10 }) }).length }

/* ═══ SCORING ═══ */
function submitRank() {
    var u = +document.getElementById('matrixRank').value, c = computeRank(M), n = V.length, rd = document.getElementById('rankResult');
    if (isNaN(u)) { rd.innerHTML = '<div class="error">✖ Enter a valid number</div>'; return }
    userRankInput = u;
    if (u === c) { RC = 1; S = 1; rd.innerHTML = '<div class="success">✔ Correct! Rank = ' + c + ' (1 mark)</div>'; document.getElementById('reenterRankBtn').style.display = "none" }
    else { RC = 0; S = 0; rd.innerHTML = '<div class="error">✖ Incorrect. Try again (0 marks)</div>'; document.getElementById('reenterRankBtn').style.display = "block" }
    LD = (c < n); document.getElementById('relationTypeSection').style.display = "block";
    document.getElementById('totalMarks').textContent = LD ? "3" : "2";
    document.getElementById('scoreSection').style.display = "block"; document.getElementById('score').textContent = S; updateBreakdown();
}
function submitRelationType(u) {
    var c = LD ? 'LD' : 'LI', rd = document.getElementById('relationTypeResult');
    userTypeInput = u;
    if (u === c) { RTC = 1; S = RC ? 2 : 1; rd.innerHTML = '<div class="success">✔ Correct! Vectors are ' + c + ' (1 mark)</div>'; document.getElementById('reenterTypeBtn').style.display = "none"; if (LD) document.getElementById('relationSection').style.display = "block"; else finishProblem() }
    else { RTC = 0; S = RC ? 1 : 0; rd.innerHTML = '<div class="error">✖ Incorrect (0 marks)</div>'; document.getElementById('reenterTypeBtn').style.display = "block" }
    document.getElementById('score').textContent = S; updateBreakdown();
}
function submitRelation() {
    var input = document.getElementById('relationInput').value.trim(), c = input.split(/\s+/).map(Number), n = V.length, d = V[0].length, rd = document.getElementById('relationResult');
    if (c.length !== n) { rd.innerHTML = '<div class="error">✖ Enter ' + n + ' coefficients</div>'; return }
    userRelationInput = input;
    var ok = 1; var t = 1e-8; for (var i = 0; i < d; i++) { var s = 0; for (var j = 0; j < n; j++)s += c[j] * V[j][i]; if (Math.abs(s) > t) { ok = 0; break } }
    if (c.every(function (x) { return Math.abs(x) < 1e-10 })) ok = 0;
    if (ok) { S = (RC ? 1 : 0) + (RTC ? 1 : 0) + 1; rd.innerHTML = '<div class="success">✔ Correct relation! (1 mark)</div>'; document.getElementById('reenterRelationBtn').style.display = "none" }
    else { S = (RC ? 1 : 0) + (RTC ? 1 : 0); rd.innerHTML = '<div class="error">✖ Incorrect relation (0 marks)</div>'; document.getElementById('reenterRelationBtn').style.display = "block" }
    document.getElementById('score').textContent = S; updateBreakdown(); finishProblem();
}
function finishProblem() {
    var tot = LD ? 3 : 2; sessionScore += S; sessionTotalPossible += tot; sessionQuestionsSolved++;
    document.getElementById('nextProblemBtn').style.display = "block";
    persistScore(); saveQuestionResult();
    toast('✅ Problem done! Session: ' + sessionScore + '/' + sessionTotalPossible);
}
async function persistScore() {
    if (!currentSessionId) return;
    try { await apiPatch('/api/session/update?id=' + currentSessionId, { score: sessionScore, total_marks: sessionTotalPossible, questions_solved: sessionQuestionsSolved, li_ld_result: LD ? 'LD' : 'LI', rank_correct: RC === 1, type_correct: RTC === 1, completed: true }) } catch (e) { console.warn('Persist failed:', e) }
}
async function saveQuestionResult() {
    if (!currentSessionId || !currentUserId) return;
    try {
        await apiPost('/api/question/save', {
            session_id: currentSessionId, user_id: currentUserId,
            question_number: sessionQuestionsSolved,
            vectors: V, matrix: M,
            correct_rank: computeRank(M), user_rank: userRankInput, rank_correct: RC === 1,
            li_ld_result: LD ? 'LD' : 'LI', user_type_answer: userTypeInput || '', type_correct: RTC === 1,
            relation_input: userRelationInput || '', relation_correct: (S - (RC ? 1 : 0) - (RTC ? 1 : 0)) > 0,
            score: S, total_marks: LD ? 3 : 2
        })
    } catch (e) { console.warn('Save question failed:', e) }
}

/* ═══ UI HELPERS ═══ */
function reenterRank() { document.getElementById('rankResult').innerHTML = ""; document.getElementById('matrixRank').value = "" }
function reenterType() { document.getElementById('relationTypeResult').innerHTML = "" }
function reenterRelation() { document.getElementById('relationResult').innerHTML = ""; document.getElementById('relationInput').value = "" }
function updateBreakdown() { var h = '<ul>'; h += '<li>Rank: ' + RC + '/1</li>'; h += '<li>Classification: ' + RTC + '/1</li>'; if (LD) h += '<li>Relation: ' + (S - RC - RTC) + '/1</li>'; h += '</ul>'; document.getElementById('breakdownDetails').innerHTML = h }
function fmtMat(m) {
    return '<table class="step-matrix">' + m.map(function (r) {
        return '<tr>' + r.map(function (x) {
            var v = Math.abs(x) < 1e-10 ? 0 : Math.round(x * 10000) / 10000;
            return '<td>' + v + '</td>';
        }).join('') + '</tr>';
    }).join('') + '</table>';
}

function showRankSteps() {
    var m = M.map(function (r) { return r.slice() });
    var rows = m.length, cols = m[0].length;
    var html = '<h3 style="margin-top:0;color:#4f46e5">Step-by-Step Row Reduction (RREF)</h3>';
    html += '<div class="step-block"><strong>Step 0:</strong> Initial Matrix</div>' + fmtMat(m);
    var stepNum = 1, lead = 0;
    for (var r = 0; r < rows; r++) {
        if (lead >= cols) break;
        var i = r;
        while (Math.abs(m[i][lead]) < 1e-10) {
            i++;
            if (i === rows) { i = r; lead++; if (lead === cols) { lead = -1; break; } }
        }
        if (lead === -1) break;
        if (i !== r) {
            var tmp = m[r]; m[r] = m[i]; m[i] = tmp;
            html += '<div class="step-block"><strong>Step ' + stepNum++ + ':</strong> Swap R' + (r + 1) + ' ↔ R' + (i + 1) + '</div>' + fmtMat(m);
        }
        var lv = m[r][lead];
        if (Math.abs(lv) > 1e-10 && Math.abs(lv - 1) > 1e-10) {
            var dispLv = Math.round(lv * 10000) / 10000;
            m[r] = m[r].map(function (x) { return x / lv });
            html += '<div class="step-block"><strong>Step ' + stepNum++ + ':</strong> R' + (r + 1) + ' → R' + (r + 1) + ' / ' + dispLv + '  (make pivot = 1)</div>' + fmtMat(m);
        }
        for (var i2 = 0; i2 < rows; i2++) {
            if (i2 !== r && Math.abs(m[i2][lead]) > 1e-10) {
                var f = m[i2][lead];
                var dispF = Math.round(f * 10000) / 10000;
                m[i2] = m[i2].map(function (x, j) { return x - f * m[r][j] });
                var sign = dispF > 0 ? '−' : '+';
                var absF = Math.abs(dispF);
                html += '<div class="step-block"><strong>Step ' + stepNum++ + ':</strong> R' + (i2 + 1) + ' → R' + (i2 + 1) + ' ' + sign + ' ' + absF + '·R' + (r + 1) + '</div>' + fmtMat(m);
            }
        }
        lead++;
    }
    var rank = m.filter(function (r) { return r.some(function (v) { return Math.abs(v) > 1e-10 }) }).length;
    html += '<div class="step-block" style="background:#dcfce7;border-left-color:#059669"><strong>Result:</strong> The RREF has <strong>' + rank + '</strong> non-zero row(s), so <strong>Rank = ' + rank + '</strong></div>';
    html += '<div class="step-block" style="background:#eff6ff;border-left-color:#3b82f6"><strong>Conclusion:</strong> ';
    if (rank < V.length) {
        html += 'Since Rank (' + rank + ') &lt; Number of vectors (' + V.length + '), the vectors are <strong>Linearly Dependent (LD)</strong>.';
    } else {
        html += 'Since Rank (' + rank + ') = Number of vectors (' + V.length + '), the vectors are <strong>Linearly Independent (LI)</strong>.';
    }
    html += '</div>';
    var out = document.getElementById('rankStepsOutput');
    out.innerHTML = html;
    out.style.display = 'block';
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showSolution() {
    var n = V.length, d = V[0].length;
    var m = Array.from({ length: d }, function (_, r) { return V.map(function (x) { return x[r] }) });
    var rr = rref(m.map(function (r) { return r.slice() }));
    var rank = rr.filter(function (r) { return r.some(function (v) { return Math.abs(v) > 1e-10 }) }).length;
    var html = '<h3 style="margin-top:0;color:#dc2626">Solution: Linear Dependence Relation</h3>';
    if (rank >= n) {
        html += '<p>The vectors are <strong>Linearly Independent</strong> — no non-trivial relation exists.</p>';
    } else {
        var pivotCols = [], freeCols = [];
        var pRow = 0;
        for (var c = 0; c < n && pRow < rr.length; c++) {
            if (Math.abs(rr[pRow][c]) > 1e-10) { pivotCols.push(c); pRow++; }
            else { freeCols.push(c); }
        }
        for (var c2 = pRow < rr.length ? rr[0].length : n; c2 < n; c2++) { if (pivotCols.indexOf(c2) === -1) freeCols.push(c2); }
        html += '<p><strong>Pivot columns:</strong> ' + pivotCols.map(function (c) { return 'v' + (c + 1) }).join(', ') + '</p>';
        html += '<p><strong>Free variable(s):</strong> ' + freeCols.map(function (c) { return 'c' + (c + 1) }).join(', ') + '</p>';
        freeCols.forEach(function (fc, idx) {
            var coeffs = new Array(n);
            for (var i = 0; i < n; i++) coeffs[i] = 0;
            coeffs[fc] = 1;
            for (var p = 0; p < pivotCols.length; p++) {
                var pc = pivotCols[p];
                if (fc < rr[0].length) { coeffs[pc] = -rr[p][fc]; }
            }
            var parts = [];
            for (var j = 0; j < n; j++) {
                var cv = Math.abs(coeffs[j]) < 1e-10 ? 0 : Math.round(coeffs[j] * 10000) / 10000;
                if (cv !== 0) {
                    if (parts.length === 0) { parts.push(cv + '·v' + (j + 1)); }
                    else { parts.push((cv > 0 ? '+ ' : '− ') + Math.abs(cv) + '·v' + (j + 1)); }
                }
            }
            html += '<div class="step-block" style="background:#fef2f2;border-left-color:#dc2626"><strong>Relation ' + (idx + 1) + ':</strong> ' + parts.join(' ') + ' = <strong>0</strong></div>';
            html += '<p style="color:#6b7280;font-size:13px">Coefficients to enter: <code>' + coeffs.map(function (c) { return Math.abs(c) < 1e-10 ? 0 : Math.round(c * 10000) / 10000 }).join(' ') + '</code></p>';
        });
    }
    var out = document.getElementById('solutionOutput');
    out.innerHTML = html;
    out.style.display = 'block';
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ═══ ADMIN ═══ */
function openAdminPanel() { document.getElementById('adminPanel').classList.add('open') }
function closeAdminPanel() { document.getElementById('adminPanel').classList.remove('open') }
function checkAdminPw() { if (document.getElementById('adminPw').value === ADMIN_PW) { document.getElementById('adminLogin').style.display = 'none'; document.getElementById('adminDash').style.display = 'block'; loadAdminData() } else { document.getElementById('adminPwErr').textContent = '❌ Wrong password' } }

async function loadAdminData() {
    try {
        var res = await Promise.all([apiGet('/api/admin/users'), apiGet('/api/admin/stats')]);
        allAdminUsers = res[0]; renderAdminStats(res[1]); filterAdminTable(); renderAdminTrend();
    } catch (e) { toast('❌ Failed to load admin data') }
}

function renderAdminStats(st) {
    var compRate = st.total_sessions > 0 ? Math.round(st.completed_sessions / st.total_sessions * 100) : 0;
    document.getElementById('adminStats').innerHTML =
        '<div class="stat-card"><div class="sv">' + (st.total_users || 0) + '</div><div class="sl">Total Users</div></div>' +
        '<div class="stat-card"><div class="sv">' + (st.total_sessions || 0) + '</div><div class="sl">Total Sessions</div></div>' +
        '<div class="stat-card"><div class="sv">' + (st.avg_score_pct || 0) + '%</div><div class="sl">Avg Score</div></div>' +
        '<div class="stat-card"><div class="sv">' + compRate + '%</div><div class="sl">Completion</div></div>' +
        '<div class="stat-card"><div class="sv">' + (st.total_questions || 0) + '</div><div class="sl">Questions</div></div>' +
        '<div class="stat-card"><div class="sv">' + (st.top_performer || '—') + '</div><div class="sl">Top Performer</div></div>';
}

function filterAdminTable() {
    var q = (document.getElementById('adminSearch').value || '').toLowerCase();
    var br = document.getElementById('adminFilterBranch').value;
    var sm = document.getElementById('adminFilterSem').value;
    var filtered = allAdminUsers.filter(function (u) {
        if (q && !(u.name || '').toLowerCase().includes(q) && !(u.roll || '').toLowerCase().includes(q) && !(u.email || '').toLowerCase().includes(q)) return false;
        if (br && u.branch !== br) return false;
        if (sm && u.sem !== sm) return false;
        return true;
    });
    var tbody = document.getElementById('adminUserTbody');
    var noRec = document.getElementById('noRecords');
    if (!filtered.length) { tbody.innerHTML = ''; noRec.style.display = 'block'; return }
    noRec.style.display = 'none';
    tbody.innerHTML = filtered.map(function (u, i) {
        var dt = u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
        var safeName = (u.name || '').replace(/'/g, "\\'");
        return '<tr onclick="viewUserSessions(\'' + u.id + '\',\'' + safeName + '\')" class="clickable-row"><td>' + (i + 1) + '</td><td><strong>' + (u.name || '—') + '</strong></td><td>' + (u.roll || '—') + '</td><td style="font-size:11px">' + (u.email || '—') + '</td><td>' + (u.branch || '—') + '</td><td>' + (u.sem || '—') + '</td><td>' + (u.total_sessions || 0) + '</td><td>' + (u.total_questions || 0) + '</td><td><span class="badge ' + ((u.avg_percentage || 0) >= 70 ? 'green' : (u.avg_percentage || 0) >= 40 ? 'yellow' : 'red') + '">' + (u.avg_percentage || 0) + '%</span></td><td><span class="badge ' + ((u.best_percentage || 0) >= 70 ? 'green' : 'yellow') + '">' + (u.best_percentage || 0) + '%</span></td><td>' + dt + '</td><td>▶</td></tr>';
    }).join('');
}

async function viewUserSessions(userId, userName) {
    document.getElementById('adminQuestionDetail').style.display = 'none';
    var detail = document.getElementById('adminSessionDetail');
    document.getElementById('sessionDetailTitle').textContent = '📋 Sessions — ' + userName;
    detail.style.display = 'block';
    try {
        var sessions = await apiGet('/api/user/' + userId + '/history');
        var h = '<table class="session-detail-table"><thead><tr><td>#</td><td>Date</td><td>Score</td><td>Questions</td><td>%</td><td>LI/LD</td><td>Rank✓</td><td>Type✓</td><td>Status</td><td></td></tr></thead><tbody>';
        sessions.slice().reverse().forEach(function (s, i) {
            var pct = s.total_marks > 0 ? Math.round(s.score / s.total_marks * 100) : 0;
            var dt = s.started_at ? new Date(s.started_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—';
            var boolB = function (v) { return v ? '<span class="badge green">✓</span>' : '<span class="badge red">✗</span>' };
            var sessLabel = 'Session #' + (sessions.length - i) + ' (' + userName + ')';
            h += '<tr><td>' + (sessions.length - i) + '</td><td>' + dt + '</td><td>' + (s.score || 0) + '/' + (s.total_marks || 0) + '</td><td>' + (s.questions_solved || 0) + '</td><td><span class="badge ' + (pct >= 70 ? 'green' : pct >= 40 ? 'yellow' : 'red') + '">' + pct + '%</span></td><td><span class="badge ' + (s.li_ld_result === 'LI' ? 'blue' : s.li_ld_result === 'LD' ? 'purple' : '') + '">' + (s.li_ld_result || '—') + '</span></td><td>' + boolB(s.rank_correct) + '</td><td>' + boolB(s.type_correct) + '</td><td>' + (s.completed ? '<span class="badge green">Done</span>' : '<span class="badge yellow">Active</span>') + '</td><td><button onclick="event.stopPropagation();viewSessionQuestions(\'' + s.id + '\',\'' + sessLabel.replace(/'/g, "\\'") + '\')" style="width:auto;padding:4px 10px;font-size:11px;border-radius:6px;background:linear-gradient(135deg,#4f46e5,#6366f1)">📝 Questions</button></td></tr>';
        });
        h += '</tbody></table>';
        document.getElementById('sessionDetailBody').innerHTML = h;
    } catch (e) { document.getElementById('sessionDetailBody').innerHTML = '<p>Failed to load sessions.</p>' }
}

function closeSessionDetail() { document.getElementById('adminSessionDetail').style.display = 'none' }

async function renderAdminTrend() {
    try {
        var sessions = await apiGet('/api/admin/sessions');
        if (!sessions.length) return;
        var byDate = {}; sessions.forEach(function (s) { var d = s.started_at ? s.started_at.substring(0, 10) : 'unknown'; if (!byDate[d]) byDate[d] = { count: 0, totalPct: 0 }; byDate[d].count++; if (s.total_marks > 0) byDate[d].totalPct += s.score / s.total_marks * 100 });
        var dates = Object.keys(byDate).sort();
        var counts = dates.map(function (d) { return byDate[d].count });
        var avgs = dates.map(function (d) { return byDate[d].count > 0 ? Math.round(byDate[d].totalPct / byDate[d].count) : 0 });
        var ctx = document.getElementById('adminTrendChart'); if (!ctx) return;
        if (adminTrendChart) adminTrendChart.destroy();
        adminTrendChart = new Chart(ctx, {
            type: 'bar', data: {
                labels: dates, datasets: [
                    { label: 'Sessions', data: counts, backgroundColor: 'rgba(79,70,229,0.6)', borderRadius: 6, yAxisID: 'y' },
                    { label: 'Avg Score %', data: avgs, type: 'line', borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.1)', fill: true, tension: 0.3, yAxisID: 'y1' }
                ]
            }, options: { responsive: true, scales: { y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Sessions' } }, y1: { beginAtZero: true, max: 100, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Avg %' } } } }
        });
    } catch (e) { }
}

function exportCSV() {
    var csv = 'Name,Roll,Email,Branch,Sem,Sessions,Questions,Avg%,Best%\n';
    allAdminUsers.forEach(function (u) {
        csv += '"' + u.name + '","' + u.roll + '","' + u.email + '","' + u.branch + '","' + u.sem + '",' +
            (u.total_sessions || 0) + ',' + (u.total_questions || 0) + ',' + (u.avg_percentage || 0) + ',' + (u.best_percentage || 0) + '\n'
    });
    var blob = new Blob([csv], { type: 'text/csv' }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'performance_report.csv'; a.click();
}

async function clearAllData() {
    if (!confirm('⚠️ Delete ALL users and sessions? This cannot be undone!')) return;
    try { await apiDelete('/api/admin/clear'); toast('🗑️ All data cleared'); loadAdminData() } catch (e) { toast('❌ Clear failed') }
}
