(()=>{function compareText(a,b){return a<b?-1:Number(a>b)}function compareRows(a,b,sort,direction){if(sort===
"name")return direction*compareText(a.name.toLowerCase(),b.name.toLowerCase());const first=a[sort];const second=b[sort];
if(first===second)return 0;if(first===null)return 1;if(second===null)return-1;return direction*(Number(
first)-Number(second))}function selectRows(rows,state){const{sort,dir,cat,chain,wl}=state;const query=state.
q.trim().toLowerCase();const direction=dir==="asc"?1:-1;return rows.filter(row=>(!cat||row.category===
cat)&&(!chain||row.chains.includes(chain))&&(!wl||row.watchlist)&&(!query||row.name.toLowerCase().includes(
query))).sort((a,b)=>compareRows(a,b,sort,direction)||compareText(a.slug,b.slug))}function formatInteger(value){return value===null?"—":value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,
",")}function formatPercent(value){if(value===null)return"—";const magnitude=Math.abs(value).toFixed(
1);const sign=magnitude==="0.0"?"":value<0?"−":"+";return`${sign}${magnitude}%`}function escapeHtml(value){
return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&\
quot;").replaceAll("'","&#39;")}function tableBody(rows,columns2,options2={}){if(!rows.length&&options2.empty){return`<tr><td colspa\
n="${columns2}" class="empty">${escapeHtml(options2.empty)}</td></tr>`}return rows.map(row=>`<tr${options2.
linked?" data-protocol":""}><td>${row.join("</td><td>")}</td></tr>`).join("")}function table(headers,rows,options2={}){
const head=headers.map(header2=>{if(typeof header2==="string")return`<th scope="col">${escapeHtml(header2)}\
</th>`;const[key,label2]=header2;const direction=options2.dir==="desc"?"descending":"ascending";return`\
<th scope="col"${options2.sort===key?` aria-sort="${direction}"`:""}><button type="button" data-sort\
="${escapeHtml(key)}">${escapeHtml(label2)}</button></th>`});const[label,...totals]=options2.total??
[];const foot=label===void 0?"":`<tfoot><tr><th scope="row">${label}</th><td>${totals.join("</td><td\
>")}</td></tr></tfoot>`;return`<table${options2.className?` class="${options2.className}"`:""}><thea\
d><tr>${head.join("")}</tr></thead><tbody>${tableBody(rows,headers.length,options2)}</tbody>${foot}<\
/table>`}function svg(width,height,content){return`<svg viewBox="0 0 ${width} ${height}" preserveAsp\
ectRatio="none" aria-hidden="true">${content}</svg>`}function options(values){return[...new Set(values)].
sort().map(value=>{const label=escapeHtml(value);return`<option value="${label}">${label}</option>`}).
join("")}var columns={rank:"Rank",name:"Protocol",value:"Implied value",tvl:"TVL",growth:"7d %",age:"Days wit\
h no token",cost:"12-mo fees",time:"Plan time",watchlist:"Watchlist"};var sliderLimits={share:100,haircut:100,
rate:250,yield:50,carry:50};var statusLabels={traded:"Token trades","token-unpriced":"Records an unp\
riced token","pre-token":"Records no token",excluded:"Excluded by the house rule"};var defaultCensus={
status:"",sort:"tvl",dir:"desc"};var defaultState={sort:"rank",dir:"asc",cat:"",chain:"",wl:false,q:""};
function isSortKey(value){return value!==void 0&&Object.hasOwn(columns,value)}function limit(value,fallback){
const number=Number(value);return value?.trim()&&Number.isFinite(number)&&number>=0?number:fallback}
function parseRoute(hash){const[path,query]=hash.slice(1).split(/\?(.*)/s,2);const params=new URLSearchParams(
query);if(path==="/method")return{page:"method"};if(path==="/census"){const status=params.get("statu\
s");const sort2=params.get("sort");return{page:"census",state:{status:status&&Object.hasOwn(statusLabels,
status)?status:"",sort:sort2==="name"||sort2==="status"?sort2:"tvl",dir:params.get("dir")==="asc"?"a\
sc":"desc"}}}if(path==="/plan"){const list=/(?:^|&)chains=([^&]*)/.exec(query??"")?.[1]??"";const chains=list.
split(",").map(part=>new URLSearchParams(`c=${part}`).get("c")??"");const sliders={};for(const key of Object.
keys(sliderLimits)){const value=limit(params.get(key),-1);if(value>=0&&value<=sliderLimits[key])sliders[key]=
value}return{page:"plan",state:{budgetUsd:limit(params.get("budget"),5e3),hoursPerWeek:limit(params.
get("hours"),3),chains:[...new Set(chains.filter(Boolean))],sliders}}}const sort=params.get("sort")??
void 0;const state={sort:isSortKey(sort)?sort:defaultState.sort,dir:params.get("dir")==="desc"?"desc":
"asc",cat:params.get("cat")??"",chain:params.get("chain")??"",wl:params.get("wl")==="1",q:params.get(
"q")??""};if(!path||path==="/")return{page:"board",state};const segment=/^\/p\/([^/]+)$/.exec(path)?.[1];
if(segment){try{return{page:"protocol",slug:decodeURIComponent(segment),state}}catch{return{page:"un\
known",state}}}return{page:"unknown",state}}function planHash({budgetUsd,hoursPerWeek,chains,sliders}){
const list=chains.map(encodeURIComponent).join(",");const params=new URLSearchParams({budget:String(
budgetUsd),hours:String(hoursPerWeek)});for(const key of Object.keys(sliderLimits)){if(sliders[key]!==
void 0)params.set(key,String(sliders[key]))}return`#/plan?${params}${list?`&chains=${list}`:""}`}function censusHash({
status,sort,dir}){const params=new URLSearchParams;if(status)params.set("status",status);if(sort!==defaultCensus.
sort||dir!==defaultCensus.dir){params.set("sort",sort);params.set("dir",dir)}return`#/census${params.
size?`?${params}`:""}`}function boardHash(state){const params=new URLSearchParams;if(state.sort!==defaultState.
sort||state.dir!==defaultState.dir){params.set("sort",state.sort);params.set("dir",state.dir)}if(state.
cat)params.set("cat",state.cat);if(state.chain)params.set("chain",state.chain);if(state.wl)params.set(
"wl","1");if(state.q)params.set("q",state.q);const query=params.toString();return query?`#/?${query}`:
"#/"}function protocolHash(slug,state){return`#/p/${encodeURIComponent(slug)}${boardHash(state).slice(
2)}`}function boardView(rows){const categories=rows.flatMap(({category})=>category??[]);return`<form clas\
s="filters" aria-label="Board filters">
<label class="field">Search protocol<input type="search" name="q" autocomplete="off"></label>
<label class="field">Category<select name="cat"><option value="">All categories</option>${options(categories)}\
</select></label>
<label class="field">Chain<select name="chain"><option value="">All chains</option>${options(rows.flatMap(
({chains})=>chains))}</select></label>
<label class="toggle"><input type="checkbox" name="wl"> Watchlist only</label>
<output id="results" aria-live="polite"></output>
</form>
<section class="table-window" aria-label="Protocol rankings" tabindex="0">${table(Object.entries(columns),
[],{className:"ranking"})}</section>`}function chip(label,className="chip"){return`<span class="${className}\
">${escapeHtml(label)}</span>`}function growthText(growth){const text=formatPercent(growth);const trend=text.
startsWith("+")?"gain":text.startsWith("−")?"loss":"";return`<span class="${trend}">${text}</span>`}
function boardRows(rows,state,maxLogValue,usd){const scale=value=>Math.log1p(value)/maxLogValue*100;
return tableBody(rows.map(row=>{const href=escapeHtml(protocolHash(row.slug,state));const remaining=row.
chains.length-2;const[low,high]=row.interval??[0,0];const band=row.interval?`<rect class="band" x="${scale(
low).toFixed(2)}" y="5" width="${(scale(high)-scale(low)).toFixed(2)}" height="3"></rect>`:"";return[
formatInteger(row.rank),`<a class="protocol-name" href="${href}">${escapeHtml(row.name)}</a>
       <div class="chips" title="${escapeHtml(row.chains.join(", "))}">${chip(row.category??"Unliste\
d category")}${row.chains.slice(0,2).map(chain=>chip(chain)).join("")}${remaining>0?chip(`+${remaining}`):
""}</div>`,`<div class="value" ${row.interval?`title="P10–P90: ${usd(low)}–${usd(high)}"`:""}><s\
trong>${usd(row.value)}</strong>
        ${svg(100,8,`<rect width="${scale(row.value).toFixed(2)}" height="3"></rect>${band}`)}</div>`,
usd(row.tvl),growthText(row.growth),formatInteger(row.age),usd(row.cost),`${formatInteger(row.time)}\
 min`,row.watchlist?chip("Watchlist","badge"):"—"]}),Object.keys(columns).length,{linked:true,empty:"\
No protocols match these filters."})}function selectCensus(rows,{status,sort,dir}){const direction=dir==="asc"?1:-1;return rows.filter(row=>!status||
row.status===status).sort((a,b)=>{const order=sort==="tvl"?a.tvl_usd-b.tvl_usd:compareText(a[sort].toLowerCase(),
b[sort].toLowerCase());return direction*order||compareText(a.slug,b.slug)})}function censusView(rows,state,usd){
const selected=selectCensus(rows,state);return`<h2>Protocol census</h2>
    <div class="filters">
      <label class="field">Status <select name="status"><option value="">All statuses</option>${Object.
entries(statusLabels).map(([key,label])=>`<option value="${key}"${state.status===key?" selected":""}\
>${label}</option>`).join("")}</select></label>
      <output id="results">${formatInteger(selected.length)} of ${formatInteger(rows.length)} protoc\
ols</output>
    </div>
    ${table([["name","Protocol"],["status","Status"],"Reason",["tvl","TVL"]],selected.map(({name,status,
reason,tvl_usd})=>[escapeHtml(name),statusLabels[status],escapeHtml(reason),usd(tvl_usd)]),{...state,
className:"ranking census",empty:"No matching protocols."})}`}function countBoardMismatches(computed,published){let count=Math.abs(computed.length-published.length);
for(const[index,row]of computed.entries()){const other=published[index];if(other&&(row.slug!==other.
slug||row.rank!==other.rank||row.implied_value_usd!==other.implied_value_usd||row.farm_steps.length!==
other.farm_steps.length||row.farm_steps.some((step,i)=>step!==other.farm_steps[i]))){count++}}return count}function integrityChecks(computed,published,watchlist,{houseRule,intervalCounts,loo}){const mismatches=countBoardMismatches(
computed,published);const slugs=new Set(published.map(({slug})=>slug));const unique=[...new Set(watchlist)];
const covered=unique.filter(slug=>slugs.has(slug)).length;const{missLow,covered:inside,missHigh}=intervalCounts??
{missLow:0,covered:0,missHigh:0};const samples=missLow+inside+missHigh;const extra=houseRule.falsePositives.
length;const model=loo.model.medianMultiplier;const flat=loo.flatMultiple.medianMultiplier;return[{pass:mismatches===
0,label:mismatches?`Page recompute · ${mismatches} mismatch${mismatches===1?"":"es"}`:`Page recompu\
te = board.json (${published.length} rows)`},{pass:covered===unique.length,label:`Watchlist ${covered}\
/${unique.length} on board`},{pass:houseRule.recall===1&&houseRule.falseNegatives.length===0,label:`\
House rule ${(houseRule.recall*100).toFixed(0)}% recall${extra?` · ${extra} extra explained by pare\
ntProtocol`:""}`},{pass:samples>0&&inside/samples>=.8,label:samples?`${inside}/${samples} inside P10\
–P90`:"P10–P90 coverage unavailable"},{pass:model!==null&&flat!==null&&model<flat,label:`LOO med\
ian error ${multiplier(model)} vs ${multiplier(flat)} flat`}]}function multiplier(value){return value===
null?"—":`×${value.toFixed(2)}`}function methodView({model,houseRule,intervalCounts,launchClock},farm,usd){const{coefficients,validation,
ablation}=model;const{intercept,lnTvl,lnAge}=coefficients;const{leaveOneFamilyOut,seededFiveFold,walkForward}=validation;
const{full,withoutTvl,withoutAge,withoutMomentum,withCategory,ols}=ablation;const score=({medianMultiplier,
spearman})=>[multiplier(medianMultiplier),spearman?.toFixed(3)??"—"];const section=(title,headers,rows,note="")=>`\
<section class="panel"><h3>${title}</h3>${table(headers,rows)}${note?`<p class="caption">${note}</p>`:
""}</section>`;const{truePositives,falsePositives,falseNegatives}=houseRule;const pct=value=>`${(value*
100).toFixed(1)}%`;return`<h2>Method</h2><div class="method compact">
    ${section("Value model",["Term in ln V","Coefficient"],[["Intercept",intercept.toFixed(6)],["ln(\
TVL·(1+g₇))",lnTvl.toFixed(6)],["ln(age)",lnAge.toFixed(6)],["Ridge penalty λ",String(model.lambda)]],
`Huber ridge on ${model.n} traded families.`)}
    ${section("Out-of-sample validation",["Scheme","Model","Flat","Category"],[["Leave one family ou\
t",leaveOneFamilyOut],["Seeded five-fold",seededFiveFold],["Walk-forward",walkForward]].map(([label,
{model:fitted,flatMultiple,categoryMultiple}])=>[label,...[fitted,flatMultiple,categoryMultiple].map(
s=>score(s).join(" · "))]),"Cells show median error ×k and Spearman ρ.")}
    ${section("Leave-one-family-out ablation",["Variant","Median error","Spearman ρ"],[["Full",full],
["−TVL",withoutTvl],["−Age",withoutAge],["−Momentum",withoutMomentum],["+Category",withCategory],
["OLS",ols]].map(([label,metrics])=>[label,...score(metrics)]),"Category was tested and rejected. Wi\
thout age, both scores improve slightly.")}
    ${section("Held-out P10–P90 coverage",["Below P10","Inside","Above P90"],intervalCounts?[[intervalCounts.
missLow,intervalCounts.covered,intervalCounts.missHigh].map(String)]:[],"Jackknife+ bands.")}
    ${section("Launch clock F(t)",["Mean age (days)","Fitted token share","Count"],launchClock.points.
map(({ageDays,share,count})=>[ageDays.toFixed(0),pct(share),String(count)]),"P12 estimates the next \
year conditional on recording no token.")}
    ${section("House watchlist rule",["TP","FP","FN"],[[truePositives.length,falsePositives.length,falseNegatives.
length].map(String)],"DefiLlama marks the extra matches with parentProtocol, absent from the snapsho\
t.")}
    ${section(`Farm assumptions · ${farm.asOf}`,["Input","Default"],[["Horizon",`${farm.horizonMonths}\
 months`],["Airdrop share of launch cap",pct(farm.airdropShareOfLaunchCap)],["Farmer haircut (retain\
ed)",pct(farm.farmerHaircut)],["Labor",`${usd(farm.hourlyRateUsd)}/h`],["Capital APR",`${pct(farm.capitalApr.
yieldBearing)} yield-bearing · ${pct(farm.capitalApr.nonYielding)} non-yielding`],["Verdict test de\
posits",farm.depositsUsd.map(usd).join(" · ")],["EV / cost cutoffs",`FARM ≥ ${farm.farmThreshold}\
 · THIN ≥ ${farm.thinThreshold}`]])}
  </div>`}var sliderLabels={share:"Airdrop share of launch cap (%)",haircut:"Farmer haircut, retained (%)",rate:"\
Labor rate (USD/h)",yield:"Yield-bearing capital APR (%)",carry:"Non-yielding capital APR (%)"};function sliderValues(farm){
return{share:farm.airdropShareOfLaunchCap*100,haircut:farm.farmerHaircut*100,rate:farm.hourlyRateUsd,
yield:farm.capitalApr.yieldBearing*100,carry:farm.capitalApr.nonYielding*100}}function plannerSettings(farm,sliders){
const values={...sliderValues(farm),...sliders};return{...farm,airdropShareOfLaunchCap:values.share/
100,farmerHaircut:values.haircut/100,hourlyRateUsd:values.rate,capitalApr:{yieldBearing:values.yield/
100,nonYielding:values.carry/100}}}function plannerForm(chains){return`<section class="panel farm po\
rtfolio"><h2>Farm portfolio</h2>
    <p class="plan-meta">12-month estimates. Costs include fees, labor and capital.</p>
    <form>
      <div class="filters">
        <label class="field">Cash budget (USD)<input name="budget" type="number" min="0" step="any" \
required></label>
        <label class="field">Weekly hours cap<input name="hours" type="number" min="0" step="any" re\
quired></label>
        <label class="field">Chains · leave empty for all<select name="chains" multiple size="4">${options(
chains)}</select></label>
      </div>
      <fieldset class="sliders"><legend>Farm assumptions</legend>
        ${Object.entries(sliderLimits).map(([key,max])=>`<label>${sliderLabels[key]} <output></outpu\
t><input type="range" name="${key}" min="0" max="${max}" step="any"></label>`).join("")}
        <button type="button" data-reset>Reset to defaults</button>
      </fieldset>
    </form>
    <div id="portfolio-results" aria-live="polite"></div>
  </section>`}var reasons={"over-budget":"Over budget","over-hours":"Over hours","chain-excluded":"C\
hain excluded","non-positive":"No positive net value at any deposit"};function plannerResults({positions,
totals,rejected,closest},economics,getName,usd){const name=slug=>escapeHtml(getName(slug));const values=({
depositUsd,expectedValueUsd,costUsd,netUsd})=>[depositUsd,expectedValueUsd,costUsd,netUsd].map(usd);
const chainName=chain=>escapeHtml(chain??"Unlisted");const labels=["FARM","THIN","SKIP"];const verdicts=table(
["Deposit",...labels],economics[0]?.deposits.map(({depositUsd},i)=>{const counts={FARM:0,THIN:0,SKIP:0};
for(const{deposits}of economics)counts[deposits[i]?.verdict??"SKIP"]++;return[usd(depositUsd),...labels.
map(label=>String(counts[label]))]})??[]);const chosen=positions.length?`<p class="plan-meta">${usd(
totals.cashUsd)} cash · ${usd(totals.feesUsd)} fees · ${totals.hoursPerWeek.toFixed(2)} average ho\
urs/week</p>
      <div class="portfolio-table">${table(["Protocol","Chain","Deposit","Expected value","Cost","Ne\
t"],positions.map(p=>[name(p.slug),chainName(p.chain),...values(p)]),{total:["Total","",...values(totals)]})}\
</div>`:"<p><strong>No candidate with positive net value fits these limits.</strong></p>";const near=closest.
length?`<h3>Closest to break-even</h3><ul>${closest.map(p=>`<li>${name(p.slug)} · ${chainName(p.chain)}\
 · ${usd(p.depositUsd)} deposit · ${usd(p.shortfallUsd)} shortfall</li>`).join("")}</ul>`:"";const skipped=rejected.
length?`<h3>Top-ranked protocols skipped</h3><ul>${rejected.map(({slug,reason})=>`<li>${name(slug)} \
· ${reasons[reason]}</li>`).join("")}</ul>`:"";return`<div class="verdicts"><h3>Verdicts for all bo\
ard plans</h3>${verdicts}</div><h3>Portfolio under your limits</h3>${chosen}${near}${skipped}`}function ageSparkline(points,age,share){const last=points.at(-1);const first=points[0];if(!first||!last)
return"";const maxAge=Math.max(1,last.ageDays,age);const x=days=>(days*100/maxAge).toFixed(2);const y=fraction=>((1-
fraction)*40).toFixed(2);const line=[`0.00,${y(first.share)}`,...points.map(point=>`${x(point.ageDays)}\
,${y(point.share)}`),`100.00,${y(last.share)}`].join(" ");return svg(100,40,`<polyline points="${line}\
"></polyline><circle cx="${x(age)}" cy="${y(share)}" r="2" class="age-point"></circle>`)}var reasonLabels={"pre-token":"Meets the pre-token rule",watchlist:"House watchlist"};var flagLabels={
"growth-missing":"Missing TVL change. The model uses zero growth.","age-missing":"Missing listing da\
te. The model uses median comparable age.","outside-comps-range":"TVL or age falls outside the compa\
rable range."};function decomposition(row,usd){const{base,multipliers}=row.decomposition;const afterTvl=base*
multipliers.lnTvl;const afterGrowth=afterTvl*multipliers.growth;const stages=[{label:"Base",value:base},
{label:"TVL",factor:multipliers.lnTvl,value:afterTvl},{label:"7d growth",factor:multipliers.growth,value:afterGrowth},
{label:"Age",factor:multipliers.lnAge,value:row.valueUsd},{label:"Board value",value:row.implied_value_usd}];
const largest=Math.max(1,...stages.map(({value})=>Number.isFinite(value)?value:0));return`<ol class=\
"waterfall">${stages.map(({label,factor,value})=>{const finite=Number.isFinite(value);const width=finite?
(value/largest*100).toFixed(2):"0";return`<li><span>${label}</span><span>${factor===void 0?"":`×${factor.
toPrecision(4)}`}</span>${svg(100,6,`<rect width="${width}" height="6"></rect>`)}<strong>${finite?usd(
Math.round(value)):"—"}</strong></li>`}).join("")}</ol>`}function protocolView(row,{age,back,usd,farm,
diagnostics,families,launchClock,clockShareAt}){const{protocol,plan,economics,status}=row;const{hourlyRateUsd,
farmerHaircut}=farm;const{airdropYieldApr,breakEvenDepositUsd}=economics;const facts=[["TVL",usd(protocol.
tvl_usd)],["7d TVL change",growthText(protocol.change_7d)],["Listed",escapeHtml(protocol.listed_at??
"Unlisted")],[status==="traded"||status==="token-unpriced"?"Days since listing":"Days with no token",
formatInteger(age)]];const interval=diagnostics?`${usd(diagnostics.interval_p10_usd)}–${usd(diagnostics.
interval_p90_usd)}`:"—";const influence=diagnostics?.influence;const comparable=influence&&families.
get(influence.slug)?.representative.name;const influenceLine=influence?.rank_delta===0?"No single co\
mparable moves this rank":influence&&comparable?`Without ${escapeHtml(comparable)}, rank moves by ${Math.
abs(influence.rank_delta)}`:"";const clockAge=Math.max(0,age??launchClock.medianAgeDays??0);const{points}=launchClock;
const p12=diagnostics?.launch_p12??economics.launchProbability12;const twins=(diagnostics?.twins??[]).
map(slug=>{const family=families.get(slug);return[escapeHtml(family?.representative.name??slug),family?.
mcap_usd?usd(family.mcap_usd):"—"]});const steps=table(["Action","Est. fee","Minutes","Cadence"],plan.
steps.map(step=>[escapeHtml(step.action)+(step.exitCondition?`<small>${escapeHtml(step.exitCondition)}\
</small>`:""),usd(step.costUsd),formatInteger(step.minutes),step.cadence]),{total:["Total planned",usd(
plan.totalCostUsd),formatInteger(plan.totalMinutes),"All"]});return`<a class="back" href="${escapeHtml(
back)}">← Back to board</a>
    <header class="protocol-heading"><div><h2>${escapeHtml(protocol.name)}</h2>
      <div class="chips">${chip(protocol.category??"Unlisted category")}${protocol.chains.map(chain=>chip(
chain)).join("")}</div>
    </div>${chip(`Board rank ${row.rank}`,"badge")}</header>
    <div class="detail-grid">
      <div class="detail-facts">
        <section class="panel"><h3>Conditional value at launch</h3>
          <p class="figure">${usd(row.implied_value_usd)}</p>
          <p>P10–P90 · ${interval}</p>
          <p class="caption">If the protocol’s record stays as it is.</p>
          ${decomposition(row,usd)}
          ${influenceLine?`<p class="caption">${influenceLine}</p>`:""}
        </section>
        <section class="panel"><h3>Protocol record</h3>
          <dl class="facts">${facts.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></d\
iv>`).join("")}</dl>
          <p><strong>${statusLabels[status]}</strong>${status==="pre-token"?"":` · ${escapeHtml(row.
reason)}`}</p>
          <p class="muted">Included · ${row.boardReasons.map(reason=>reasonLabels[reason]).join(" ·\
 ")}</p>
          ${row.flags.length?`<ul class="flags">${row.flags.map(flag=>`<li>${flagLabels[flag]}</li>`).
join("")}</ul>`:""}
        </section>
        <section class="panel clock"><h3>Launch clock F(t)</h3>
          ${ageSparkline(points,clockAge,clockShareAt(points,clockAge))}
          <p><strong>P12 · ${(p12*100).toFixed(1)}%</strong></p>
          <p class="caption">Age marker · ${formatInteger(clockAge)} days${age===null?" (median pro\
xy)":""}</p>
        </section>
      </div>
      <div class="detail-facts">
        <section class="panel farm"><h3>Farm plan</h3>
          <p class="plan-meta"><strong>${escapeHtml(plan.chain??"Chain unlisted")}</strong> · ${usd(
plan.depositUsd)} plan · ${plan.horizonMonths} months</p>
          <div class="chips">${economics.deposits.map(({depositUsd,verdict})=>chip(`${usd(depositUsd)}\
 ${verdict}`,"badge")).join("")}</div>
          <p class="caption">${usd(hourlyRateUsd)}/h for labor · ${farmerHaircut*100}% farmer hairc\
