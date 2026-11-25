(() => {
var verdictOrder={SKIP:0,THIN:1,FARM:2};function compareRows(a,b,sort,direction,compareText){if(sort==="name")return direction*
compareText(a.name.toLowerCase(),b.name.toLowerCase());if(sort==="verdict")return direction*(verdictOrder[a.verdict]-verdictOrder[b.
verdict]);let first=a[sort],second=b[sort];return first===null||second===null?+(first===null)-+(second===null):direction*
(Number(first)-Number(second))}function selectRows(rows,state,compareText){let{sort,dir,cat,chain,wl}=state,query=state.
q.trim().toLowerCase(),direction=dir==="asc"?1:-1;return rows.filter(row=>(!cat||row.category===cat)&&(!chain||row.chains.
includes(chain))&&(!wl||row.watchlist)&&(!query||row.name.toLowerCase().includes(query))).sort((a,b)=>compareRows(a,b,sort,
direction,compareText)||compareText(a.slug,b.slug))}function serializeBoard(rows,format,depositUsd){let exported=rows.map(row=>({...row,depositUsd}));if(format==="json")return JSON.
stringify(exported);let quote=value=>{let text=Array.isArray(value)?JSON.stringify(value):String(value??"");return`"${(typeof value==
"string"&&/^[=+@-]/.test(text.trimStart())?`'${text}`:text).replaceAll('"','""')}"`};return[Object.keys(exported[0]??{}),
...exported.map(row=>Object.values(row))].map(cells=>cells.map(quote).join(",")).join(`\r
`)}function formatInteger(value){return value===null?"—":value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",")}function formatCompactUsd(value){
let scale=Math.min(4,Math.floor(Math.log10(value)/3));return scale<1?`$${value}`:`$${(value/1e3**scale).toFixed(2)}${" K\
MBT"[scale]}`}function signedTerm(value,decimals=3){return`${value<0?"−":"+"} ${Math.abs(value).toFixed(decimals)}`}function formatOdds(value){
return`${(value*100).toFixed(value<.05?2:1)}%`}function formatPercent(value){if(value===null)return"—";let magnitude=Math.
abs(value).toFixed(1);return`${magnitude==="0.0"?"":value<0?"−":"+"}${magnitude}%`}function escapeHtml(value){return value.
replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}function tableBody(rows,columns2,options={}){return!rows.length&&options.empty?`<tr><td colspan="${columns2}" class="emp\
ty">${escapeHtml(options.empty)}</td></tr>`:rows.map(row=>`<tr${options.linked?" data-protocol":""}><td>${row.join("</td\
><td>")}</td></tr>`).join("")}function table(headers,rows,options={}){let head=headers.map(header=>{if(typeof header=="s\
tring")return`<th scope="col">${escapeHtml(header)}</th>`;let[key,label2]=header,direction=options.dir==="desc"?"descend\
ing":"ascending";return`<th scope="col"${options.sort===key?` aria-sort="${direction}"`:""}><button type="button" data-s\
ort="${escapeHtml(key)}">${escapeHtml(label2)}</button></th>`}),[label,...totals]=options.total??[],foot=label===void 0?
"":`<tfoot><tr><th scope="row">${label}</th><td>${totals.join("</td><td>")}</td></tr></tfoot>`;return`<table${options.className?
` class="${options.className}"`:""}><thead><tr>${head.join("")}</tr></thead><tbody>${tableBody(rows,headers.length,options)}\
</tbody>${foot}</table>`}function svg(width,height,content){return`<svg viewBox="0 0 ${width} ${height}" preserveAspectR\
atio="none" aria-hidden="true">${content}</svg>`}var columns={rank:"Rank",name:"Protocol",value:"Implied value",launchValue:"Launch value",odds:"Odds 12m",tvl:"TVL",growth:"\
7d %",age:"Days listed",cost:"Plan",verdict:"Verdict",netPerHour:"Net/h",watchlist:"Watchlist"},statusLabels={traded:"To\
ken trades","token-unpriced":"Records an unpriced token","pre-token":"Records no token",excluded:"Excluded by the house \
rule"};function protocolHref(slug,back){return`#/p/${encodeURIComponent(slug)}${back.slice(2)}`}function boardTable(){return`<section class="table-window" aria-label="Protocol rankings" tabindex="0">${table(Object.entries(
columns),[],{className:"ranking",sort:"rank",dir:"asc"})}</section>`}function chip(label,className="chip"){return`<span \
class="${className}">${escapeHtml(label)}</span>`}function growthText(growth){let text=formatPercent(growth);return`<spa\
n class="${text.startsWith("+")?"gain":text.startsWith("−")?"loss":""}">${text}</span>`}function boardRows(rows,back,maxLogValue,usd){
let scale=value=>Math.log1p(value)/maxLogValue*100;return tableBody(rows.map(row=>{let{slug,chains}=row,href=escapeHtml(
protocolHref(slug,back)),labels=[row.category??"Unlisted category",...chains.slice(0,2)];chains.length>2&&labels.push(`+${chains.
length-2}`);let[low,high]=row.interval??[0,0],band=row.interval?`<rect class="band" x="${scale(low).toFixed(2)}" y="5" w\
idth="${(scale(high)-scale(low)).toFixed(2)}" height="3"></rect>`:"";return[`${row.rank}<small class="rank-range" title=\
"Bootstrap P10–P90 rank">${row.rankRange?.join("–")??"—"}</small>`,`<a class="protocol-name" href="${href}">${escapeHtml(
row.name)}</a>
       <div class="chips" title="${escapeHtml(chains.join(", "))}">${labels.map(label=>chip(label)).join("")}</div>`,`<d\
iv class="value" ${row.interval?`title="P10–P90: ${usd(low)}–${usd(high)}"`:""}><strong>${usd(row.value)}</strong>
        ${svg(100,8,`<rect width="${scale(row.value).toFixed(2)}" height="3"></rect>${band}`)}</div>`,usd(row.launchValue),
formatOdds(row.odds),usd(row.tvl),growthText(row.growth),formatInteger(row.age),`${usd(row.cost)} · ${row.time} min`,row.
verdict,usd(row.netPerHour),row.watchlist?chip("Watchlist","badge"):"—"]}),Object.keys(columns).length,{linked:!0,empty:"\
No protocols match these filters."})}function censusSummary(rows,ranked){let counts={"pre-token":0,traded:0,"token-unpriced":0,excluded:0},included=0;for(let{
slug,status}of rows){if(!Object.hasOwn(counts,status))throw new Error("Census counts do not add up");ranked?.has(slug)?included++:
counts[status]++}let link=(status,label=status)=>`<a href="#/census?status=${status}${ranked?"&amp;unranked=1":""}">${formatInteger(
counts[status])} ${label}</a>`,parts=[link("traded"),link("token-unpriced","token, unpriced"),link("excluded")],total=formatInteger(
rows.length);return`<p class="census-summary">${ranked?`All ${total} protocols accounted for: ${formatInteger(included)}\
 ranked · ${parts.join(" · ")}`:`${total} protocols = ${link("pre-token","pre-token (ranked)")} + ${parts.join(" + ")}`}\
</p>`}function selectCensus(rows,{status,sort,dir,unranked},compareText,ranked){let direction=dir==="asc"?1:-1,label=(row,key)=>key===
"status"?statusLabels[row.status]:row[key].toLowerCase();return rows.filter(row=>(!status||row.status===status)&&(!unranked||
!ranked?.has(row.slug))).sort((a,b)=>{let order=sort==="tvl"?a.tvl_usd-b.tvl_usd:compareText(label(a,sort),label(b,sort));
return direction*order||compareText(a.slug,b.slug)})}function censusView(rows,state,usd,compareText,ranked){let selected=selectCensus(
rows,state,compareText,ranked);return`<h2>Protocol census</h2>${censusSummary(rows)}
    <div class="filters">
      <label class="field">Status <select name="status"><option value="">All statuses</option>${Object.entries(statusLabels).
map(([key,label])=>`<option value="${key}"${state.status===key?" selected":""}>${label}</option>`).join("")}</select></l\
abel>
      <output id="results">${formatInteger(selected.length)} of ${formatInteger(rows.length)} protocols</output>
    </div>
    ${table([["name","Protocol"],["status","Status"],["reason","Reason"],["tvl","TVL"]],selected.map(({name,status,reason,
tvl_usd})=>[escapeHtml(name),statusLabels[status],escapeHtml(reason),usd(tvl_usd)]),{...state,className:"ranking census",
empty:"No matching protocols."})}`}function element(selector,root=document){let found=root.querySelector(selector);if(!found)throw new Error(`Missing dashb\
oard element ${selector}`);return found}function integrityChecks(mismatches,published,watchlist,{fitted,houseRule,intervalCounts,invalidPoints,coverageUnavailable,
loo}){let count=mismatches.length,slugs=new Set(published.map(row=>row?.slug)),unique=new Set(watchlist),covered=[...unique].
filter(slug=>slugs.has(slug)).length,{missLow,covered:inside,missHigh}=intervalCounts,samples=missLow+inside+missHigh,matches=houseRule.
truePositives.length,extra=houseRule.falsePositives.length,{model,flatMultiple:flat}=loo,samePopulation=model.n===fitted&&
flat.n===fitted;return[{pass:count===0,label:count?`Recompute ≠ published board · launch values, odds, implied values, r\
anks, plans, economics (${count} mismatched · ${mismatches[0]})`:`Recompute = published board · ${published.length} ${published.
length===1?"row":"rows"}`},{pass:covered===unique.size,label:`Watchlist ${covered}/${unique.size}`},{pass:matches===unique.
size&&unique.size>0,label:`House rule ${matches}/${unique.size}${extra?` · +${extra} via parentProtocol`:""}`},coverageUnavailable?
{pass:null,label:"Coverage unavailable · too few traded families"}:{pass:invalidPoints===0&&Object.values(intervalCounts).
every(n=>Number.isInteger(n)&&n>=0)&&samples===fitted&&inside/samples>=.8,label:`${inside}/${samples} held-out caps in P\
10–P90${samples===fitted?"":` · ${samples}/${fitted} families`}${invalidPoints?` · ${invalidPoints} invalid`:""}`},{
pass:samePopulation&&model.medianMultiplier!==null&&flat.medianMultiplier!==null&&model.medianMultiplier<flat.medianMultiplier,
label:`LOO ${multiplier(model.medianMultiplier)} vs ${multiplier(flat.medianMultiplier)} flat${samePopulation?"":` · mod\
el n=${model.n}/${fitted}, flat n=${flat.n}/${fitted}`}`}]}function integrityStrip(checks){return`<ul class="integrity">${checks.
map(({pass,label})=>`<li class="${pass===null?"check-unavailable":pass?"check":"check-failed"}">${pass===null?"":pass?"✓\
 ":"✗ "}${escapeHtml(label)}</li>`).join("")}</ul>`}function multiplier(value){return value===null?"—":`×${value.toFixed(
2)}`}var brier=value=>value?.toFixed(4)??"—",inputLabels=["+10% TVL","+10pp growth","+1 yr"],effectPercent=value=>formatPercent(
Number.isFinite(value)?value:null);function effectLine(values){return inputLabels.map((label,index)=>`${label} → ${effectPercent(
values[index]??NaN)}`).join(" · ")}var actual=(covered,n)=>n?formatOdds(covered/n):"—",nominal=stated=>`${stated*100}\
%`;function rangeRows({middle,broad}){return[["P25–P75",middle],["P10–P90",broad]].map(([band,{stated,covered,n}])=>[
band,`${actual(covered,n)} · ${covered}/${n}`,nominal(stated)])}function termCounts(selection){return`${selection.terms.
length}/${selection.steps[0]?.trials.length??0}`}function kpiStrip(model,odds,ranges,effects,rows,protocols,watchlist){let{
leaveOneFamilyOut:loo,seededFiveFold:five,walkForward:wf}=model.validation,miss=key=>[loo,five,wf].map(scheme=>multiplier(
scheme[key].medianMultiplier)).join("/"),range=({stated,covered,n})=>`${actual(covered,n)} / ${nominal(stated)}`,counts={
FARM:0,THIN:0,SKIP:0};for(let{verdict}of rows)counts[verdict]++;let pair=scores=>scores.map(brier).join("/");return[["Ne\
sted value error",miss("model"),`LOO/5-fold/WF · flat ${miss("flatMultiple")}`],["Range honesty",`${range(ranges.middle)}\
 · ${range(ranges.broad)}`,"P25–P75 · P10–P90, actual/stated"],["Nested odds Brier · 10-fold / WF",pair(odds.scores),
`vs ${pair(odds.baselines.baseRate)} base · ${pair(odds.baselines.pava)} clock`],["Inputs in implied value",["TVL","gro\
wth","age"].map((label,index)=>`${label} ${effectPercent(effects[index]?.[0]??NaN)}`).join(" · "),"per +10% TVL, +10pp \
7-day growth, +1 yr since listing · board medians"],["Worth farming at $10K",Object.values(counts).join(" / "),"FARM / \
THIN / SKIP"],["Accounted",`${formatInteger(protocols)} protocols`,`${rows.filter(({watchlist:watchlist2})=>watchlist2).
length}/${watchlist} watchlist`]].map(([label,value,context])=>`<div><dt>${label}</dt><dd>${value}</dd><small>${context}\
</small></div>`).join("")}function methodFarmAssumptions(farm,usd,pct){return{title:`Farm assumptions · ${farm.asOf}`,rows:[["Hold","Until launch\
 or one year, whichever comes first. Count whole review periods."],["Airdrop share of launch cap",pct(farm.airdropShareOfLaunchCap)],
["Farmer haircut (retained)",pct(farm.farmerHaircut)],["Labor",`${usd(farm.hourlyRateUsd)}/h`],["Capital APR",`${pct(farm.
capitalApr.yieldBearing)} yield-bearing · ${pct(farm.capitalApr.nonYielding)} non-yielding`],["Verdict test deposits",farm.
depositsUsd.map(usd).join(" · ")],["Verdicts",`FARM > ${usd(farm.hourlyRateUsd)}/h · THIN if net > $0 · SKIP if net ≤ $\
0`]]}}function methodNotes(houseRule,farm,usd,pct,panel){let assumptions=methodFarmAssumptions(farm,usd,pct),rule=panel(
"House watchlist rule",["TP","FP","FN"],[[houseRule.truePositives,houseRule.falsePositives,houseRule.falseNegatives].map(
({length})=>String(length))],"DefiLlama marks extra matches with parentProtocol, absent from the snapshot."),farmPanel=panel(
assumptions.title,["Input","Default"],assumptions.rows);return`<details class="panel"><summary>Watchlist and farm assump\
tions</summary>${rule}${farmPanel}</details>`}function methodPanel(title,headers,rows,note){return`<section class="panel"><h2>${title}</h2>${table(headers,rows)}${note?
`<p class="caption">${note}</p>`:""}</section>`}function termTrials(kind,selection,note){let errors=kind==="Value"?["LOO\
 log error","WF log error"]:["10-fold Brier","WF Brier"],rows=selection.steps.flatMap(({baseline,trials},i)=>[[String(i+
1),"Current terms",...baseline.map(brier),"—"],...trials.map(({term,scores,kept})=>[String(i+1),term,...scores.map(brier),
kept?"Kept":"Not kept"])]);return methodPanel(`${kind} selection trials (full data)`,["Step","Term",...errors,"Decision"],
rows,note)}function methodView({model,odds,rangeHonesty,bootstrap,placebo,effectSummary,boardSize},notes){let{coefficients:{
intercept,lnTvl,lnAge},validation,selection}=model,{baselines,scores}=odds.validation,coef=value=>value?.toFixed(6)??"—",
{valueErrors}=bootstrap,errorNote=`${bootstrap.replicates} bootstrap refits.`,paths=[["Launch value",odds.terms.includes(
"lnTvl")&&"odds"],[model.momentum&&"Launch value",odds.terms.includes("growth")&&"odds"],[lnAge&&"Launch value","odds cl\
ock"]].map(terms=>terms.filter(Boolean).join(" + ")||"—");return`<div class="method compact">${['<div class="method-va\
lue">',methodPanel("Launch value model",["Term in ln V","Coefficient","Bootstrap SE"],[["Intercept",coef(intercept),coef(
valueErrors.intercept)],[model.momentum?"ln(TVL·(1+g₇))":"ln(TVL)",coef(lnTvl),coef(valueErrors.lnTvl)],...selection.
terms.includes("age")?[["ln(age)",coef(lnAge),coef(valueErrors.lnAge)]]:[],...Object.entries(model.categoryEffects??{}).
map(([group,effect])=>[group,coef(effect),coef(valueErrors[group])])],`Huber ridge · λ ${model.lambda} · ${model.n} t\
raded families. ${errorNote}`),methodPanel("Out-of-sample validation",["Scheme","Model","Flat","Category"],[["Leave one \
family out",validation.leaveOneFamilyOut],["Seeded five-fold",validation.seededFiveFold],["Walk-forward",validation.walkForward]].
map(([label,{model:fitted,flatMultiple,categoryMultiple}])=>[label,...[fitted,flatMultiple,categoryMultiple].map(({medianMultiplier,
spearman})=>`${multiplier(medianMultiplier)} · ${spearman?.toFixed(3)??"—"}`)]),"Median error ×k and Spearman ρ use c\
urrent market caps as a proxy. Terms are selected inside each training set. Walk-forward uses dated families only. Compa\
rables pass the census product and category rules."),termTrials("Value",selection,`Fixed group penalty ${model.fit.categoryPenalty}\
. Both errors must improve.`),'</div><div class="method-odds">',methodPanel("Token-status model",["Term in logit F(a)","\
Coefficient","Bootstrap SE"],odds.names.map((name,i)=>[name,coef(odds.coefficients[i]),coef(odds.standardErrors[i])]),`${odds.
n} eligible protocols · ${formatOdds(odds.baseRate)} record a token. L2 penalty ${odds.penalty}. PAVA share S(a) is cla\
mped to 0.01–0.99. P₁₂ = [F(a+365) − F(a)] / [1 − F(a)]. Flat years use tail hazard. Undated age ${odds.medianAgeDays}\
d. ${errorNote}`),termTrials("Odds",odds.validation.selection),'</div><div class="method-evidence">',methodPanel("How ea\
ch input moves the implied value",["Input","Median","P10–P90","Through"],effectSummary.map(([median,low,high],i)=>[inputLabels[i]??
"",effectPercent(median??NaN),`${effectPercent(low??NaN)} to ${effectPercent(high??NaN)}`,paths[i]??""]),`${boardSize} r\
ows, before dollar rounding. Growth is 7-day, clipped by the model. Listing age shifts the clock forward. Missing growth\
 starts at 0 and undated ages use the fitted medians.`),methodPanel("Held-out token status",["Model","10-fold Brier","Wa\
lk-forward Brier"],[["Base rate",baselines.baseRate],["Raw PAVA clock",baselines.pava],["Clock-only model (step 0)",baselines.
clockOnly],["Nested model",scores]].map(([label,pair])=>[label,...pair.map(brier)]),"Brier scores current token status. \
Terms are selected inside each training set. Walk-forward uses dated records only. P₁₂ assumes the cross-section behaves\
 like a cohort."),methodPanel("Held-out range honesty",["Band","Actual","Stated"],rangeRows(rangeHonesty)),`<section cla\
ss="panel"><h2>Growth placebo</h2><p class="caption">Fixed-term Brier ${placebo.real.map(brier).join(" / ")}. ${placebo.
asGoodOrBetter.map(rate=>rate===null?"—":formatOdds(rate)).join(" / ")} of ${placebo.shuffles} shuffles matched or bea\
t it (10-fold / WF).</p></section>`,notes?.(methodPanel)??"","</div>"].join("")}</div>`}function ageSparkline(maxAge,age,odds,oddsAt,svgView){let y=fraction=>((1-fraction)*40).toFixed(2),marker=age/maxAge*100,
line=Array.from({length:33},(_,index)=>{let x=index/32*100;return`${x.toFixed(2)},${y(oddsAt(x/100*maxAge))}`}).join(" ");
return svgView(100,40,`<polyline points="${line}"></polyline><circle cx="${marker.toFixed(2)}" cy="${y(odds)}" r="2" cla\
ss="age-point"></circle>`)}var reasonLabels={"pre-token":"Meets the pre-token rule",watchlist:"House watchlist"},flagLabels={"growth-missing":"Miss\
ing TVL change. The model uses zero growth.","age-missing":"Missing listing date. The model uses median comparable age.",
"outside-comps-range":"TVL or age falls outside the comparable range."};function protocolFacts({protocol,status,reason,boardReasons,
flags},age,usd,{escapeHtml:esc,formatInteger:formatInteger2,growthText:growthText2,statusLabels:statusLabels2}){return`<\
section class="panel"><h3>Protocol record</h3><dl class="facts">${[["TVL",usd(protocol.tvl_usd)],["7d TVL change",growthText2(
protocol.change_7d)],["Listed",esc(protocol.listed_at??"Unlisted")],[status==="traded"||status==="token-unpriced"?"Days \
since listing":"Days listed",formatInteger2(age)]].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).
join("")}</dl>
    <p><strong>${statusLabels2[status]}</strong>${status==="pre-token"?"":` · ${esc(reason)}`}</p>
    <p class="muted">Included · ${boardReasons.map(key=>reasonLabels[key]).join(" · ")}</p>
    ${flags.length?`<ul class="flags">${flags.map(flag=>`<li>${flagLabels[flag]}</li>`).join("")}</ul>`:""}</section>`}function protocolClock(populationMaxAge,clockAge,odds,usesMedianAge,oddsAt,{
formatInteger:formatInteger2,formatOdds:formatOdds2,svg:svg2}){let maxAge=Math.max(1,clockAge,populationMaxAge);return`<\
section class="panel clock"><h3>12-month launch odds</h3>
    ${ageSparkline(maxAge,clockAge,odds,oddsAt,svg2)}
    <p><strong>P₁₂ · ${formatOdds2(odds)}</strong></p>
    <p class="caption">Age marker · ${formatInteger2(clockAge)} days${usesMedianAge?" (population median)":""}</p>
  </section>`}function nearestComparables(slugs,families,usd,{escapeHtml:esc,table:table2}){let rows=slugs.map(slug=>{let family=families.
get(slug);return[esc(family?.representative.name??slug),family?.mcap_usd?usd(family.mcap_usd):"—"]});return`<section c\
lass="panel compact"><h3>Nearest comparables</h3>${table2(["Twin","Family market cap"],rows)}</section>`}var floatingField=/^(launch_p12|airdrop_yield_apr|launchProbability12|breakEvenDepositUsd|expectedValueUsd|costUsd|netUsd|netPerHourUsd)$/;
function matchesFields(a,b,field="",scores=!1){if(a===b)return!0;if(typeof a=="number"&&typeof b=="number"&&(scores||floatingField.
test(field))){let delta=Math.abs(a-b);return Number.isFinite(delta)&&delta<=1e-9*Math.max(1,Math.abs(a),Math.abs(b))}return!a||
!b||typeof a!="object"||typeof b!="object"||Array.isArray(a)&&(!Array.isArray(b)||a.length!==b.length)?!1:Object.entries(
a).every(([key,value])=>matchesFields(value,b[key],key,scores))}function boardInterval(row){if(!row)return null;let{interval_p10_usd:low,
interval_p90_usd:high}=row;return Number.isInteger(low)&&Number.isInteger(high)&&low>0&&low<=high?[low,high]:null}function boardMismatches(computed,published,steps){
let slugs=published.slice(computed.length).map(row=>typeof row?.slug=="string"?row.slug:"(missing slug)");for(let[index,
row]of computed.entries()){let{rank,launch_value_usd,implied_value_usd,plan,protocol:{slug}}=row,saved=published[index],
farm_steps=steps?.(row)??row.farm_steps,{airdropYieldApr:airdrop_yield_apr,...farm_economics}=row.economics,expected={slug,
rank,launch_value_usd,implied_value_usd,airdrop_yield_apr,launch_p12:farm_economics.launchProbability12,plan_chain:plan.
chain,plan_one_time_cost_usd:plan.oneTimeCostUsd,plan_recurring_cost_usd:plan.recurringCostUsd,plan_total_cost_usd:plan.
totalCostUsd,plan_total_minutes:plan.totalMinutes,farm_economics,...farm_steps!==void 0&&{farm_steps}};(!boardInterval(saved)||
!matchesFields(expected,saved))&&slugs.push(slug)}return slugs}function prepareBoard({board,families,comparables},published,watchlist,age,ranks,steps){
let evidence=new Map(published.flatMap(row=>row?[[row.slug,row]]:[])),comparableKeys=new Set(comparables.map(({familyKey})=>familyKey));
return{diagnostics:evidence,families:new Map(families.filter(({key})=>comparableKeys.has(key)).map(family=>[family.representative.
slug,family])),protocols:new Map(board.map(row=>[row.protocol.slug,row])),mismatches:boardMismatches(board,published,steps),
rows:boardViewRows(board,evidence,ranks,watchlist,age)}}function boardViewRows(board,evidence,ranks,watchlist,age){let watchlisted=new Set(
watchlist);return board.map(({protocol,rank,implied_value_usd:value,launch_value_usd:launchValue,launchProbability12:odds,
plan,economics})=>{let{slug,name,tvl_usd,change_7d,category,chains,listed_at}=protocol,band=ranks.get(slug),deposit=economics.
deposits.find(({depositUsd})=>depositUsd===1e4);if(!deposit)throw new Error("Missing $10K farm economics.");return{slug,
name,rank,category,chains,value,launchValue,odds,tvl:tvl_usd,growth:change_7d,interval:boardInterval(evidence.get(slug)),
rankRange:band?[band.rank_p10,band.rank_p90]:null,age:listed_at?age(listed_at):null,cost:plan.totalCostUsd,time:plan.totalMinutes,
verdict:deposit.verdict,netPerHour:deposit.netPerHourUsd,watchlist:watchlisted.has(slug)}})}var viewTools={escapeHtml,formatInteger,formatOdds,growthText,statusLabels,svg,table};function valueFormula(model,row){let{intercept,lnTvl,lnAge}=model.coefficients,decimals=row?4:3,tvl=row?formatCompactUsd(
row.protocol.tvl_usd):"TVL",growth=row?Math.exp(row.features.growth).toFixed(3):"(1+g₇)",age=row?`${Math.exp(row.features.
lnAge).toFixed(0)} d`:"age",ageTerm=lnAge?` ${signedTerm(lnAge,decimals)} × ln(${age})`:"",effect=model.categoryEffects?.[row?.
features.category??"other"]??0,category=model.categoryEffects?row?` ${signedTerm(effect,decimals)}`:" + category effect":
"";return`${intercept.toFixed(decimals)} ${signedTerm(lnTvl,decimals)} × ln(${tvl}${model.momentum?` × ${growth}`:""})${ageTerm}${category}`}
function protocolView(row,{age,model,lnValue,back,usd,farm,diagnostics,families,maxOddsAge,effects}){let{protocol,plan,oddsAge,
oddsAt,launchProbability12:p12}=row,{airdropYieldApr,breakEvenDepositUsd,deposits}=row.economics,implied=usd(row.implied_value_usd),
interval=boardInterval(diagnostics)?.map(usd).join("–")??"—",influence=diagnostics?.influence,comparable=influence&&
families.get(influence.slug)?.representative.name,influenceLine=influence?.rank_delta===0?"No single comparable moves th\
is rank":influence&&comparable?`Without ${escapeHtml(comparable)}, rank moves by ${Math.abs(influence.rank_delta)}`:"",steps=table(
["Action","Est. fee","Min","When"],plan.steps.map(step=>[escapeHtml(step.action),usd(step.costUsd),formatInteger(step.minutes),
step.cadence]),{total:["Total",usd(plan.totalCostUsd),formatInteger(plan.totalMinutes),"—"]});return`<a class="back" h\
ref="${escapeHtml(back)}">← Back to board</a>
    <header class="protocol-heading"><div><h2>${escapeHtml(protocol.name)}</h2>
    <div class="chips">${[protocol.category??"Unlisted category",...protocol.chains].map(label=>chip(label)).join("")}</\
