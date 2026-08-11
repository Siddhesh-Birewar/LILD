/* ═══ STUDENT DASHBOARD ═══ */
let dashChart=null;

function goToDashboard(){
    document.getElementById('welcomeBackModal').classList.remove('open');
    showStudentDashboard();
}
function backToDashboard(){
    document.getElementById('mainApp').style.display='none';
    document.getElementById('terminateSessionBtn').style.display='none';
    document.getElementById('backToDashBtn').style.display='none';
    showStudentDashboard();
}
function showStudentDashboard(){
    document.getElementById('loginPage').style.display='none';
    document.getElementById('mainApp').style.display='none';
    document.getElementById('studentDashPage').style.display='block';
    document.getElementById('backToDashBtn').style.display='none';
    renderDashboard();
}
function logoutStudent(){
    currentUserId=null;currentSessionId=null;currentSessionNumber=0;
    sessionScore=0;sessionTotalPossible=0;sessionQuestionsSolved=0;
    document.getElementById('studentDashPage').style.display='none';
    document.getElementById('loginPage').style.display='block';
    document.getElementById('loginPage').classList.remove('slide-out');
    document.getElementById('terminateSessionBtn').style.display='none';
    document.getElementById('backToDashBtn').style.display='none';
}
async function startNewSessionFromDash(){
    try{
        const res=await apiPost('/api/session/start',{user_id:currentUserId,mode:'fresh'});
        if(res.status==='success'){
            currentSessionId=res.session_id;currentSessionNumber=res.session_number;
            sessionScore=0;sessionTotalPossible=0;sessionQuestionsSolved=0;
            document.getElementById('studentDashPage').style.display='none';
            const n=document.getElementById('sName').value.trim()||currentUserName||'Student';
            const r=document.getElementById('sRoll').value.trim()||currentUserRoll||'';
            enterAppFromDash(n,r);
            toast('✅ Session #'+currentSessionNumber+' started');
        }
    }catch(e){toast('❌ Failed to start session')}
}
function enterAppFromDash(name,roll){
    const app=document.getElementById('mainApp'),badge=document.getElementById('welcomeBadge');
    badge.innerHTML='👋 Welcome, <strong>'+name+'</strong> &nbsp;|&nbsp; Roll: <strong>'+roll+'</strong> &nbsp;|&nbsp; Session #'+currentSessionNumber;
    badge.style.display='block';app.style.display='block';
    document.getElementById('backToDashBtn').style.display='flex';
    document.getElementById('terminateSessionBtn').style.display='flex';
    nextProblem();
}
async function renderDashboard(){
    if(!currentUserId)return;
    let sessions=[],questions=[];
    try{sessions=await apiGet('/api/user/'+currentUserId+'/history')}catch(e){}
    try{questions=await apiGet('/api/user/'+currentUserId+'/questions')}catch(e){}
    const name=currentUserName||document.getElementById('sName').value||'Student';
    const roll=currentUserRoll||document.getElementById('sRoll').value||'';
    const branch=currentUserBranch||document.getElementById('sBranch').value||'';
    const sem=currentUserSem||document.getElementById('sSem').value||'';
    document.getElementById('dashAvatar').textContent=(name[0]||'S').toUpperCase();
    document.getElementById('dashUserName').textContent=name;
    document.getElementById('dashUserMeta').textContent='Roll: '+roll+' | '+branch+' | Sem '+sem;
    let totalQ=0,totalS=0,totalT=0,bestPct=0;
    sessions.forEach(function(s){totalQ+=s.questions_solved||0;totalS+=s.score||0;totalT+=s.total_marks||0;if(s.total_marks>0){var p=Math.round(s.score/s.total_marks*100);if(p>bestPct)bestPct=p}});
    var avgPct=totalT>0?Math.round(totalS/totalT*100):0;
    document.getElementById('dashStatsRow').innerHTML=
        '<div class="stat-card"><div class="sv">'+sessions.length+'</div><div class="sl">Sessions</div></div>'+
        '<div class="stat-card"><div class="sv">'+totalQ+'</div><div class="sl">Questions Solved</div></div>'+
        '<div class="stat-card"><div class="sv">'+avgPct+'%</div><div class="sl">Overall Average</div></div>'+
        '<div class="stat-card"><div class="sv">'+bestPct+'%</div><div class="sl">Best Session</div></div>'+
        '<div class="stat-card"><div class="sv">'+totalS+'/'+totalT+'</div><div class="sl">Total Marks</div></div>';
    renderImprovementCards(questions);
    renderDashChart(sessions);
    renderDashSessions(sessions);
}
function renderImprovementCards(questions){
    if(!questions.length){document.getElementById('improvementCards').innerHTML='<p style="color:var(--muted)">Solve some problems to see your areas of improvement.</p>';return}
    var rankOk=0,typeOk=0,relOk=0,rankTot=0,typeTot=0,relTot=0;
    questions.forEach(function(q){rankTot++;if(q.rank_correct)rankOk++;typeTot++;if(q.type_correct)typeOk++;if(q.li_ld_result==='LD'){relTot++;if(q.relation_correct)relOk++}});
    var rankPct=rankTot?Math.round(rankOk/rankTot*100):0;
    var typePct=typeTot?Math.round(typeOk/typeTot*100):0;
    var relPct=relTot?Math.round(relOk/relTot*100):0;
    function card(title,pct,emoji,desc){
        var cls=pct>=80?'imp-good':pct>=50?'imp-ok':'imp-bad';
        var label=pct>=80?'Strong':pct>=50?'Needs Practice':'Needs Work';
        return '<div class="imp-card '+cls+'"><div class="imp-emoji">'+emoji+'</div><div class="imp-title">'+title+'</div><div class="imp-bar-wrap"><div class="imp-bar" style="width:'+pct+'%"></div></div><div class="imp-pct">'+pct+'% correct</div><div class="imp-label">'+label+'</div><div class="imp-desc">'+desc+'</div></div>';
    }
    document.getElementById('improvementCards').innerHTML=
        card('Matrix Rank',rankPct,'🎯','Finding the rank of a matrix')+
        card('LI/LD Classification',typePct,'📐','Identifying Linear Independence vs Dependence')+
        card('Dependence Relation',relPct,'🔗',relTot?'Finding the linear dependence relation':'No LD problems attempted yet');
}
function renderDashChart(sessions){
    if(sessions.length<2){document.getElementById('dashChartSection').style.display='none';return}
    document.getElementById('dashChartSection').style.display='block';
    setTimeout(function(){
        var ctx=document.getElementById('dashProgressChart');if(!ctx)return;
        if(dashChart)dashChart.destroy();
        var labels=sessions.map(function(s,i){return '#'+(i+1)});
        var data=sessions.map(function(s){return s.total_marks>0?Math.round(s.score/s.total_marks*100):0});
        dashChart=new Chart(ctx,{type:'line',data:{labels:labels,datasets:[{label:'Score %',data:data,borderColor:'#4f46e5',backgroundColor:'rgba(79,70,229,0.1)',fill:true,tension:0.3,pointRadius:5,pointBackgroundColor:'#4f46e5'}]},options:{responsive:true,scales:{y:{beginAtZero:true,max:100,ticks:{callback:function(v){return v+'%'}}}},plugins:{legend:{display:false}}}});
    },100);
}
function renderDashSessions(sessions){
    if(!sessions.length){document.getElementById('dashSessionList').innerHTML='<p style="color:var(--muted);text-align:center;padding:20px">No sessions yet. Start your first session!</p>';return}
    var html='<table class="dash-session-table"><thead><tr><td>#</td><td>Date</td><td>Score</td><td>Questions</td><td>%</td><td>Status</td><td></td></tr></thead><tbody>';
    sessions.slice().reverse().forEach(function(s,i){
        var pct=s.total_marks>0?Math.round(s.score/s.total_marks*100):0;
        var dt=s.started_at?new Date(s.started_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—';
        var badge=s.completed?'<span class="badge green">✓ Done</span>':'<span class="badge yellow">Active</span>';
        var pctCls=pct>=70?'green':pct>=40?'yellow':'red';
        html+='<tr class="clickable-row" onclick="toggleDashSessionQuestions(\''+s.id+'\',this)"><td>'+(sessions.length-i)+'</td><td>'+dt+'</td><td>'+((s.score||0)+'/'+(s.total_marks||0))+'</td><td>'+(s.questions_solved||0)+'</td><td><span class="badge '+pctCls+'">'+pct+'%</span></td><td>'+badge+'</td><td>▶</td></tr><tr class="question-expand-row" id="dashQ_'+s.id+'" style="display:none"><td colspan="7"><div class="question-expand-body">Loading...</div></td></tr>';
    });
    html+='</tbody></table>';
    document.getElementById('dashSessionList').innerHTML=html;
}
async function toggleDashSessionQuestions(sessionId,rowEl){
    var expandRow=document.getElementById('dashQ_'+sessionId);
    if(expandRow.style.display!=='none'){expandRow.style.display='none';return}
    document.querySelectorAll('.question-expand-row').forEach(function(r){r.style.display='none'});
    expandRow.style.display='table-row';
    try{
        var questions=await apiGet('/api/session/'+sessionId+'/questions');
        if(!questions.length){expandRow.querySelector('.question-expand-body').innerHTML='<p style="color:var(--muted)">No questions recorded for this session.</p>';return}
        var h='<table class="q-detail-table"><thead><tr><td>Q#</td><td>Vectors</td><td>Rank</td><td>Rank✓</td><td>Type</td><td>Type✓</td><td>Relation✓</td><td>Score</td></tr></thead><tbody>';
        questions.forEach(function(q){
            var boolB=function(v){return v?'<span class="badge green">✓</span>':'<span class="badge red">✗</span>'};
            var vecs=q.vectors;if(typeof vecs==='string')try{vecs=JSON.parse(vecs)}catch(e){}
            var vecStr=Array.isArray(vecs)?vecs.map(function(v,i){return 'v'+(i+1)+'=['+v.join(',')+']'}).join(' '):'—';
            h+='<tr><td>'+q.question_number+'</td><td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis">'+vecStr+'</td><td>'+(q.user_rank||'—')+'/'+(q.correct_rank||'—')+'</td><td>'+boolB(q.rank_correct)+'</td><td>'+(q.user_type_answer||'—')+'</td><td>'+boolB(q.type_correct)+'</td><td>'+boolB(q.relation_correct)+'</td><td>'+(q.score||0)+'/'+(q.total_marks||0)+'</td></tr>';
        });
        h+='</tbody></table>';
        expandRow.querySelector('.question-expand-body').innerHTML=h;
    }catch(e){expandRow.querySelector('.question-expand-body').innerHTML='<p>Failed to load questions.</p>'}
}

/* ═══ ADMIN QUESTION DETAIL ═══ */
async function viewSessionQuestions(sessionId,sessionLabel){
    document.getElementById('adminSessionDetail').style.display='none';
    var detail=document.getElementById('adminQuestionDetail');
    document.getElementById('questionDetailTitle').textContent='📝 Questions — '+sessionLabel;
    detail.style.display='block';
    try{
        var questions=await apiGet('/api/session/'+sessionId+'/questions');
        if(!questions.length){document.getElementById('questionDetailBody').innerHTML='<p style="color:var(--muted)">No questions recorded.</p>';return}
        var h='<table class="session-detail-table"><thead><tr><td>Q#</td><td>Vectors</td><td>Matrix</td><td>Rank (User/Correct)</td><td>Rank✓</td><td>LI/LD</td><td>Type Answer</td><td>Type✓</td><td>Relation</td><td>Rel✓</td><td>Score</td></tr></thead><tbody>';
        questions.forEach(function(q){
            var boolB=function(v){return v?'<span class="badge green">✓</span>':'<span class="badge red">✗</span>'};
            var vecs=q.vectors;if(typeof vecs==='string')try{vecs=JSON.parse(vecs)}catch(e){}
            var vecStr=Array.isArray(vecs)?vecs.map(function(v,i){return 'v'+(i+1)+'=['+v.join(',')+']'}).join(', '):'—';
            var mat=q.matrix;if(typeof mat==='string')try{mat=JSON.parse(mat)}catch(e){}
            var matStr=Array.isArray(mat)?'['+mat.map(function(r){return'['+r.join(',')+']'}).join(',')+']':'—';
            h+='<tr><td>'+q.question_number+'</td><td style="font-size:11px;max-width:180px">'+vecStr+'</td><td style="font-size:11px;max-width:180px">'+matStr+'</td><td>'+(q.user_rank!=null?q.user_rank:'—')+'/'+(q.correct_rank!=null?q.correct_rank:'—')+'</td><td>'+boolB(q.rank_correct)+'</td><td><span class="badge '+(q.li_ld_result==='LI'?'blue':'purple')+'">'+(q.li_ld_result||'—')+'</span></td><td>'+(q.user_type_answer||'—')+'</td><td>'+boolB(q.type_correct)+'</td><td style="font-size:11px">'+(q.relation_input||'—')+'</td><td>'+boolB(q.relation_correct)+'</td><td>'+(q.score||0)+'/'+(q.total_marks||0)+'</td></tr>';
        });
        h+='</tbody></table>';
        document.getElementById('questionDetailBody').innerHTML=h;
    }catch(e){document.getElementById('questionDetailBody').innerHTML='<p>Failed to load.</p>'}
}
function closeQuestionDetail(){
    document.getElementById('adminQuestionDetail').style.display='none';
    document.getElementById('adminSessionDetail').style.display='block';
}
