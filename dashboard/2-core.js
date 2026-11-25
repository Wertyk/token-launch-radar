(() => {
var ASSUMPTIONS_AS_OF="2026-11-14",defaults={asOf:ASSUMPTIONS_AS_OF,airdropShareOfLaunchCap:.25,farmerHaircut:.5,hourlyRateUsd:25,capitalApr:{
yieldBearing:0,nonYielding:.05},horizonMonths:12,monthsPerYear:12,weeksPerYear:52,minutesPerHour:60,depositsUsd:[1e3,5e3,1e4,25e3],tradeVolumeUsd:200,
tradingFeeRate:6e-4,setupMinutes:5,bridgeMinutes:10};function formatUsd(e){let t=Math.abs(e).toFixed(2).replace(/\.00$/,"");return`${e<0?"-":
""}$${t.replace(/\B(?=(\d{3})+(?:\.|$))/g,",")}`}function expectedHoldYears(e,t=1){if(e===0)return t;let a=-Math.log1p(-e);return-Math.expm1(
-a*t)/a}function farmEconomicsTerms(e,t,a,r,n=defaults){let l=e.totalMinutes/n.minutesPerHour,i=n.horizonMonths/n.monthsPerYear,{yieldBearing:s,
nonYielding:u}=n.capitalApr??defaults.capitalApr,o=e.capitalApr;o===defaults.capitalApr.yieldBearing?o=s:o===defaults.capitalApr.nonYielding&&
(o=u);let c=o*expectedHoldYears(r,i),f=t*n.airdropShareOfLaunchCap*r*n.farmerHaircut/a;return{cashFees:e.totalCostUsd,hours:l,horizonYears:i,
capitalCarry:c,k:f}}function estimateFarmEconomics(e,t,a,r,n=defaults){let l=farmEconomicsTerms(e,t,a,r,n),{cashFees:i,horizonYears:s,capitalCarry:u,
k:o}=l,c=f=>{let g=depositAmounts(l,f),{netUsd:d,netPerHourUsd:h}=g,p=d<=0?"SKIP":h>n.hourlyRateUsd?"FARM":"THIN";return{depositUsd:f,...g,verdict:p}};
return{launchProbability12:r,airdropYieldApr:o/s,deposits:defaults.depositsUsd.map(c),breakEvenDepositUsd:o>u?i/(o-u):"never"}}function depositAmounts({
cashFees:e,capitalCarry:t,hours:a,k:r},n){let l=r*n,i=t*n,s=e+i,u=l-e-i,o=u===0?0:u/a;return{expectedValueUsd:l,costUsd:s,netUsd:u,netPerHourUsd:o}}
//! Numeric kernels (weighted Cholesky least squares, Huber and logistic IRLS) ship in 5-extras.js.
var{compareText}=window.Radar?.support??{};var MIN_GROUP_CHANGES=10;function farmGroup(e,t){let a=e?.trim().toLowerCase()??"";return Object.
keys(t).find(r=>t[r]?.categories.includes(a))??"generic"}function farmExitThresholds(e,t){let a=e.flatMap(({protocol:i,status:s})=>{let{listed_at:u,
change_7d:o,slug:c,category:f}=i;return s==="pre-token"&&u!==null&&o!==null?[{change:o,slug:c,group:farmGroup(f,t)}]:[]}).sort((i,s)=>i.change-
s.change||compareText(i.slug,s.slug)),r=i=>i[Math.ceil(i.length/10)-1]?.change,n=r(a),l=n===void 0?null:{change:n,label:"pooled categories"};
return new Map(Object.entries(t).map(([i,{label:s}])=>{let u=a.filter(c=>c.group===i),o=u.length<MIN_GROUP_CHANGES?void 0:r(u);return[i,o===
void 0?l:{change:o,label:s}]}))}function roundUsd(e){return Math.round(e*100)/100}function formatEntryShare(e,t){let a=100*e/t,r=a.toPrecision(
2),[,n]=r.split("e"),l=Math.max(0,1-Number(n)),i=`${n&&l<=20?Number(r).toFixed(l):r}% of snapshot TVL`;if(a>=.001)return i;let s=Number((t/e).
toPrecision(2)),u=Math.min(4,Math.floor(Math.log10(s)/3));return`${i} (about 1 in ${s/1e3**u}${" KMBT"[u]} of TVL)`}function makeFarmPlan(e,{
playbooks:t,gas:a,funding:r,uncollateralized:n,checklist:l},{depositUsd:i=defaults.depositsUsd[0],launchProbability12:s=0,exitThreshold:u=null}={}){
if(!Number.isFinite(i)||i<=0)throw new Error("The farm plan needs a positive, finite deposit size.");let o=farmGroup(e.category,t),c=t[o]??t.
generic,f=e.category?.toLowerCase().includes("uncollateralized")?n:c,g=o==="bridge",d=expectedHoldYears(s),h=d*defaults.weeksPerYear,p={once:1,
"at launch":1,weekly:Math.floor(h),monthly:Math.floor(defaults.monthsPerYear*d)},T=p[c.cadence],[v,b,_]=c.transactions,m=(g?0:v)+b*T+_,O=o===
"derivatives"?defaults.tradeVolumeUsd*defaults.tradingFeeRate:0,E=y=>{let M=y!==null&&Object.hasOwn(a.chains,y)?a.chains[y]:void 0,[C,S]=M??
a.fallback,D=roundUsd(v*(g?S:C)),F=roundUsd(O+b*C),V=roundUsd(_*C),B=roundUsd(C),le=(g?0:roundUsd(S))+D+V,I=roundUsd(le+B*s),Y=roundUsd(F*T),
ie=roundUsd(I+Y);return{chain:y,transactionUsd:C,bridgeUsd:S,entryCost:D,reviewCost:F,exitCost:V,claimCost:B,oneTimeCostUsd:I,recurringCostUsd:Y,
totalCostUsd:ie,feeAssumed:M===void 0}},{chain:k,transactionUsd:x,bridgeUsd:z,entryCost:K,reviewCost:H,exitCost:G,claimCost:j,oneTimeCostUsd:q,
recurringCostUsd:X,totalCostUsd:W,feeAssumed:J}=e.chains.map(E).sort((y,M)=>y.totalCostUsd-M.totalCostUsd||compareText(y.chain??"",M.chain??
""))[0]??E(null),Q={deposit:formatUsd(i),chain:k??"a verified chain",gas:`about ${formatUsd((m+1)*x)} for gas`,share:formatEntryShare(i,e.tvl_usd)},
A=(y,M,C,S="once")=>({action:y.replace(/\{(\w+)\}/g,(D,F)=>Q[F]??""),chain:k,costUsd:roundUsd(M),minutes:C,cadence:S}),[Z,ee,te]=c.minutes,[
N,R,P,U]=l.minutes,w=g?null:A(r.bridge,z,defaults.bridgeMinutes),ae=A(f.review,H,ee,c.cadence),L=`TVL drops under ${formatUsd(e.tvl_usd/2)}`,
re=u?.change.toFixed(1).replace("-","\u2212"),ne=u?`Exit if 7-day TVL change falls below ${re}% (bottom tenth of ${u.label} in this snapshot\
) or ${L}.`:`Exit if ${L}. No listed pre-token 7-day TVL data.`,$=[A(k===null?r.unlisted:r.wallet,0,defaults.setupMinutes-N),A(l.eligibility,
0,N),A(c.sizing?.action??l.size,0,R+(c.sizing?.extraMinutes??0)),...w?[w]:[],A(f.enter,K,Z-R-U),ae,A(l.records,0,U),A(l.claim,j,P,"at launch"),
{...A(f.exit,G,te-P),exitCondition:`${ne} ${f.exitCondition}`}];return{chain:k,depositUsd:i,steps:$,fundingStep:w,exitThreshold:u,reviewCounts:p,
holdWeeks:h,flags:J?["fee-assumed"]:[],assumptionsAsOf:defaults.asOf,capitalApr:c.capitalApr,oneTimeCostUsd:q,recurringCostUsd:X,totalCostUsd:W,
totalMinutes:$.reduce((y,M)=>y+M.minutes*p[M.cadence],0)}}function familyKey({slug:e,gecko_id:t}){return t===null?`slug:${e}`:`gecko:${t}`}function groupFamilies(e){
let t=new Map;for(let a of[...e].sort((r,n)=>compareText(r.slug,n.slug))){let{tvl_usd:r,mcap_usd:n}=a,l=familyKey(a),i=n!==null&&n>0?n:null,
s=t.get(l);s?(s.members.push(a),s.tvl_usd+=r,s.mcap_usd??=i):t.set(l,{key:l,representative:a,members:[a],tvl_usd:r,mcap_usd:i})}return[...t.
values()]}var BRIDGE_PRODUCT="wrapped and bridged products are",STAKED_PRODUCT="staked products are",HOUSE_RULE=" (house rule).",EXCLUDED_CATEGORIES=new Map(
[["Bridge",BRIDGE_PRODUCT],["Canonical Bridge",BRIDGE_PRODUCT],["Liquid Staking",STAKED_PRODUCT],["Liquid Restaking",STAKED_PRODUCT],["Resta\
ked BTC",STAKED_PRODUCT],["CEX","exchange custody is"]]),VERSION_SUFFIX=/\s(?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)$/i,PRODUCT_WORD=/(?<![\p{L}\p{M}\p{N}_])(?:wrapped|staked|staking)(?![\p{L}\p{M}\p{N}_])/iu,
EXCHANGE_NAME=/^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)(?![\p{L}\p{M}\p{N}_])/iu;function tokenFields({gecko_id:e,symbol:t}){
return e!==null?t===null?"gecko_id":"gecko_id and symbol":t===null?null:"symbol"}function exclusionReason(e){let{category:t}=e,a=t===null?void 0:
EXCLUDED_CATEGORIES.get(t);if(a)return`${t} category: ${a} not ranked${HOUSE_RULE}`;let r=e.name.trim();if(VERSION_SUFFIX.test(r))return`Nam\
e ends in a version marker${HOUSE_RULE}`;let n=r.match(PRODUCT_WORD)?.[0];if(n!==void 0)return`Name contains \u201C${n}\u201D${HOUSE_RULE}`;
let l=r.match(EXCHANGE_NAME)?.[0];return l===void 0?null:`Name starts with the exchange name \u201C${l}\u201D${HOUSE_RULE}`}function classify(e,t=e.
mcap_usd){if(t!==null&&t>0)return{status:"traded",reason:"The family records a positive market cap."};let a=tokenFields(e);if(a!==null)return{
status:"token-unpriced",reason:`The protocol records a token via ${a} without a positive market cap.`};let r=exclusionReason(e);return r!==null?
{status:"excluded",reason:r}:{status:"pre-token",reason:"The protocol records no token."}}function buildCensus(e,t=groupFamilies(e)){let a=new Map(
t.map(({key:r,mcap_usd:n})=>[r,n]));return e.map(r=>{let n=familyKey(r);return{protocol:r,familyKey:n,...classify(r,a.get(n)??null)}})}function censusRecords(e){
return e.map(({protocol:{slug:t,name:a,category:r,tvl_usd:n},...l})=>({slug:t,name:a,category:r,tvl_usd:n,...l}))}function houseRuleMembership({
protocols:e,floor_usd:t,watchlist:a}){let r=new Set(a),n=new Set(e.filter(u=>u.tvl_usd>=t&&tokenFields(u)===null&&exclusionReason(u)===null).
map(({slug:u})=>u).sort(compareText)),l=[],i=[];for(let u of n)(r.has(u)?l:i).push(u);let s=[...r].filter(u=>!n.has(u)).sort(compareText);return{
truePositives:l,falsePositives:i,falseNegatives:s}}function boardEntries(e,t){let a=new Set(t),r=[];for(let n of e){let l=[];n.status==="pre\
-token"&&l.push("pre-token"),a.has(n.protocol.slug)&&l.push("watchlist"),l.length>0&&r.push({...n,boardReasons:l})}return r}function pava(e){
let t=[];for(let a of e)for(t.push({...a,size:1});t.length>1;){let r=t.at(-2),n=t.at(-1);if(!r||!n||r.recorded*n.count<=n.recorded*r.count)break;
r.count+=n.count,r.recorded+=n.recorded,r.size+=n.size,t.pop()}return t.flatMap(({count:a,recorded:r,size:n})=>Array(n).fill(r/a))}var YEAR_DAYS=365;
function fitAgeShares(e){let t=new Map;for(let{ageDays:n,label:l}of e){let i=Math.floor(n/YEAR_DAYS),s=t.get(i)??{count:0,recorded:0,ageSum:0};
s.count++,s.recorded+=l,s.ageSum+=n,t.set(i,s)}let a=[...t].sort(([n],[l])=>n-l).map(([,n])=>n),r=pava(a);return a.map(({ageSum:n,count:l},i)=>({
ageDays:n/l,share:r[i]??0,count:l}))}function tailHazard(e){for(let t=e.length-1;t>0;t--){let a=e[t-1],r=e[t];if(a&&r&&r.share>a.share)return Math.
log((1-a.share)/(1-r.share))/(r.ageDays-a.ageDays)}return-Math.log1p(-(e[0]?.share??0))/YEAR_DAYS}function shareAt(e,t){let a=e[0];if(!a)return 0;
if(t<=a.ageDays)return a.share;for(let r of e){if(t<=r.ageDays){let n=(t-a.ageDays)/(r.ageDays-a.ageDays);return a.share+n*(r.share-a.share)}
a=r}return a.share+(1-a.share)*-Math.expm1(-tailHazard(e)*(t-a.ageDays))}var{clamp,featureStats,median}=window.Radar?.support??{};function daysBetween(e,t){
return(Date.parse(t)-Date.parse(e))/864e5}var categories={dex:["dex","dexs","liquidity manager"],lending:["lending","uncollateralized lendin\
g","cdp","cdp manager","collateral markets"],staking:["liquid staking","staking pool","restaking","liquid restaking","restaked btc"],yield:[
"yield","yield aggregator","leveraged farming","farm"],derivatives:["derivatives","interest rate derivatives","basis trading","options","opt\
ions vault"],rwa:["rwa"],bridge:["bridge","canonical bridge","cross chain bridge"],other:[]};function categoryGroup(e){let t=e?.trim().toLowerCase()??
"";for(let[a,r]of Object.entries(categories))if(r.includes(t))return a;return"other"}function categoryTotals(){return Object.fromEntries(Object.
keys(categories).map(e=>[e,0]))}function groupComparableCategories(e,t){let a=new Map(t.map(({key:r,representative:n})=>[r,categoryGroup(n.category)]));
return e.map(r=>({...r,category:a.get(r.familyKey)??"other"}))}function logAge(e,t){return Math.log(Math.max(1,daysBetween(e,t)))}function logMomentum(e){
return e===null?0:Math.log1p(clamp(e,-50,100)/100)}function comparablesFromFamilies(e,t){return e.flatMap(({key:a,representative:r,tvl_usd:n,
mcap_usd:l})=>{let{slug:i,listed_at:s,change_7d:u}=r;return exclusionReason(r)!==null||l===null?[]:[{slug:i,familyKey:a,listedAt:s,lnTvl:Math.
log(n),lnAge:s===null?null:logAge(s,t),growth:logMomentum(u),target:Math.log(l)}]})}var{fitLogistic,linearScore,sigmoid}=window.Radar?.support??
{};var ODDS_CANDIDATES=["lnTvl","growth","lnChains","categoryShare"],LOGISTIC_PENALTY=1,PRIOR_STRENGTH=20;function protocolFeatures(e,t){return{
ageDays:t,lnTvl:Math.log(e.tvl_usd),growth:logMomentum(e.change_7d),lnChains:Math.log(Math.max(1,e.chains.length)),category:categoryGroup(e.
category)}}function oddsPopulation(e,t){return e.flatMap(({protocol:a,status:r})=>{let{slug:n,listed_at:l}=a;return exclusionReason(a)!==null?
[]:[{...protocolFeatures(a,l===null?null:Math.max(0,daysBetween(l,t))),slug:n,familyKey:n,listedAt:l,label:+(r==="traded"||r==="token-unpric\
ed")}]}).sort((a,r)=>compareText(a.slug,r.slug))}function baseRate(e){return e.reduce((t,{label:a})=>t+a,0)/e.length}function categoryTokenShares(e,t=PRIOR_STRENGTH){
let a=categoryTotals(),r=categoryTotals();for(let{category:l,label:i}of e)a[l]++,r[l]+=i;let n=baseRate(e);for(let l of Object.keys(a))r[l]=
(r[l]+t*n)/(a[l]+t);return r}function oddsFeatures(e,t,a,r,n=0){return[clockLogit(r,e.ageDays??n),...t.map(l=>l==="categoryShare"?a[e.category]:
e[l])]}function clockLogit(e,t){let a=clamp(shareAt(e,t),.01,.99);return Math.log(a/(1-a))}function fitOddsClock(e){let t=e.flatMap(({ageDays:a,
slug:r,label:n})=>a===null?[]:[{ageDays:a,slug:r,label:n}]);return{clock:t.length?fitAgeShares(t):[{ageDays:0,share:baseRate(e),count:e.length}],
medianAgeDays:median(t.map(({slug:a,ageDays:r})=>({slug:a,value:r})))??0,maxAgeDays:t.reduce((a,{ageDays:r})=>Math.max(a,r),0)}}function fitOddsModel(e,t){
let a=categoryTokenShares(e),r=fitOddsClock(e),n=fitLogistic(e.map(l=>oddsFeatures(l,t,a,r.clock,r.medianAgeDays)),e.map(({label:l})=>l),LOGISTIC_PENALTY);
return{...r,terms:t,coefficients:n,shares:a,n:e.length}}function checkClockCoefficient(e=0){if(!(e>0))throw new Error("Token-status clock co\
efficient \u03B3 must be positive.")}function launchProbability12(e,t,a,r){return checkClockCoefficient(r),conditionalProbability(e,t,a,r)}function conditionalProbability(e,t,a,r){
let n=clockLogit(e,t+YEAR_DAYS),l=r*(n-clockLogit(e,t));return l===0?-Math.expm1(-tailHazard(e)*YEAR_DAYS):clamp(sigmoid(a+r*n)*-Math.expm1(
-l),0,1)}function protocolOdds(e,t,a,r=launchProbability12){let n=t.listed_at===null?e.medianAgeDays:Math.max(0,daysBetween(t.listed_at,a)),
{clock:l,coefficients:i,shares:s,terms:u}=e,o=oddsFeatures(protocolFeatures(t,n),u,s,l);o[0]=0;let c=linearScore(o,i),f=i[1]??0,g=d=>r(l,d,c,
f);return{oddsAge:n,oddsAt:g,launchProbability12:g(n)}}function bootstrapProbability12(e,t,a,r){return conditionalProbability(e,t,a,Math.max(
0,r))}function mulberry32(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let a=Math.imul(t^t>>>15,t|1);return a^=a+Math.imul(a^a>>>7,a|61),((a^
a>>>14)>>>0)/2**32}}function selectTerms(e,t){let a=[],r=[],n=t(a);for(;a.length<e.length;){let l=e.filter(u=>!a.includes(u)).map(u=>({term:u,
scores:t([...a,u]),kept:false})),i,s=0;for(let u of l){let o=n.map((f,g)=>{let d=u.scores[g];return f===null||d==null?0:f-d}),c=o.reduce((f,g)=>f+
g,0);o.every(f=>f>0)&&c>s&&(i=u,s=c)}if(r.push({baseline:n,trials:l}),!i)break;i.kept=true,a.push(i.term),n=i.scores}return{terms:a,steps:r,
scores:n}}var FOLD_COUNT=5,FOLD_SEED=10772;function bySlug(e,t){return compareText(e.slug,t.slug)}function seededFolds(e,t=FOLD_COUNT){let a=[
...e].sort(bySlug),r=[...new Set(a.map(({familyKey:s})=>s))],n=mulberry32(FOLD_SEED),l=new Map;for(;r.length>0;){let s=Math.floor(n()*r.length);
l.set(r[s],l.size%t);let u=r.pop();s<r.length&&(r[s]=u)}let i=Array.from({length:t},()=>[]);for(let s of a)i[l.get(s.familyKey)??-1]?.push(s);
return i}function splitFolds(e){return e.map((t,a)=>({train:e.flatMap((r,n)=>a===n?[]:r).sort(bySlug),test:t}))}function walkForwardSplit(e){
let t=e.filter(i=>i.listedAt!==null).sort((i,s)=>compareText(i.listedAt,s.listedAt)||bySlug(i,s)),a=Math.floor(t.length*.6),r=t[a-1]?.listedAt,
n=t.slice(a).filter(({listedAt:i})=>i!==r),l=new Set(n.map(({familyKey:i})=>i));return{train:t.filter(i=>!l.has(i.familyKey)).sort(bySlug),test:n}}
function matchesPredictions(e,t,a,r=false){return Array.isArray(e)&&e.length===t.length&&t.every((n,l)=>{let i=e[l],s=a(n);return i?.slug===
n.slug&&Number.isFinite(i.actual)&&(r?i.actual===s:Math.abs(i.actual-s)<=1e-9*Math.max(1,Math.abs(s)))&&Number.isFinite(i.predicted)&&(!r||i.
predicted>=0&&i.predicted<=1)})}function medianLogError(e){return median(e.map(({slug:t,actual:a,predicted:r})=>({slug:t,value:Math.abs(a-r)})))}
function ranks(e,t){let a=[...e].sort((l,i)=>l[t]-i[t]||compareText(l.slug,i.slug)),r=new Map,n=0;for(;n<a.length;){let l=n+1;for(;l<a.length&&
a[l]?.[t]===a[n]?.[t];)l++;for(let i of a.slice(n,l))r.set(i.slug,(n+1+l)/2);n=l}return r}function scorePredictions(e){let t=e.length,a=medianLogError(
e),r=ranks(e,"actual"),n=ranks(e,"predicted"),l=(t+1)/2,i=0,s=0,u=0;for(let{slug:c}of e){let f=(r.get(c)??l)-l,g=(n.get(c)??l)-l;i+=f*g,s+=f**
2,u+=g**2}let o=Math.sqrt(s*u);return{n:t,medianMultiplier:a===void 0?null:Math.exp(a),spearman:o===0?null:clamp(i/o,-1,1)}}function meanBrier(e){
return e.length?e.reduce((t,{actual:a,predicted:r})=>t+(a-r)**2,0)/e.length:null}function oddsValidationFolds(e){return[splitFolds(seededFolds(
e,10)),[walkForwardSplit(e)]]}function predictOddsFolds(e,t){return e.map(a=>a.map(({train:r,test:n})=>{if(!r.length||!n.length)return[];let l=t(
r);return n.map(i=>({slug:i.slug,actual:i.label,predicted:l(i)}))}))}function scoreOddsFolds(e){return e.map(t=>meanBrier(t.flat()))}function scoreOdds(e,t){
return scoreOddsFolds(predictOddsFolds(e,t))}function statusPredictor(e,t){let{shares:a,clock:r,coefficients:n,medianAgeDays:l}=fitOddsModel(
e,t);return i=>sigmoid(linearScore(oddsFeatures(i,t,a,r,l),n))}function selectOddsTerms(e,t=oddsValidationFolds(e)){return selectTerms(ODDS_CANDIDATES,
a=>scoreOdds(t,r=>statusPredictor(r,a)))}var oddsKeys=["model","baseRate","pava","clockOnly"];function oddsScores(e){return{scores:scoreOddsFolds(
e.model),baselines:{baseRate:scoreOddsFolds(e.baseRate),pava:scoreOddsFolds(e.pava),clockOnly:scoreOddsFolds(e.clockOnly)}}}function scoreOddsEvidence(e,t){
let a=oddsValidationFolds(e);for(let r of oddsKeys){let n=t?.[r];if(!Array.isArray(n)||n.length!==a.length)return null;for(let[l,i]of a.entries()){
let s=n[l];if(!Array.isArray(s)||s.length!==i.length)return null;for(let[u,{train:o,test:c}]of i.entries())if(!matchesPredictions(s[u],o.length?
c:[],f=>f.label,true))return null}}return oddsScores(t)}var PLACEBO_SEED=10675;function growthPlacebo(e,t,a){let r=mulberry32(PLACEBO_SEED),
n=oddsValidationFolds(e),l=o=>statusPredictor(o,t),i=scoreOdds(n,l),s=i.map(()=>0),u=new Map(e.map(({slug:o},c)=>[o,c]));for(let o=0;o<a;o++){
let c=e.map(d=>d.growth);for(let d=c.length-1;d>0;d--){let h=Math.floor(r()*(d+1)),p=c[d];c[d]=c[h],c[h]=p}let f=d=>({...d,growth:c[u.get(d.
slug)??-1]??d.growth}),g=n.map(d=>d.map(({train:h,test:p})=>({train:h.map(f),test:p.map(f)})));scoreOdds(g,l).forEach((d,h)=>{let p=i[h];d!==
null&&p!=null&&d<=p&&(s[h]=(s[h]??0)+1)})}return{shuffles:a,seed:PLACEBO_SEED,real:i,asGoodOrBetter:i.map((o,c)=>o===null?null:(s[c]??0)/a)}}
var{fitHuber}=window.Radar?.support??{};var{diagonalPenalty}=window.Radar?.support??{};//! Ridge uses unit weights.
function fitRidge(e,t,a,r=[]){let n=diagonalPenalty(r.length+3,t);for(let[s,u]of r.entries())n[s+1]=[0,...u.slice(0,s+1)];let l=e.map(({group:s,
tvl:u,age:o})=>[1,...r.map((c,f)=>+(s===f+1)),u,o]),i=e.map(({target:s})=>s);return fitHuber(l,i,n,a,(s,u)=>{let[,[,o=0]=[],[,c=0,f=0]=[]]=s;
s.length===3&&n[2]?.[2]===0&&o>0&&f>0&&c**2>=(1-8*Number.EPSILON)*o*f&&(s[2]=[0,0,1],u[2]=0);for(let[g,d]of s.entries())g>=s.length-2&&d[g]===
0&&(d[g]=1)})}var FITTED_KEYS=["lnTvl","lnAge"];function valueFeatures(e,t,a){let r=[];return e.change_7d===null&&r.push("growth-missing"),e.
listed_at===null&&r.push("age-missing"),{features:{lnTvl:Math.log(e.tvl_usd),lnAge:e.listed_at===null?a:logAge(e.listed_at,t),growth:logMomentum(
e.change_7d)},flags:r}}function prepareFit(e,t){let a=e.length;if(a===0)throw new Error("The value model needs at least one traded comparabl\
e.");let r=median(e.flatMap(({slug:o,lnAge:c})=>c===null?[]:[{slug:o,value:c}]))??0,n=featureStats(e.map(({lnTvl:o})=>o)),l=featureStats(e.map(
({lnAge:o})=>o??r)),i=e.reduce((o,c)=>o+c.target,0)/a,s=t==="tvl"?0:n.scale,u=t==="age"?0:l.scale;return{design:e.map(o=>({target:o.target-i,
tvl:s?(o.lnTvl-n.mean)/s:0,age:u?((o.lnAge??r)-l.mean)/u:0})),targetMean:i,tvlScale:s,ageScale:u,metadata:{n:a,medianLnAge:r,featureMeans:{lnTvl:n.
mean,lnAge:l.mean},featureRanges:{lnTvl:n.range,lnAge:l.range}}}}function restoreCoefficients({targetMean:e,tvlScale:t,ageScale:a,metadata:{
featureMeans:r}},n,l,i){let s=t?l/t:0,u=a?i/a:0;return{intercept:e+n-s*r.lnTvl-u*r.lnAge,lnTvl:s,lnAge:u}}function fitValueModel(e,t,{drop:a,
robust:r=true,momentum:n=true}={},l){let i=prepareFit(e,a),s=l?i.design.map((d,h)=>({...d,group:l.groupBySlug[e[h]?.slug??""]??0})):i.design,
{coefficients:u,huberScale:o}=fitRidge(s,t,r,l?.penalty),c=l?.groups.length??1,f=l?.contrastShares.reduce((d,h,p)=>d+h*(u[p+1]??0),0)??0,g=l&&
categoryTotals();return l?.groups.forEach((d,h)=>{g&&(g[d]=(h?u[h]??0:0)-f)}),{...i.metadata,lambda:t,momentum:n,huberScale:o,coefficients:restoreCoefficients(
i,(u[0]??0)+f,u[c]??0,u[c+1]??0),...g&&{categoryEffects:g}}}function logValue({lnTvl:e,growth:t,lnAge:a,category:r},{coefficients:n,momentum:l=true,
categoryEffects:i}){return n.intercept+n.lnTvl*(e+(l?t:0))+n.lnAge*a+(i?.[r??"other"]??0)}function predictValue(e,t,a){let r=valueFeatures(e,
t,a.medianLnAge),{featureMeans:n,featureRanges:l,coefficients:i}=a,{features:s}=r;a.categoryEffects&&(s.category=categoryGroup(e.category)),
FITTED_KEYS.some(d=>{let{min:h,max:p}=l[d];return s[d]<h||s[d]>p})&&r.flags.push("outside-comps-range");let{intercept:u,lnTvl:o,lnAge:c}=i,f=u+
o*n.lnTvl+c*n.lnAge,g=Math.exp(logValue(s,a));return{...r,valueUsd:g,launch_value_usd:clamp(Math.round(g),1,1e14),decomposition:{base:Math.exp(
f),multipliers:{lnTvl:Math.exp(o*(s.lnTvl-n.lnTvl)),growth:Math.exp(o*(a.momentum===false?0:s.growth)),lnAge:Math.exp(c*(s.lnAge-n.lnAge)),...a.
categoryEffects&&{category:Math.exp(a.categoryEffects[s.category??"other"])}}}}}function rankBoard(e,t,a){return e.map(r=>{let n=predictValue(
r.protocol,t,a);return{...r,...n,implied_value_usd:Math.max(1,Math.round(n.launch_value_usd*r.launchProbability12))}}).sort((r,n)=>n.implied_value_usd-
r.implied_value_usd||compareText(r.protocol.slug,n.protocol.slug)).map((r,n)=>({...r,rank:n+1}))}function inputEffectContrasts(e,t,a,r){let n=protocolOdds(
r,e,t),l=predictValue(e,t,a),i=n.launchProbability12,s=(f,g,d)=>{let h=l.features,p=f.features,{lnTvl:T,lnAge:v}=a.coefficients,b=a.momentum?
p.growth-h.growth:0,_=d===void 0?-1:r.terms.indexOf(d),m=d===void 0?g:i;if(d!==void 0&&_>=0){let[O,...E]=r.coefficients,k=(E[_+1]??NaN)*(p[d]-
h[d]);m=protocolOdds({...r,coefficients:[(O??NaN)+k,...E]},e,t).launchProbability12}return[(f.valueUsd*g/(l.valueUsd*i)-1)*100,100*Math.expm1(
T*(p.lnTvl-h.lnTvl+b)+v*(p.lnAge-h.lnAge)+Math.log(m/i))]},u=(f,g)=>s(predictValue(f,t,a),protocolOdds(r,f,t).launchProbability12,g),o=new Date(
Date.parse(t)+YEAR_DAYS*864e5).toISOString(),c=e.listed_at===null&&a.coefficients.lnAge?{...a,medianLnAge:Math.log(Math.exp(a.medianLnAge)+YEAR_DAYS)}:
a;return[u({...e,tvl_usd:e.tvl_usd*1.1},"lnTvl"),u({...e,change_7d:(e.change_7d??0)+10},"growth"),s(predictValue(e,o,c),n.oddsAt(n.oddsAge+YEAR_DAYS))]}
function impliedValueEffects(e,t,a,r){let[n,l,i]=inputEffectContrasts(e,t,a,r);return[n[0],l[0],i[0]]}function coefficientEffects(e,t,a,r){let[
n,l,i]=inputEffectContrasts(e,t,a,r);return[n[1],l[1],i[1]]}function summarizeEffects(e){return[0,1,2].map(t=>{let a=[...e];if(a.some(([,l])=>!Number.
isFinite(l[t])))return[NaN,NaN,NaN];a.sort(([l,i],[s,u])=>i[t]-u[t]||compareText(l,s));let r=a.length,n=l=>a[l]?.[1][t]??NaN;return[(n(Math.
floor((r-1)/2))+n(Math.floor(r/2)))/2,n(Math.ceil(.1*r)-1),n(Math.ceil(.9*r)-1)]})}var VALUE_CANDIDATES=["momentum","age","category"];function predictionsFor(e,t){
return e.map(a=>({slug:a.slug,actual:a.target,predicted:t(a)}))}function modelPredictions(e,t){return predictionsFor(e,a=>predictComparable(
a,t))}function predictComparable(e,t){let{lnTvl:a,growth:r,lnAge:n}=e,l=e.category;return logValue({lnTvl:a,growth:r,lnAge:n??t.medianLnAge,
category:l??"other"},t)}function valueOptions(e){return{...!e.includes("age")&&{drop:"age"},momentum:e.includes("momentum")}}function categoryDesign(e,t){
let a=categoryTotals();for(let{category:i}of e)a[i]++;let r=Object.keys(a).filter(i=>a[i]>0),n=r.map(i=>a[i]/e.length),l=n.slice(1);return{groups:r,
groupBySlug:Object.fromEntries(e.map(({slug:i,category:s})=>[i,r.indexOf(s)])),contrastShares:l,penalty:l.map((i,s)=>l.map((u,o)=>t*((s===o?
1:0)+n.length*i*u-i-u)))}}var VALUE_RIDGE_LAMBDA=.01,VALUE_CATEGORY_PENALTY=64;function refitValue(e,t){let a=t.includes("category")?categoryDesign(
e,VALUE_CATEGORY_PENALTY):void 0;return fitValueModel(e,VALUE_RIDGE_LAMBDA,valueOptions(t),a)}var TAIL_ALPHA=.1,MIN_BAND_FAMILIES=Math.ceil(
1/TAIL_ALPHA);function rangeHonesty(e){let t=(a,r,n)=>{let l=0,i=0;for(let s of e){let u=s[a],o=s[r];u===null||o===null||!Number.isFinite(u)||
!Number.isFinite(o)||u>o||(i++,u<=s.actual&&s.actual<=o&&l++)}return{stated:n,covered:l,n:i}};return{middle:t("p25","p75",.5),broad:t("p10",
"p90",.8)}}function predictValueTrial({train:e,test:t},a){return e.length&&t.length?modelPredictions(t,refitValue(e,a)):[]}function selectValueTerms(e){
let t=[splitFolds(e.map(a=>[a])),[walkForwardSplit(e)]];return selectTerms(VALUE_CANDIDATES,a=>t.map(r=>medianLogError(r.flatMap(n=>predictValueTrial(
n,a)))??null))}var schemes=["leaveOneFamilyOut","seededFiveFold","walkForward"],models=["model","flatMultiple","categoryMultiple"];function scoreValueFolds(e){
return{model:scorePredictions(e.flatMap(({model:t})=>t)),flatMultiple:scorePredictions(e.flatMap(({flatMultiple:t})=>t)),categoryMultiple:scorePredictions(
e.flatMap(({categoryMultiple:t})=>t))}}function valueValidationFolds(e){return{leaveOneFamilyOut:splitFolds(e.map(t=>[t])),seededFiveFold:splitFolds(
seededFolds(e)),walkForward:[walkForwardSplit(e)]}}function scoreValueEvidence(e,t){let a=valueValidationFolds(e);for(let r of schemes){let n=t?.[r];
if(!Array.isArray(n)||n.length!==a[r].length)return null;for(let[l,{train:i,test:s}]of a[r].entries())if(!models.every(u=>matchesPredictions(
n[l]?.[u],i.length?s:[],o=>o.target)))return null}return{leaveOneFamilyOut:scoreValueFolds(t.leaveOneFamilyOut),seededFiveFold:scoreValueFolds(
t.seededFiveFold),walkForward:scoreValueFolds(t.walkForward)}}function resample(e,t){return e.map(()=>e[Math.floor(t()*e.length)])}function bootstrapSummary(e){
let t=e.length,a=new Map;for(let{ranked:l}of e)l.forEach((i,s)=>{let u=a.get(i)??[];u.push(s+1),a.set(i,u)});let r=new Map([...a].map(([l,i])=>(i.
sort((s,u)=>s-u),[l,{rank_p10:i[Math.ceil(.1*t)-1],rank_p90:i[Math.ceil(.9*t)-1]}]))),n=(e[0]?.coefficients??[]).map((l,i)=>{let s=e.map(({coefficients:o})=>o[i]);
if(t<2||!s.every(Number.isFinite))return null;let u=s.reduce((o,c)=>o+c,0)/t;return Math.sqrt(s.reduce((o,c)=>o+(c-u)**2,0)/(t-1))});return{
ranks:r,standardErrors:n}}var EVIDENCE_REPLICATES=200,BOOTSTRAP_SEEDS=[10673,10674];function bootstrapRadar(e,t,a,r,n,l,i,s=EVIDENCE_REPLICATES){
let[u,o]=BOOTSTRAP_SEEDS,c=mulberry32(u),f=mulberry32(o),g=Object.keys(r.coefficients),d=Object.keys(r.categoryEffects??{}),{ranks:h,standardErrors:p}=bootstrapSummary(
Array.from({length:s},()=>{let v=refitValue(resample(t,c),n),b=fitOddsModel(resample(a,f),l.terms),_=e.map(({protocol:m,status:O,boardReasons:E,
reason:k,familyKey:x})=>({protocol:m,status:O,boardReasons:E,reason:k,familyKey:x,launchProbability12:protocolOdds(b,m,i,bootstrapProbability12).
launchProbability12}));return{ranked:rankBoard(_,i,v).map(({protocol:m})=>m.slug),coefficients:[...g.map(m=>v.coefficients[m]),...d.map(m=>v.
categoryEffects?.[m]??0),...b.coefficients]}})),T=g.length+d.length;return{ranks:h,replicates:s,seeds:BOOTSTRAP_SEEDS,valueErrors:Object.fromEntries(
[...g,...d].map((v,b)=>[v,p[b]??null])),oddsErrors:p.slice(T)}}function radarInputs({protocols:e,as_of:t}){let a=groupFamilies(e),r=buildCensus(
e,a),n=groupComparableCategories(comparablesFromFamilies(a,t),a);return{families:a,entries:r,comparables:n,population:oddsPopulation(r,t)}}function rankRadar({
watchlist:e,as_of:t},a,r,n,l){checkClockCoefficient(n.coefficients[1]);let i=boardEntries(a,e).map(u=>({...u,...protocolOdds(n,u.protocol,t)})),
s=farmExitThresholds(a,l.playbooks);return rankBoard(i,t,r).map(u=>{let{protocol:o,launch_value_usd:c,launchProbability12:f}=u,g=makeFarmPlan(
o,l,{launchProbability12:f,exitThreshold:s.get(farmGroup(o.category,l.playbooks))??null});return{...u,plan:g,economics:estimateFarmEconomics(
g,c,o.tvl_usd,f)}})}function recomputeRadar(e,{terms:t},a,r){let{families:n,entries:l,comparables:i,population:s}=radarInputs(e),u=refitValue(
i,t),o=fitOddsModel(s,a);return{model:u,odds:o,board:rankRadar(e,l,u,o,r),families:n,comparables:i,population:s,census:censusRecords(l),houseRule:houseRuleMembership(
e)}}function readPublishedSnapshot({meta:e,protocols:t,watchlist:a}){if(!Array.isArray(t)||!Array.isArray(a)||t.length!==e?.protocolCount)return null;
let{as_of:r,floor_usd:n,source:l}=e;return{as_of:r,floor_usd:n,source:l,protocols:t,watchlist:a}}function reproduceSelection({comparables:e,
population:t}){return{value:selectValueTerms(e),odds:selectOddsTerms(t)}}function reproduceDiagnostics({board:e,comparables:t,population:a,model:r,
odds:n},l,i){return{bootstrap:bootstrapRadar(e,t,a,r,l,n,i),placebo:growthPlacebo(a,n.terms,EVIDENCE_REPLICATES)}}var browserApi={coefficientEffects,
impliedValueEffects,summarizeEffects,rangeHonesty,reproduceSelection,scoreValueEvidence,scoreOddsEvidence,reproduceDiagnostics,MIN_BAND_FAMILIES,
depositAmounts,farmEconomicsTerms,makeFarmPlan,farmAssumptions:defaults,estimateFarmEconomics,formatUsd,compareText,daysBetween,logValue,buildRadar:recomputeRadar,
readPublishedSnapshot};Object.assign(window.Radar??={},browserApi);
})();