div>
    </div>${chip(`Board rank ${row.rank}`,"badge")}</header>
    <div class="detail-grid">
      <div class="detail-facts">
        <section class="panel"><h3>Implied value</h3>
          <p class="figure">${implied}</p>
          <p>P10–P90 · ${interval}</p>
          <p class="value-equation">ln V ≈ ${valueFormula(model,row)} ≈ ${lnValue.toFixed(3)} → ${usd(row.launch_value_usd)}\
 × P₁₂(${oddsAge.toFixed(0)} d) ${formatOdds(p12)} → ${implied}</p>
          ${effects?`<p class="caption">${effectLine(effects)}</p>`:""}
          ${influenceLine?`<p class="caption">${influenceLine}</p>`:""}
        </section>
        ${protocolFacts(row,age,usd,viewTools)}
        ${protocolClock(maxOddsAge,oddsAge,p12,age===null,oddsAt,viewTools)}
      </div><div class="detail-facts">
        <section class="panel farm"><h3>Farm plan</h3>
          <p class="plan-meta"><strong>${escapeHtml(plan.chain??"Chain unlisted")}</strong> · ${usd(plan.depositUsd)} p\
lan · ${plan.holdWeeks.toFixed(1)} weeks expected</p>
          ${table(["Deposit","Expected drop","Net","Net per hour","Verdict"],deposits.map(({depositUsd,expectedValueUsd,
netUsd,netPerHourUsd,verdict})=>[usd(depositUsd),usd(expectedValueUsd),usd(netUsd),usd(netPerHourUsd),verdict]),{className:"\
deposit-grid"})}
          <p class="caption">${usd(farm.hourlyRateUsd)}/h for labor · ${farm.farmerHaircut*100}% farmer haircut</p>
          <p>Expected airdrop yield ${(airdropYieldApr*100).toFixed(2)}% APR · Capital cost ${(plan.capitalApr*100).toFixed(
2)}% APR</p>
          <p>Break-even deposit · ${breakEvenDepositUsd==="never"?"never":usd(breakEvenDepositUsd)}</p>
          <p class="caption">${escapeHtml(plan.steps.at(-1)?.exitCondition??"")}</p>
          ${steps}
          <p class="caption">Fees and minutes per occurrence. Claim gas weighted by launch odds in totals. Assumptions ${plan.
assumptionsAsOf}${plan.flags.length?" · fallback fees":""}.</p>
        </section>
        ${nearestComparables(diagnostics?.twins??[],families,usd,viewTools)}
      </div>
    </div>`}var{isCensusSortKey,isSortKey,parseRoute}=window.Radar?.support??{};function scatterCoverage(points,families){let counts={missLow:0,covered:0,missHigh:0},seen=new Set,valid=[];for(let point of points){
if(!point)continue;let{slug,actual:actual2,predicted,p10,p90}=point,cap=families.get(slug)?.mcap_usd??0;p10===null||p90===
null||![p10,p90,actual2,predicted].every(Number.isFinite)||p10>p90||seen.has(slug)||Math.abs(actual2-Math.log(cap))>1e-9||
(seen.add(slug),valid.push(point),counts[actual2<p10?"missLow":actual2>p90?"missHigh":"covered"]++)}return{valid,counts,
invalidPoints:points.length-valid.length}}var{boot}=window.Radar?.support??{};function mountBoard(main,rows,summary,protocols,{formatUsd:usd,compareText,boardControls,view,boardHash,farmAssumptions}){
main.innerHTML=summary+element("#board-filters").innerHTML+boardTable();let sync=view&&boardControls?.(main,view,rows),results=element(
"#results",main),body=element("tbody",main),maxLogValue=Math.log1p(Math.max(1,...rows.flatMap(({value,interval})=>[value,
interval?.[1]??0]))),deposit=element('[name="deposit"]',main);deposit.innerHTML=farmAssumptions.depositsUsd.map(amount=>`\
<option value="${amount}"${amount===1e4?" selected":""}>$${amount/1e3}K</option>`).join("");let exports=["csv","json"].map(
format=>({format,link:element(`[download="radar.${format}"]`,main)})),render=state=>{sync?.(state);let amount=Number(deposit.
value)||1e4,live=rows.map(row=>{let economics=protocols.get(row.slug)?.economics.deposits.find(({depositUsd})=>depositUsd===
amount);return economics?{...row,verdict:economics.verdict,netPerHour:economics.netPerHourUsd}:row}),selected=selectRows(
live,state,compareText);results.textContent=`${formatInteger(selected.length)} of ${formatInteger(rows.length)} protocol\
s`,body.innerHTML=boardRows(selected,boardHash?.(state)??"#/",maxLogValue,usd);for(let{format,link}of exports)link.href=
`data:text/${format};charset=utf-8,${encodeURIComponent(serializeBoard(selected,format,amount))}`};return state=>{deposit.
onchange=()=>render(state),render(state)}}function start(main,snapshot,data,api,fail){let{buildRadar,daysBetween,farmAssumptions,
formatUsd}=api;api.view={...viewTools,element};let{meta}=data,radar=buildRadar(snapshot,data.model.fit,data.odds.terms,meta),
{model,odds,houseRule,census}=radar,{bootstrap,placebo}=api.reproduceDiagnostics(radar,data.model.fit.terms,snapshot.as_of),
effects=new Map(radar.board.map(({protocol})=>[protocol.slug,api.impliedValueEffects(protocol,snapshot.as_of,model,odds)])),
effectSummary=api.summarizeEffects(effects),coefficientSummary=api.summarizeEffects(new Map(radar.board.map(({protocol})=>[
protocol.slug,api.coefficientEffects(protocol,snapshot.as_of,model,odds)]))),{board:{rows:published}}=data,{families,diagnostics,
protocols,mismatches,rows}=prepareBoard(radar,published,snapshot.watchlist,date=>daysBetween(date,snapshot.as_of),bootstrap.
ranks,api.boardFarmSteps),scatter=scatterCoverage(data.looScatter??[],families),selection=api.reproduceSelection(radar),
rangeHonesty=api.rangeHonesty(scatter.valid),validation=api.scoreValueEvidence(radar.comparables,data.model.evidence),oddsValidation=api.
scoreOddsEvidence(radar.population,data.odds.validation.evidence),noScore={n:0,medianMultiplier:null,spearman:null},noValue={
model:noScore,flatMultiple:noScore,categoryMultiple:noScore},noOdds=[null,null],valueModel={...data.model,...model,selection:selection.
value,validation:validation??{leaveOneFamilyOut:noValue,seededFiveFold:noValue,walkForward:noValue}},oddsModel={...data.
odds,...odds,standardErrors:bootstrap.oddsErrors,validation:{evidence:data.odds.validation.evidence,selection:selection.
odds,...oddsValidation??{scores:noOdds,baselines:{baseRate:noOdds,pava:noOdds,clockOnly:noOdds}}}},checks=integrityChecks(
mismatches,published,snapshot.watchlist,{fitted:model.n,houseRule,intervalCounts:scatter.counts,invalidPoints:scatter.invalidPoints,
coverageUnavailable:data.looScatter===null&&model.n<api.MIN_BAND_FAMILIES,loo:valueModel.validation.leaveOneFamilyOut});
api.boardFarmSteps||checks.push({pass:null,label:"Step text comparison unavailable"}),element("#snapshot-date").textContent=
`Snapshot · ${snapshot.as_of}`;let selectionMatches=matchesFields(selection.value,data.model.selection,"",!0)&&matchesFields(
selection.value.terms,data.model.fit.terms)&&matchesFields(selection.odds,data.odds.validation.selection,"",!0)&&matchesFields(
selection.odds.terms,data.odds.terms);checks.push({pass:selectionMatches,label:`Term selection ${selectionMatches?"repro\
duced":"differs"} · ${termCounts(selection.value)} · ${termCounts(selection.odds)}`}),matchesFields(rangeHonesty,data.
rangeHonesty)||checks.push({pass:!1,label:"Held-out coverage totals differ from published data"});let sign=value=>Math.abs(
value)<=1e-9?0:Math.sign(value);checks.push({pass:matchesFields(census,data.census),label:"Census = recompute"},{pass:effectSummary.
every(([median],i)=>Number.isFinite(median)&&sign(median)===sign(coefficientSummary[i]?.[0]??NaN))&&matchesFields(effectSummary.
map(([median])=>median),data.effectMedians,"",!0),label:"Input effects = reference"},{pass:validation!==null&&oddsValidation!==
null&&matchesFields(validation,data.model.validation,"",!0)&&matchesFields(oddsValidation,data.odds.validation,"",!0),label:"\
Validation = fold predictions"},{pass:bootstrap.replicates===data.bootstrap?.replicates&&matchesFields(bootstrap.seeds,data.
bootstrap?.seeds)&&matchesFields(bootstrap.valueErrors,data.bootstrap?.valueErrors,"",!0)&&matchesFields(bootstrap.oddsErrors,
data.odds.standardErrors,"",!0)&&bootstrap.ranks.size===published.length&&published.every(row=>{let band=row&&bootstrap.
ranks.get(row.slug);return!!band&&matchesFields(band,row)}),label:`Bootstrap · ${bootstrap.replicates} refits match`},{
pass:placebo.shuffles===data.placebo?.shuffles&&placebo.seed===data.placebo?.seed&&matchesFields(placebo,data.placebo,"",
!0),label:`Placebo · ${placebo.shuffles} refits match`}),element("#kpis").innerHTML=kpiStrip(valueModel,oddsModel.validation,
rangeHonesty,effectSummary,rows,census.length,new Set(snapshot.watchlist).size),element("#formula").textContent=`ln V = ${valueFormula(
model)}`,element("#checks").innerHTML=integrityStrip(checks);let updateBoard,updatePlan,lastPage;function draw(){try{let route=parseRoute(
location.hash),page=route.page==="protocol"?`p/${route.slug}`:route.page,changedPage=lastPage&&lastPage!==page;if(lastPage=
page,changedPage&&(updateBoard=void 0,updatePlan=void 0),route.page==="board")updateBoard??=mountBoard(main,rows,censusSummary(
census,protocols),protocols,api),updateBoard(route.state);else if(route.page==="plan")updatePlan??=api.mountPlanner?.(main,
radar.board,meta,api),updatePlan?updatePlan(location.hash):main.innerHTML=element("#plan-unavailable").innerHTML;else if(route.
page==="census")main.innerHTML=censusView(census,route.state,formatUsd,api.compareText,protocols);else if(route.page==="\
method")main.innerHTML=methodView({model:valueModel,odds:oddsModel,rangeHonesty,bootstrap,placebo,effectSummary,boardSize:rows.
length},panel=>methodNotes(houseRule,farmAssumptions,formatUsd,formatOdds,panel));else{let back=api.boardHash?.(route.state)??
"#/",detail=route.page==="protocol"?protocols.get(route.slug):void 0,listed=detail?.protocol.listed_at;main.innerHTML=detail?
protocolView(detail,{age:listed?daysBetween(listed,snapshot.as_of):null,model,lnValue:api.logValue(detail.features,model),
back,usd:formatUsd,farm:farmAssumptions,diagnostics:diagnostics.get(detail.protocol.slug),families,maxOddsAge:odds.maxAgeDays,
effects:effects.get(detail.protocol.slug)}):`<h2>Page unavailable</h2><a href="${escapeHtml(back)}">Back to board</a>`}changedPage&&
(window.scrollTo(0,0),main.focus({preventScroll:!0})),main.dataset.ready=""}catch{lastPage="error",fail()}}draw(),window.
addEventListener("hashchange",draw),api.bindControls?.(main,draw,{isCensusSortKey,isSortKey,parseRoute})}boot?.(start);
})();
