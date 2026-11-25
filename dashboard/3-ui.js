(() => {
var verdictOrder={SKIP:0,THIN:1,FARM:2};function compareRows(e,t,a,s,n){if(a==="name")return s*n(e.name.toLowerCase(),t.name.toLowerCase());
if(a==="verdict")return s*(verdictOrder[e.verdict]-verdictOrder[t.verdict]);let l=e[a],i=t[a];return l===null||i===null?+(l===null)-+(i===null):
s*(Number(l)-Number(i))}function selectRows(e,t,a){let{sort:s,dir:n,cat:l,chain:i,wl:o}=t,d=t.q.trim().toLowerCase(),c=n==="asc"?1:-1;return e.
filter(r=>(!l||r.category===l)&&(!i||r.chains.includes(i))&&(!o||r.watchlist)&&(!d||r.name.toLowerCase().includes(d))).sort((r,u)=>compareRows(
r,u,s,c,a)||a(r.slug,u.slug))}function serializeBoard(e,t,a){let s=e.map(l=>({...l,depositUsd:a}));if(t==="json")return JSON.stringify(s);let n=l=>{
let i=Array.isArray(l)?JSON.stringify(l):String(l??"");return`"${(typeof l=="string"&&/^[=+@-]/.test(i.trimStart())?`'${i}`:i).replaceAll('"',
'""')}"`};return[Object.keys(s[0]??{}),...s.map(l=>Object.values(l))].map(l=>l.map(n).join(",")).join(`\r
`)}function formatInteger(e){return e===null?"\u2014":e.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",")}function formatCompactUsd(e){let t=Math.
min(4,Math.floor(Math.log10(e)/3));return t<1?`$${e}`:`$${(e/1e3**t).toFixed(2)}${" KMBT"[t]}`}function signedTerm(e,t=3){return`${e<0?"\u2212":
"+"} ${Math.abs(e).toFixed(t)}`}function formatOdds(e){return`${(e*100).toFixed(e<.05?2:1)}%`}function formatPercent(e){if(e===null)return"\u2014";
let t=Math.abs(e).toFixed(1);return`${t==="0.0"?"":e<0?"\u2212":"+"}${t}%`}function escapeHtml(e){return e.replaceAll("&","&amp;").replaceAll(
"<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}function tableBody(e,t,a={}){return!e.length&&a.empty?`<\
tr><td colspan="${t}" class="empty">${escapeHtml(a.empty)}</td></tr>`:e.map(s=>`<tr${a.linked?" data-protocol":""}><td>${s.join("</td><td>")}\
</td></tr>`).join("")}function table(e,t,a={}){let s=e.map(o=>{if(typeof o=="string")return`<th scope="col">${escapeHtml(o)}</th>`;let[d,c]=o,
r=a.dir==="desc"?"descending":"ascending";return`<th scope="col"${a.sort===d?` aria-sort="${r}"`:""}><button type="button" data-sort="${escapeHtml(
d)}">${escapeHtml(c)}</button></th>`}),[n,...l]=a.total??[],i=n===void 0?"":`<tfoot><tr><th scope="row">${n}</th><td>${l.join("</td><td>")}<\
/td></tr></tfoot>`;return`<table${a.className?` class="${a.className}"`:""}><thead><tr>${s.join("")}</tr></thead><tbody>${tableBody(t,e.length,
a)}</tbody>${i}</table>`}function svg(e,t,a){return`<svg viewBox="0 0 ${e} ${t}" preserveAspectRatio="none" aria-hidden="true">${a}</svg>`}var columns={
rank:"Rank",name:"Protocol",value:"Implied value",launchValue:"Launch value",odds:"Odds 12m",tvl:"TVL",growth:"7d %",age:"Days listed",cost:"\
Plan",verdict:"Verdict",netPerHour:"Net/h",watchlist:"Watchlist"},statusLabels={traded:"Token trades","token-unpriced":"Records an unpriced \
token","pre-token":"Records no token",excluded:"Excluded by the house rule"};function protocolHref(e,t){return`#/p/${encodeURIComponent(e)}${t.
slice(2)}`}function boardTable(){return`<section class="table-window" aria-label="Protocol rankings" tabindex="0">${table(Object.entries(columns),
[],{className:"ranking",sort:"rank",dir:"asc"})}</section>`}function chip(e,t="chip"){return`<span class="${t}">${escapeHtml(e)}</span>`}function growthText(e){
let t=formatPercent(e);return`<span class="${t.startsWith("+")?"gain":t.startsWith("\u2212")?"loss":""}">${t}</span>`}function boardRows(e,t,a,s){
let n=l=>Math.log1p(l)/a*100;return tableBody(e.map(l=>{let{slug:i,chains:o}=l,d=escapeHtml(protocolHref(i,t)),c=[l.category??"Unlisted cate\
gory",...o.slice(0,2)];o.length>2&&c.push(`+${o.length-2}`);let[r,u]=l.interval??[0,0],f=l.interval?`<rect class="band" x="${n(r).toFixed(2)}\
" y="5" width="${(n(u)-n(r)).toFixed(2)}" height="3"></rect>`:"";return[`${l.rank}<small class="rank-range" title="Bootstrap P10\u2013P90 rank">${l.
rankRange?.join("\u2013")??"\u2014"}</small>`,`<a class="protocol-name" href="${d}">${escapeHtml(l.name)}</a>
       <div class="chips" title="${escapeHtml(o.join(", "))}">${c.map(v=>chip(v)).join("")}</div>`,`<div class="value" ${l.interval?`title="\
P10\u2013P90: ${s(r)}\u2013${s(u)}"`:""}><strong>${s(l.value)}</strong>
        ${svg(100,8,`<rect width="${n(l.value).toFixed(2)}" height="3"></rect>${f}`)}</div>`,s(l.launchValue),formatOdds(l.odds),s(l.tvl),growthText(
l.growth),formatInteger(l.age),`${s(l.cost)} \xB7 ${l.time} min`,l.verdict,s(l.netPerHour),l.watchlist?chip("Watchlist","badge"):"\u2014"]}),
Object.keys(columns).length,{linked:true,empty:"No protocols match these filters."})}function censusSummary(e,t){let a={"pre-token":0,traded:0,
"token-unpriced":0,excluded:0},s=0;for(let{slug:o,status:d}of e){if(!Object.hasOwn(a,d))throw new Error("Census counts do not add up");t?.has(
o)?s++:a[d]++}let n=(o,d=o)=>`<a href="#/census?status=${o}${t?"&amp;unranked=1":""}">${formatInteger(a[o])} ${d}</a>`,l=[n("traded"),n("tok\
en-unpriced","token, unpriced"),n("excluded")],i=formatInteger(e.length);return`<p class="census-summary">${t?`All ${i} protocols accounted \
for: ${formatInteger(s)} ranked \xB7 ${l.join(" \xB7 ")}`:`${i} protocols = ${n("pre-token","pre-token (ranked)")} + ${l.join(" + ")}`}</p>`}
function selectCensus(e,{status:t,sort:a,dir:s,unranked:n},l,i){let o=s==="asc"?1:-1,d=(c,r)=>r==="status"?statusLabels[c.status]:c[r].toLowerCase();
return e.filter(c=>(!t||c.status===t)&&(!n||!i?.has(c.slug))).sort((c,r)=>{let u=a==="tvl"?c.tvl_usd-r.tvl_usd:l(d(c,a),d(r,a));return o*u||
l(c.slug,r.slug)})}function censusView(e,t,a,s,n){let l=selectCensus(e,t,s,n);return`<h2>Protocol census</h2>${censusSummary(e)}
    <div class="filters">
      <label class="field">Status <select name="status"><option value="">All statuses</option>${Object.entries(statusLabels).map(([i,o])=>`<\
option value="${i}"${t.status===i?" selected":""}>${o}</option>`).join("")}</select></label>
      <output id="results">${formatInteger(l.length)} of ${formatInteger(e.length)} protocols</output>
    </div>
    ${table([["name","Protocol"],["status","Status"],["reason","Reason"],["tvl","TVL"]],l.map(({name:i,status:o,reason:d,tvl_usd:c})=>[escapeHtml(
i),statusLabels[o],escapeHtml(d),a(c)]),{...t,className:"ranking census",empty:"No matching protocols."})}`}function element(e,t=document){let a=t.
querySelector(e);if(!a)throw new Error(`Missing dashboard element ${e}`);return a}function integrityChecks(e,t,a,{fitted:s,houseRule:n,intervalCounts:l,
invalidPoints:i,coverageUnavailable:o,loo:d}){let c=e.length,r=new Set(t.map(b=>b?.slug)),u=new Set(a),f=[...u].filter(b=>r.has(b)).length,{
missLow:v,covered:m,missHigh:k}=l,$=v+m+k,h=n.truePositives.length,M=n.falsePositives.length,{model:P,flatMultiple:p}=d,g=P.n===s&&p.n===s;return[
{pass:c===0,label:c?`Recompute \u2260 published board \xB7 launch values, odds, implied values, ranks, plans, economics (${c} mismatched \xB7 ${e[0]}\
)`:`Recompute = published board \xB7 ${t.length} ${t.length===1?"row":"rows"}`},{pass:f===u.size,label:`Watchlist ${f}/${u.size}`},{pass:h===
u.size&&u.size>0,label:`House rule ${h}/${u.size}${M?` \xB7 +${M} via parentProtocol`:""}`},o?{pass:null,label:"Coverage unavailable \xB7 too f\
ew traded families"}:{pass:i===0&&Object.values(l).every(b=>Number.isInteger(b)&&b>=0)&&$===s&&m/$>=.8,label:`${m}/${$} held-out caps in P10\
\u2013P90${$===s?"":` \xB7 ${$}/${s} families`}${i?` \xB7 ${i} invalid`:""}`},{pass:g&&P.medianMultiplier!==null&&p.medianMultiplier!==null&&
P.medianMultiplier<p.medianMultiplier,label:`LOO ${multiplier(P.medianMultiplier)} vs ${multiplier(p.medianMultiplier)} flat${g?"":` \xB7 model\
 n=${P.n}/${s}, flat n=${p.n}/${s}`}`}]}function integrityStrip(e){return`<ul class="integrity">${e.map(({pass:t,label:a})=>`<li class="${t===
null?"check-unavailable":t?"check":"check-failed"}">${t===null?"":t?"\u2713 ":"\u2717 "}${escapeHtml(a)}</li>`).join("")}</ul>`}function multiplier(e){
return e===null?"\u2014":`\xD7${e.toFixed(2)}`}var brier=e=>e?.toFixed(4)??"\u2014",inputLabels=["+10% TVL","+10pp growth","+1 yr"],effectPercent=e=>formatPercent(
Number.isFinite(e)?e:null);function effectLine(e){return inputLabels.map((t,a)=>`${t} \u2192 ${effectPercent(e[a]??NaN)}`).join(" \xB7 ")}var actual=(e,t)=>t?
formatOdds(e/t):"\u2014",nominal=e=>`${e*100}%`;function rangeRows({middle:e,broad:t}){return[["P25\u2013P75",e],["P10\u2013P90",t]].map(([a,
{stated:s,covered:n,n:l}])=>[a,`${actual(n,l)} \xB7 ${n}/${l}`,nominal(s)])}function termCounts(e){return`${e.terms.length}/${e.steps[0]?.trials.
length??0}`}function kpiStrip(e,t,a,s,n,l,i){let{leaveOneFamilyOut:o,seededFiveFold:d,walkForward:c}=e.validation,r=m=>[o,d,c].map(k=>multiplier(
k[m].medianMultiplier)).join("/"),u=({stated:m,covered:k,n:$})=>`${actual(k,$)} / ${nominal(m)}`,f={FARM:0,THIN:0,SKIP:0};for(let{verdict:m}of n)
f[m]++;let v=m=>m.map(brier).join("/");return[["Nested value error",r("model"),`LOO/5-fold/WF \xB7 flat ${r("flatMultiple")}`],["Range hones\
ty",`${u(a.middle)} \xB7 ${u(a.broad)}`,"P25\u2013P75 \xB7 P10\u2013P90, actual/stated"],["Nested odds Brier \xB7 10-fold / WF",v(t.scores),
`vs ${v(t.baselines.baseRate)} base \xB7 ${v(t.baselines.pava)} clock`],["Inputs in implied value",["TVL","growth","age"].map((m,k)=>`${m} ${effectPercent(
s[k]?.[0]??NaN)}`).join(" \xB7 "),"per +10% TVL, +10pp 7-day growth, +1 yr since listing \xB7 board medians"],["Worth farming at $10K",Object.
values(f).join(" / "),"FARM / THIN / SKIP"],["Accounted",`${formatInteger(l)} protocols`,`${n.filter(({watchlist:m})=>m).length}/${i} watchl\
ist`]].map(([m,k,$])=>`<div><dt>${m}</dt><dd>${k}</dd><small>${$}</small></div>`).join("")}function methodFarmAssumptions(e,t,a){return{title:`\
Farm assumptions \xB7 ${e.asOf}`,rows:[["Hold","Until launch or one year, whichever comes first. Count whole review periods."],["Airdrop sha\
re of launch cap",a(e.airdropShareOfLaunchCap)],["Farmer haircut (retained)",a(e.farmerHaircut)],["Labor",`${t(e.hourlyRateUsd)}/h`],["Capit\
al APR",`${a(e.capitalApr.yieldBearing)} yield-bearing \xB7 ${a(e.capitalApr.nonYielding)} non-yielding`],["Verdict test deposits",e.depositsUsd.
map(t).join(" \xB7 ")],["Verdicts",`FARM > ${t(e.hourlyRateUsd)}/h \xB7 THIN if 0 &lt; net per hour \u2264 ${t(e.hourlyRateUsd)} \xB7 SKIP if n\
et \u2264 $0`]]}}function methodNotes(e,t,a,s,n){let l=methodFarmAssumptions(t,a,s),i=n("House watchlist rule",["TP","FP","FN"],[[e.truePositives,
e.falsePositives,e.falseNegatives].map(({length:d})=>String(d))],"DefiLlama marks extra matches with parentProtocol, absent from the snapsho\
t."),o=n(l.title,["Input","Default"],l.rows);return`<details class="panel"><summary>Watchlist and farm assumptions</summary>${i}${o}</detail\
s>`}function methodPanel(e,t,a,s){return`<section class="panel"><h2>${e}</h2>${table(t,a)}${s?`<p class="caption">${s}</p>`:""}</section>`}function termTrials(e,t,a){
let s=e==="Value"?["LOO log error","WF log error"]:["10-fold Brier","WF Brier"],n=t.steps.flatMap(({baseline:l,trials:i},o)=>[[String(o+1),"\
Current terms",...l.map(brier),"\u2014"],...i.map(({term:d,scores:c,kept:r})=>[String(o+1),d,...c.map(brier),r?"Kept":"Not kept"])]);return methodPanel(
`${e} selection trials (full data)`,["Step","Term",...s,"Decision"],n,a)}function methodView({model:e,odds:t,rangeHonesty:a,bootstrap:s,placebo:n,
effectSummary:l,boardSize:i},o){let{coefficients:{intercept:d,lnTvl:c,lnAge:r},validation:u,selection:f}=e,{baselines:v,scores:m}=t.validation,
k=["intercept","logit(S(a))",...t.terms],$=p=>p?.toFixed(6)??"\u2014",{valueErrors:h}=s,M=`${s.replicates} bootstrap refits.`,P=[["Launch va\
lue",t.terms.includes("lnTvl")&&"odds"],[e.momentum&&"Launch value",t.terms.includes("growth")&&"odds"],[r&&"Launch value","odds clock"]].map(
p=>p.filter(Boolean).join(" + ")||"\u2014");return`<div class="method compact">${['<div class="method-value">',methodPanel("Launch value mod\
el",["Term in ln V","Coefficient","Bootstrap SE"],[["Intercept",$(d),$(h.intercept)],[e.momentum?"ln(TVL\xB7(1+g\u2087))":"ln(TVL)",$(c),$(h.
lnTvl)],...e.fit.terms.includes("age")?[["ln(age)",$(r),$(h.lnAge)]]:[],...Object.entries(e.categoryEffects??{}).map(([p,g])=>[p,$(g),$(h[p])])],
`Huber ridge \xB7 \u03BB ${e.lambda} \xB7 ${e.n} traded families. ${M}`),methodPanel("Out-of-sample validation",["Scheme","Model","Flat","Ca\
tegory"],[["Leave one family out",u.leaveOneFamilyOut],["Seeded five-fold",u.seededFiveFold],["Walk-forward",u.walkForward]].map(([p,{model:g,
flatMultiple:b,categoryMultiple:_}])=>[p,...[g,b,_].map(({medianMultiplier:S,spearman:F})=>`${multiplier(S)} \xB7 ${F?.toFixed(3)??"\u2014"}`)]),
"Median error \xD7k and Spearman \u03C1 use current market caps as a proxy. Terms are selected inside each training set. Walk-forward uses dated fam\
ilies only. Comparables pass the census product and category rules."),termTrials("Value",f,`Fixed group penalty ${e.fit.categoryPenalty}. Bo\
th errors must improve.`),'</div><div class="method-odds">',methodPanel("Token-status model",["Term in logit F(a)","Coefficient","Bootstrap \
SE"],k.map((p,g)=>[p,$(t.coefficients[g]),$(t.standardErrors[g])]),`${t.n} eligible protocols \xB7 ${formatOdds(t.baseRate)} record a token.\
 L2 penalty ${t.penalty}. PAVA share S(a) is clamped to 0.01\u20130.99. P\u2081\u2082 = [F(a+365) \u2212 F(a)] / [1 \u2212 F(a)]. Flat years use tail hazard. Undated\
 age ${t.medianAgeDays}d. ${M}`),termTrials("Odds",t.validation.selection),'</div><div class="method-evidence">',methodPanel("How each input\
 moves the implied value",["Input","Median","P10\u2013P90","Through"],l.map(([p,g,b],_)=>[inputLabels[_]??"",effectPercent(p??NaN),`${effectPercent(
g??NaN)} to ${effectPercent(b??NaN)}`,P[_]??""]),`${i} rows, before dollar rounding. Growth is 7-day, clipped by the model. Listing age shif\
ts the clock forward. Missing growth starts at 0 and undated ages use the fitted medians.`),methodPanel("Held-out token status",["Model","10\
-fold Brier","Walk-forward Brier"],[["Base rate",v.baseRate],["Raw PAVA clock",v.pava],["Clock-only model (step 0)",v.clockOnly],["Nested mo\
del",m]].map(([p,g])=>[p,...g.map(brier)]),"Brier scores current token status. Terms are selected inside each training set. Walk-forward use\
s dated records only. P\u2081\u2082 assumes the cross-section behaves like a cohort."),methodPanel("Held-out range honesty",["Band","Actual",
"Stated"],rangeRows(a)),`<section class="panel"><h2>Growth placebo</h2><p class="caption">Fixed-term Brier ${n.real.map(brier).join(" / ")}.\
 ${n.asGoodOrBetter.map(p=>p===null?"\u2014":formatOdds(p)).join(" / ")} of ${n.shuffles} shuffles matched or beat it (10-fold / WF).</p></s\
ection>`,o?.(methodPanel)??"","</div>"].join("")}</div>`}function ageSparkline(e,t,a,s,n){let l=d=>((1-d)*40).toFixed(2),i=t/e*100,o=Array.from(
{length:33},(d,c)=>{let r=c/32*100;return`${r.toFixed(2)},${l(s(r/100*e))}`}).join(" ");return n(100,40,`<polyline points="${o}"></polyline>\
<circle cx="${i.toFixed(2)}" cy="${l(a)}" r="2" class="age-point"></circle>`)}var reasonLabels={"pre-token":"Meets the pre-token rule",watchlist:"\
House watchlist"},flagLabels={"growth-missing":"Missing TVL change. The model uses zero growth.","age-missing":"Missing listing date. The mo\
del uses median comparable age.","outside-comps-range":"TVL or age falls outside the comparable range."};function protocolFacts({protocol:e,
status:t,reason:a,boardReasons:s,flags:n},l,i,{escapeHtml:o,formatInteger:d,growthText:c,statusLabels:r}){return`<section class="panel"><h3>\
Protocol record</h3><dl class="facts">${[["TVL",i(e.tvl_usd)],["7d TVL change",c(e.change_7d)],["Listed",o(e.listed_at??"Unlisted")],[t==="t\
raded"||t==="token-unpriced"?"Days since listing":"Days listed",d(l)]].map(([u,f])=>`<div><dt>${u}</dt><dd>${f}</dd></div>`).join("")}</dl>
    <p><strong>${r[t]}</strong>${t==="pre-token"?"":` \xB7 ${o(a)}`}</p>
    <p class="muted">Included \xB7 ${s.map(u=>reasonLabels[u]).join(" \xB7 ")}</p>
    ${n.length?`<ul class="flags">${n.map(u=>`<li>${flagLabels[u]}</li>`).join("")}</ul>`:""}</section>`}function protocolClock(e,t,a,s,n,{formatInteger:l,
formatOdds:i,svg:o}){let d=Math.max(1,t,e);return`<section class="panel clock"><h3>12-month launch odds</h3>
    ${ageSparkline(d,t,a,n,o)}
    <p><strong>P\u2081\u2082 \xB7 ${i(a)}</strong></p>
    <p class="caption">Age marker \xB7 ${l(t)} days${s?" (population median)":""}</p>
  </section>`}function nearestComparables(e,t,a,{escapeHtml:s,table:n}){let l=e.map(i=>{let o=t.get(i);return[s(o?.representative.name??i),o?.
mcap_usd?a(o.mcap_usd):"\u2014"]});return`<section class="panel compact"><h3>Nearest comparables</h3>${n(["Twin","Family market cap"],l)}</s\
ection>`}var floatingField=/^(launch_p12|airdrop_yield_apr|launchProbability12|breakEvenDepositUsd|expectedValueUsd|costUsd|netUsd|netPerHourUsd)$/;
function matchesFields(e,t,a="",s=false){if(e===t)return true;if(typeof e=="number"&&typeof t=="number"&&(s||floatingField.test(a))){let n=Math.
abs(e-t);return Number.isFinite(n)&&n<=1e-9*Math.max(1,Math.abs(e),Math.abs(t))}return!e||!t||typeof e!="object"||typeof t!="object"||Array.
isArray(e)&&(!Array.isArray(t)||e.length!==t.length)?false:Object.entries(e).every(([n,l])=>matchesFields(l,t[n],n,s))}function boardInterval(e){
if(!e)return null;let{interval_p10_usd:t,interval_p90_usd:a}=e;return Number.isInteger(t)&&Number.isInteger(a)&&t>0&&t<=a?[t,a]:null}function boardMismatches(e,t,a){
let s=t.slice(e.length).map(n=>typeof n?.slug=="string"?n.slug:"(missing slug)");for(let[n,l]of e.entries()){let{rank:i,launch_value_usd:o,implied_value_usd:d,
plan:c,protocol:{slug:r}}=l,u=t[n],f=a?.(l)??l.farm_steps,{airdropYieldApr:v,...m}=l.economics,k={slug:r,rank:i,launch_value_usd:o,implied_value_usd:d,
airdrop_yield_apr:v,launch_p12:m.launchProbability12,plan_chain:c.chain,plan_one_time_cost_usd:c.oneTimeCostUsd,plan_recurring_cost_usd:c.recurringCostUsd,
plan_total_cost_usd:c.totalCostUsd,plan_total_minutes:c.totalMinutes,farm_economics:m,...f!==void 0&&{farm_steps:f}};(!boardInterval(u)||!matchesFields(
k,u))&&s.push(r)}return s}function prepareBoard({board:e,families:t,comparables:a},s,n,l,i,o){let d=new Map(s.flatMap(r=>r?[[r.slug,r]]:[])),
c=new Set(a.map(({familyKey:r})=>r));return{diagnostics:d,families:new Map(t.filter(({key:r})=>c.has(r)).map(r=>[r.representative.slug,r])),
protocols:new Map(e.map(r=>[r.protocol.slug,r])),mismatches:boardMismatches(e,s,o),rows:boardViewRows(e,d,i,n,l)}}function boardViewRows(e,t,a,s,n){
let l=new Set(s);return e.map(({protocol:i,rank:o,implied_value_usd:d,launch_value_usd:c,launchProbability12:r,plan:u,economics:f})=>{let{slug:v,
name:m,tvl_usd:k,change_7d:$,category:h,chains:M,listed_at:P}=i,p=a.get(v),g=f.deposits.find(({depositUsd:b})=>b===1e4);if(!g)throw new Error(
"Missing $10K farm economics.");return{slug:v,name:m,rank:o,category:h,chains:M,value:d,launchValue:c,odds:r,tvl:k,growth:$,interval:boardInterval(
t.get(v)),rankRange:p?[p.rank_p10,p.rank_p90]:null,age:P?n(P):null,cost:u.totalCostUsd,time:u.totalMinutes,verdict:g.verdict,netPerHour:g.netPerHourUsd,
watchlist:l.has(v)}})}var viewTools={escapeHtml,formatInteger,formatOdds,growthText,statusLabels,svg,table};function valueFormula(e,t){let{intercept:a,
lnTvl:s,lnAge:n}=e.coefficients,l=t?4:3,i=t?formatCompactUsd(t.protocol.tvl_usd):"TVL",o=t?Math.exp(t.features.growth).toFixed(3):"(1+g\u2087)",
d=t?`${Math.exp(t.features.lnAge).toFixed(0)} d`:"age",c=n?` ${signedTerm(n,l)} \xD7 ln(${d})`:"",r=e.categoryEffects?.[t?.features.category??
"other"]??0,u=e.categoryEffects?t?` ${signedTerm(r,l)}`:" + category effect":"";return`${a.toFixed(l)} ${signedTerm(s,l)} \xD7 ln(${i}${e.momentum?
` \xD7 ${o}`:""})${c}${u}`}function protocolView(e,{age:t,model:a,lnValue:s,back:n,usd:l,farm:i,diagnostics:o,families:d,maxOddsAge:c,effects:r}){
let{protocol:u,plan:f,oddsAge:v,oddsAt:m,launchProbability12:k}=e,{airdropYieldApr:$,breakEvenDepositUsd:h,deposits:M}=e.economics,P=l(e.implied_value_usd),
p=boardInterval(o)?.map(l).join("\u2013")??"\u2014",g=o?.influence,b=g&&d.get(g.slug)?.representative.name,_=g?.rank_delta===0?"No single co\
mparable moves this rank":g&&b?`Without ${escapeHtml(b)}, rank moves by ${Math.abs(g.rank_delta)}`:"",S=table(["Action","Est. fee","Min","Wh\
en"],f.steps.map(F=>[escapeHtml(F.action),l(F.costUsd),formatInteger(F.minutes),F.cadence]),{total:["Total",l(f.totalCostUsd),formatInteger(
f.totalMinutes),"\u2014"]});return`<a class="back" href="${escapeHtml(n)}">\u2190 Back to board</a>
    <header class="protocol-heading"><div><h2>${escapeHtml(u.name)}</h2>
    <div class="chips">${[u.category??"Unlisted category",...u.chains].map(F=>chip(F)).join("")}</div>
    </div>${chip(`Board rank ${e.rank}`,"badge")}</header>
    <div class="detail-grid">
      <div class="detail-facts">
        <section class="panel"><h3>Implied value</h3>
          <p class="figure">${P}</p>
          <p>P10\u2013P90 \xB7 ${p}</p>
          <p class="value-equation">ln V \u2248 ${valueFormula(a,e)} \u2248 ${s.toFixed(3)} \u2192 ${l(e.launch_value_usd)} \xD7 P\u2081\u2082(${v.
toFixed(0)} d) ${formatOdds(k)} \u2192 ${P}</p>
          ${r?`<p class="caption">${effectLine(r)}</p>`:""}
          ${_?`<p class="caption">${_}</p>`:""}
        </section>
        ${protocolFacts(e,t,l,viewTools)}
        ${protocolClock(c,v,k,t===null,m,viewTools)}
      </div><div class="detail-facts">
        <section class="panel farm"><h3>Farm plan</h3>
          <p class="plan-meta"><strong>${escapeHtml(f.chain??"Chain unlisted")}</strong> \xB7 ${l(f.depositUsd)} plan \xB7 ${f.holdWeeks.toFixed(
1)} weeks expected</p>
          ${table(["Deposit","Expected drop","Net","Net per hour","Verdict"],M.map(({depositUsd:F,expectedValueUsd:N,netUsd:x,netPerHourUsd:O,
verdict:B})=>[l(F),l(N),l(x),l(O),B]),{className:"deposit-grid"})}
          <p class="caption">${l(i.hourlyRateUsd)}/h for labor \xB7 ${i.farmerHaircut*100}% farmer haircut</p>
          <p>Expected airdrop yield ${($*100).toFixed(2)}% APR \xB7 Capital cost ${(f.capitalApr*100).toFixed(2)}% APR</p>
          <p>Break-even deposit \xB7 ${h==="never"?"never":l(h)}</p>
          <p class="caption">${escapeHtml(f.steps.at(-1)?.exitCondition??"")}</p>
          ${S}
          <p class="caption">Fees and minutes per occurrence. Claim gas weighted by launch odds in totals. Assumptions ${f.assumptionsAsOf}${f.
flags.length?" \xB7 fallback fees":""}.</p>
        </section>
        ${nearestComparables(o?.twins??[],d,l,viewTools)}
      </div>
    </div>`}var{isCensusSortKey,isSortKey,parseRoute}=window.Radar?.support??{};function scatterCoverage(e,t){let a={missLow:0,covered:0,missHigh:0},
s=new Set,n=[];for(let l of e){if(!l)continue;let{slug:i,actual:o,predicted:d,p10:c,p90:r}=l,u=t.get(i)?.mcap_usd??0;c===null||r===null||![c,
r,o,d].every(Number.isFinite)||c>r||s.has(i)||Math.abs(o-Math.log(u))>1e-9||(s.add(i),n.push(l),a[o<c?"missLow":o>r?"missHigh":"covered"]++)}
return{valid:n,counts:a,invalidPoints:e.length-n.length}}var{boot}=window.Radar?.support??{};function mountBoard(e,t,a,s,{formatUsd:n,compareText:l,
boardControls:i,view:o,boardHash:d,farmAssumptions:c}){e.innerHTML=a+element("#board-filters").innerHTML+boardTable();let r=o&&i?.(e,o,t),u=element(
"#results",e),f=element("tbody",e),v=Math.log1p(Math.max(1,...t.flatMap(({value:h,interval:M})=>[h,M?.[1]??0]))),m=element('[name="deposit"]',
e);m.innerHTML=c.depositsUsd.map(h=>`<option value="${h}"${h===1e4?" selected":""}>$${h/1e3}K</option>`).join("");let k=["csv","json"].map(h=>({
format:h,link:element(`[download="radar.${h}"]`,e)})),$=h=>{r?.(h);let M=Number(m.value)||1e4,P=t.map(g=>{let b=s.get(g.slug)?.economics.deposits.
find(({depositUsd:_})=>_===M);return b?{...g,verdict:b.verdict,netPerHour:b.netPerHourUsd}:g}),p=selectRows(P,h,l);u.textContent=`${formatInteger(
p.length)} of ${formatInteger(t.length)} protocols`,f.innerHTML=boardRows(p,d?.(h)??"#/",v,n);for(let{format:g,link:b}of k)b.href=`data:text\
/${g};charset=utf-8,${encodeURIComponent(serializeBoard(p,g,M))}`};return h=>{m.onchange=()=>$(h),$(h)}}function validSeed(e){return typeof e==
"number"&&e>>>0===e}function replayCheck(e,t,a){let s=a.find(([n])=>!n);return{pass:!s,label:`${e} ${s?.[1]??`\xB7 ${t} refits match`}`}}function start(e,t,a,s,n){
let{buildRadar:l,daysBetween:i,farmAssumptions:o,formatUsd:d}=s;s.view={...viewTools,element};let{meta:c}=a,r=l(t,a.model.fit,a.odds.terms,c),
{model:u,odds:f,houseRule:v,census:m}=r,k=new Map(r.board.map(({protocol:y})=>[y.slug,s.impliedValueEffects(y,t.as_of,u,f)])),$=s.summarizeEffects(
k),{board:{rows:h}}=a,{families:M,diagnostics:P,protocols:p,mismatches:g,rows:b}=prepareBoard(r,h,t.watchlist,y=>i(y,t.as_of),new Map,s.boardFarmSteps);
element("#snapshot-date").textContent=`Snapshot \xB7 ${t.as_of}`,element("#formula").textContent=`ln V = ${valueFormula(u)}`;let _=element("\
#checks");_.innerHTML=integrityStrip(["Board and validation","Term selection","Bootstrap","Placebo"].map(y=>({pass:null,label:`${y} pending`})));
let S="<h2>Checking model evidence\u2026</h2>",F,N,x;function O(){try{let y=parseRoute(location.hash),C=y.page==="protocol"?`p/${y.slug}`:y.
page,H=x&&x!==C;if(x=C,H&&(F=void 0,N=void 0),y.page==="board")F??=mountBoard(e,b,censusSummary(m,p),p,s),F(y.state);else if(y.page==="plan")
N??=s.mountPlanner?.(e,r.board,c,s),N?N(location.hash):e.innerHTML=element("#plan-unavailable").innerHTML;else if(y.page==="census")e.innerHTML=
censusView(m,y.state,d,s.compareText,p);else if(y.page==="method")e.innerHTML=S;else{let L=s.boardHash?.(y.state)??"#/",T=y.page==="protocol"?
p.get(y.slug):void 0,j=T?.protocol.listed_at;e.innerHTML=T?protocolView(T,{age:j?i(j,t.as_of):null,model:u,lnValue:s.logValue(T.features,u),
back:L,usd:d,farm:o,diagnostics:P.get(T.protocol.slug),families:M,maxOddsAge:f.maxAgeDays,effects:k.get(T.protocol.slug)}):`<h2>Page unavail\
able</h2><a href="${escapeHtml(L)}">Back to board</a>`}H&&(window.scrollTo(0,0),e.focus({preventScroll:true})),e.dataset.ready=""}catch{x="e\
rror",n()}}function B(){let y=a.bootstrap?.seeds,C=Array.isArray(y)&&y.length===2&&validSeed(y[0])&&validSeed(y[1])?y:void 0,H=validSeed(a.placebo?.
seed)?a.placebo.seed:void 0,{bootstrap:L,placebo:T}=s.reproduceDiagnostics(r,a.model.fit.terms,t.as_of,C,H);for(let w of b){let E=L.ranks.get(
w.slug);E&&(w.rankRange=[E.rank_p10,E.rank_p90])}let j=scatterCoverage(a.looScatter??[],M),A=s.reproduceSelection(r),U=s.rangeHonesty(j.valid),
I=s.scoreValueEvidence(r.comparables,a.model.evidence),W=s.scoreOddsEvidence(r.population,a.odds.validation.evidence),D={n:0,medianMultiplier:null,
spearman:null},z={model:D,flatMultiple:D,categoryMultiple:D},V=[null,null],K={...a.model,...u,fit:{terms:a.model.fit.terms,lambda:u.lambda,categoryPenalty:s.
VALUE_CATEGORY_PENALTY},selection:A.value,validation:I??{leaveOneFamilyOut:z,seededFiveFold:z,walkForward:z}},q={...a.odds,...f,penalty:s.LOGISTIC_PENALTY,
baseRate:s.baseRate(r.population),standardErrors:L.oddsErrors,validation:{evidence:a.odds.validation.evidence,selection:A.odds,...W??{scores:V,
baselines:{baseRate:V,pava:V,clockOnly:V}}}},R=integrityChecks(g,h,t.watchlist,{fitted:u.n,houseRule:v,intervalCounts:j.counts,invalidPoints:j.
invalidPoints,coverageUnavailable:a.looScatter===null&&u.n<s.MIN_BAND_FAMILIES,loo:K.validation.leaveOneFamilyOut});s.boardFarmSteps||R.push(
{pass:null,label:"Step text comparison unavailable"});let G=matchesFields(A.value,a.model.selection,"",true)&&matchesFields(A.value.terms,a.
model.fit.terms)&&matchesFields(A.odds,a.odds.validation.selection,"",true)&&matchesFields(A.odds.terms,a.odds.terms);R.push({pass:G,label:`\
Term selection ${G?"reproduced":"differs"} \xB7 ${termCounts(A.value)} \xB7 ${termCounts(A.odds)}`}),matchesFields(U,a.rangeHonesty)||R.push(
{pass:false,label:"Held-out coverage totals differ from published data"});let Y=r.board.every(({protocol:w})=>matchesFields(s.coefficientEffects(
w,t.as_of,u,f),k.get(w.slug),"",true)),J=L.ranks.size===h.length&&h.every(w=>{let E=w&&L.ranks.get(w.slug);return!!E&&matchesFields(E,w)});R.
push({pass:matchesFields(m,a.census),label:"Census = recompute"},{pass:Y&&matchesFields($.map(([w])=>w),a.effectMedians,"",true),label:"Inpu\
t effects = reference"},{pass:I!==null&&W!==null&&matchesFields(I,a.model.validation,"",true)&&matchesFields(W,a.odds.validation,"",true),label:"\
Validation = fold predictions"},replayCheck("Bootstrap",L.replicates,[[C!==void 0,"seeds invalid"],[matchesFields(s.BOOTSTRAP_SEEDS,C),"seed\
s differ"],[L.replicates===a.bootstrap?.replicates,"refit count differs"],[matchesFields(L.valueErrors,a.bootstrap?.valueErrors,"",true),"va\
lue SEs differ"],[matchesFields(L.oddsErrors,a.odds.standardErrors,"",true),"odds SEs differ"],[J,"rank bands differ"]]),replayCheck("Placeb\
o",T.shuffles,[[H!==void 0,"seed invalid"],[H===s.PLACEBO_SEED,"seed differs"],[T.shuffles===a.placebo?.shuffles,"shuffle count differs"],[matchesFields(
T.real,a.placebo?.real,"",true),"observed scores differ"],[matchesFields(T.asGoodOrBetter,a.placebo?.asGoodOrBetter,"",true),"shuffle result\
s differ"]])),element("#kpis").innerHTML=kpiStrip(K,q.validation,U,$,b,m.length,new Set(t.watchlist).size),_.innerHTML=integrityStrip(R),S=methodView(
{model:K,odds:q,rangeHonesty:U,bootstrap:L,placebo:T,effectSummary:$,boardSize:b.length},w=>methodNotes(v,o,d,formatOdds,w)),(x==="board"||x===
"method")&&O(),e.dataset.evidenceReady=""}O(),window.addEventListener("hashchange",O),s.bindControls?.(e,O,{isCensusSortKey,isSortKey,parseRoute}),
requestAnimationFrame(()=>requestAnimationFrame(()=>{try{B()}catch{_.innerHTML=integrityStrip([{pass:false,label:"Evidence checks could not \
finish"}])}}))}boot?.(start);
})();