ut</p>
          <p>Expected airdrop yield ${(airdropYieldApr*100).toFixed(2)}% APR · Capital cost ${(plan.
capitalApr*100).toFixed(2)}% APR</p>
          <p>Break-even deposit · ${breakEvenDepositUsd==="never"?"never":usd(breakEvenDepositUsd)}\
</p>
          ${steps}
          <p class="caption">Per-occurrence minutes and fees. Assumptions ${plan.assumptionsAsOf}${plan.
flags.length?" · fallback fees":""}.</p>
        </section>
        <section class="panel compact"><h3>Nearest comparables</h3>
          ${table(["Twin","Family market cap"],twins)}
        </section>
      </div>
    </div>`}function element(selector,root=document){const found=root.querySelector(selector);if(!found)throw new Error(
`Missing dashboard element ${selector}`);return found}function signedTerm(value){return`${value<0?"−":
"+"} ${Math.abs(value).toFixed(3)}`}function header(counts,coefficients,checks){const{intercept,lnTvl,
lnAge}=coefficients;return`
<dl class="kpis">${counts.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join(
"")}</dl>
<section class="model" aria-label="Value model">
<p class="equation">ln V = ${intercept.toFixed(3)} ${signedTerm(lnTvl)}·ln(TVL·(1+g₇)) ${signedTerm(
lnAge)}·ln(age)</p>
<p class="caption">Age is days since listing, minimum 1. g₇ is 7-day TVL growth clipped to −50%…+100\
%.</p>
<ul class="integrity">${checks.map(({pass,label})=>`<li class="${pass?"check":"check-failed"}">${pass?
"✓":"✗"} ${escapeHtml(label)}</li>`).join("")}</ul>
</section>`}function mountBoard(main2,rows,maxLogValue,usd){main2.innerHTML=boardView(rows);const search=element(
'[name="q"]',main2);const category=element('[name="cat"]',main2);const chain=element('[name="chain"]',
main2);const watchlist=element('[name="wl"]',main2);const results=element("#results",main2);const body=element(
"tbody",main2);const buttons=main2.querySelectorAll("button[data-sort]");function setSelect(select,value){
select.value=value;if(select.selectedIndex<0)select.add(new Option(value,value,false,true))}return state=>{
if(search.value!==state.q)search.value=state.q;setSelect(category,state.cat);setSelect(chain,state.chain);
watchlist.checked=state.wl;for(const button of buttons){const th=button.parentElement;if(th)th.ariaSort=
button.dataset.sort!==state.sort?null:state.dir==="asc"?"ascending":"descending"}const selected=selectRows(
rows,state);results.textContent=`${formatInteger(selected.length)} of ${formatInteger(rows.length)} \
protocols`;body.innerHTML=boardRows(selected,state,maxLogValue,usd)}}function start(main2,snapshot2,data2,api2){
const{buildRadar,daysBetween,farmAssumptions,formatUsd}=api2;const{launchClock,meta}=data2;const radar=buildRadar(
snapshot2,data2.model.lambda,launchClock,meta);const published=data2.board.rows;const computed=radar.
board.map(row=>({...row,slug:row.protocol.slug}));const families=new Map(radar.families.map(family=>[
family.representative.slug,family]));const evidence=new Map(published.map(row=>[row.slug,row]));const checks=integrityChecks(
computed,published,snapshot2.watchlist,{...data2,loo:data2.model.validation.leaveOneFamilyOut});const watchlisted=new Set(
snapshot2.watchlist);const protocols=new Map(radar.board.map(row=>[row.protocol.slug,row]));const age=({
listed_at})=>listed_at===null?null:daysBetween(listed_at,snapshot2.as_of);const rows=radar.board.map(
({protocol,rank,status,implied_value_usd,plan})=>{const{slug,name,tvl_usd,change_7d,category,chains}=protocol;
const diagnostics=evidence.get(slug);return{slug,name,rank,category,chains,value:implied_value_usd,tvl:tvl_usd,
growth:change_7d,interval:diagnostics?[diagnostics.interval_p10_usd,diagnostics.interval_p90_usd]:null,
age:status==="traded"||status==="token-unpriced"?null:age(protocol),cost:plan.totalCostUsd,time:plan.
totalMinutes,watchlist:watchlisted.has(slug)}});const maxLogValue=Math.log1p(Math.max(1,...rows.map(
row=>Math.max(row.value,row.interval?.[1]??0))));element("#snapshot-date").textContent=`Snapshot · ${snapshot2.
as_of}`;element("#summary").innerHTML=header([["Protocols scanned",formatInteger(snapshot2.protocols.
length)],["Traded comparables",formatInteger(radar.model.n)],["Board rows",formatInteger(rows.length)]],
radar.model.coefficients,checks);let updateBoard;let updatePlan;let lastPage;function mountPlanner(){
main2.innerHTML=plannerForm(rows.flatMap(row=>row.chains));const form=element("form",main2);const budget=element(
'[name="budget"]',form);const hours=element('[name="hours"]',form);const select=element('[name="chai\
ns"]',form);const results=element("#portfolio-results",main2);const sliders=form.querySelectorAll('i\
nput[type="range"]');let state;const save=()=>{if(!form.checkValidity())return;location.hash=planHash(
{budgetUsd:budget.valueAsNumber,hoursPerWeek:hours.valueAsNumber,chains:Array.from(select.selectedOptions,
option=>option.value),sliders:state.sliders})};form.onchange=save;form.onsubmit=event=>{event.preventDefault();
save()};const setSliders=sliders2=>{const next={...state,sliders:sliders2};history.replaceState(null,
"",planHash(next));update(next)};form.oninput=({target})=>{if(target instanceof HTMLInputElement&&target.
type==="range"){setSliders({...state.sliders,[target.name]:target.valueAsNumber})}};element("[data-r\
eset]",form).onclick=()=>setSliders({});function update(next){state=next;budget.value=String(state.budgetUsd);
hours.value=String(state.hoursPerWeek);for(const chain of state.chains){if(![...select.options].some(
option=>option.value===chain)){select.add(new Option(chain,chain))}}for(const option of select.options)
option.selected=state.chains.includes(option.value);const{budgetUsd,hoursPerWeek}=state;const values={
...sliderValues(farmAssumptions),...state.sliders};for(const slider of sliders){slider.value=String(
values[slider.name]);const output=slider.previousElementSibling;output.value=slider.value}const assumptions={
...plannerSettings(farmAssumptions,state.sliders),tables:meta};const economics=radar.board.map(row=>api2.
estimateFarmEconomics(row.plan,row.implied_value_usd,row.protocol.tvl_usd,row.economics.launchProbability12,
assumptions));const result=api2.planPortfolio(radar.board,{budgetUsd,hoursPerWeek,assumptions,...state.
chains.length?{chains:state.chains}:{}});results.innerHTML=plannerResults(result,economics,slug=>protocols.
get(slug)?.protocol.name??slug,formatUsd)}return update}function draw(){delete main2.dataset.ready;const route=parseRoute(
location.hash);const page=route.page==="protocol"?`protocol/${route.slug}`:route.page;const changedPage=lastPage&&
lastPage!==page;lastPage=page;if(route.page!=="board")updateBoard=void 0;if(route.page!=="plan")updatePlan=
void 0;if(route.page==="board"){updateBoard??=mountBoard(main2,rows,maxLogValue,formatUsd);updateBoard(
route.state)}else if(route.page==="plan"){updatePlan??=mountPlanner();updatePlan(route.state)}else if(route.
page==="census"){main2.innerHTML=censusView(data2.census,route.state,formatUsd)}else if(route.page===
"method"){main2.innerHTML=methodView(data2,farmAssumptions,formatUsd)}else{const back=boardHash(route.
state);const detail=route.page==="protocol"?protocols.get(route.slug):void 0;main2.innerHTML=detail?
protocolView(detail,{age:age(detail.protocol),back,usd:formatUsd,farm:farmAssumptions,diagnostics:evidence.
get(detail.protocol.slug),families,launchClock,clockShareAt:api2.clockShareAt}):`<h2>Page unavailabl\
e</h2><a href="${escapeHtml(back)}">Back to board</a>`}if(changedPage){window.scrollTo(0,0);main2.focus(
{preventScroll:true})}main2.dataset.ready=""}main2.addEventListener("click",event=>{if(!(event.target instanceof
Element))return;const sort=event.target.closest("button[data-sort]")?.dataset.sort;const route=parseRoute(
location.hash);if(route.page==="board"&&isSortKey(sort)){const{state}=route;const dir=state.sort===sort&&
state.dir==="asc"?"desc":"asc";location.hash=boardHash({...state,sort,dir})}else if(route.page==="ce\
nsus"&&(sort==="name"||sort==="status"||sort==="tvl")){const{state}=route;const dir=state.sort===sort&&
state.dir==="asc"?"desc":"asc";location.hash=censusHash({...state,sort,dir})}else if(!event.target.closest(
"a")&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){const link=event.target.closest(
"tr[data-protocol]")?.querySelector("a");if(link)location.hash=link.hash}});main2.addEventListener("\
submit",event=>event.preventDefault());main2.addEventListener("input",({target})=>{if(!(target instanceof
HTMLInputElement)||target.name!=="q")return;const route=parseRoute(location.hash);if(route.page!=="b\
oard")return;history.replaceState(null,"",boardHash({...route.state,q:target.value}));draw()});main2.
addEventListener("change",event=>{const target=event.target;const route=parseRoute(location.hash);if(route.
page==="census"&&target instanceof HTMLSelectElement&&target.name==="status"){location.hash=censusHash(
{...route.state,status:target.value});return}if(route.page!=="board")return;const{state}=route;if(target instanceof
HTMLSelectElement&&(target.name==="cat"||target.name==="chain")){location.hash=boardHash({...state,[target.
name]:target.value})}else if(target instanceof HTMLInputElement&&target.name==="wl"){location.hash=boardHash(
{...state,wl:target.checked})}});window.addEventListener("hashchange",draw);draw()}var main=element(
"main");var{RADAR_DATA:data,Radar:api}=window;var snapshot=data&&api.readPublishedSnapshot(data);if(data&&
snapshot){start(main,snapshot,data,api)}else{main.innerHTML="<h2>Snapshot data unavailable</h2><p>Ge\
nerate it with <code>pnpm radar</code>.</p>"}})();
