(() => {
var ASSUMPTIONS_AS_OF="2026-11-14",defaults={asOf:ASSUMPTIONS_AS_OF,airdropShareOfLaunchCap:.25,farmerHaircut:.5,hourlyRateUsd:25,capitalApr:{
yieldBearing:0,nonYielding:.05},horizonMonths:12,monthsPerYear:12,weeksPerYear:52,minutesPerHour:60,depositsUsd:[1e3,5e3,1e4,25e3],tradeVolumeUsd:200,
tradingFeeRate:6e-4,setupMinutes:5,bridgeMinutes:10};function formatUsd(e){let t=Math.abs(e).toFixed(2).replace(/\.00$/,"");return`${e<0?"-":
""}$${t.replace(/\B(?=(\d{3})+(?:\.|$))/g,",")}`}function expectedHoldYears(e,t=1){if(e===0)return t;let a=-Math.log1p(-e);return-Math.expm1(
-a*t)/a}function farmEconomicsTerms(e,t,a,r,n=defaults){let l=e.totalMinutes/n.minutesPerHour,i=n.horizonMonths/n.monthsPerYear,{yieldBearing:s,
nonYielding:u}=n.capitalApr??defaults.capitalApr,o=e.capitalApr;o===defaults.capitalApr.yieldBearing?o=s:o===defaults.capitalApr.nonYielding&&
(o=u);let d=o*expectedHoldYears(r,i),c=t*n.airdropShareOfLaunchCap*r*n.farmerHaircut/a;return{cashFees:e.totalCostUsd,hours:l,horizonYears:i,
capitalCarry:d,k:c}}function estimateFarmEconomics(e,t,a,r,n=defaults){let l=farmEconomicsTerms(e,t,a,r,n),{cashFees:i,horizonYears:s,capitalCarry:u,
k:o}=l,d=c=>{let g=depositAmounts(l,c),{netUsd:f,netPerHourUsd:p}=g,h=f<=0?"SKIP":p>n.hourlyRateUsd?"FARM":"THIN";return{depositUsd:c,...g,verdict:h}};
return{launchProbability12:r,airdropYieldApr:o/s,deposits:defaults.depositsUsd.map(d),breakEvenDepositUsd:o>u?i/(o-u):"never"}}function depositAmounts({
cashFees:e,capitalCarry:t,hours:a,k:r},n){let l=r*n,i=t*n,s=e+i,u=l-e-i,o=u===0?0:u/a;return{expectedValueUsd:l,costUsd:s,netUsd:u,netPerHourUsd:o}}
//! Numeric kernels (weighted Cholesky least squares, Huber and logistic IRLS) ship in 5-extras.js.
var{compareText}=window.Radar?.support??{};var MIN_GROUP_CHANGES=10,farmCategories={lending:["lending","uncollateralized lending","collatera\
l markets"],cdp:["cdp","cdp manager"],dex:["dex","dexs","liquidity manager"],derivatives:["derivatives","interest rate derivatives","basis t\
rading","options","options vault","perps"],yield:["yield","yield aggregator","leveraged farming","farm","risk curators"],allocator:["onchain\
 capital allocator"],staking:["liquid staking","staking pool","restaking","liquid restaking","restaked btc","staking"],rwa:["rwa"],stablecoin:[
"stablecoin","dual-token stablecoin","stablecoin wrapper"],prediction:["prediction market","prediction markets"],bridge:["bridge","canonical\
 bridge","cross chain bridge"]};function farmGroup(e){let t=e?.trim().toLowerCase()??"";return Object.entries(farmCategories).find(([,a])=>a.
includes(t))?.[0]??"generic"}function farmExitThresholds(e,t){let a=e.flatMap(({protocol:i,status:s})=>{let{listed_at:u,change_7d:o,slug:d,category:c}=i;
return s==="pre-token"&&u!==null&&o!==null?[{change:o,slug:d,group:farmGroup(c)}]:[]}).sort((i,s)=>i.change-s.change||compareText(i.slug,s.slug)),
r=i=>i[Math.ceil(i.length/10)-1]?.change,n=r(a),l=n===void 0?null:{change:n,label:"pooled categories"};return new Map(Object.entries(t).map(
([i,{label:s}])=>{let u=a.filter(d=>d.group===i),o=u.length<MIN_GROUP_CHANGES?void 0:r(u);return[i,o===void 0?l:{change:o,label:s}]}))}function roundUsd(e){
return Math.round(e*100)/100}function farmCapitalApr(e){let t=["lending","dex","yield","allocator","staking","rwa"].includes(e);return defaults.
capitalApr[t?"yieldBearing":"nonYielding"]}function formatEntryShare(e,t){let a=100*e/t,r=a.toPrecision(2),[,n]=r.split("e"),l=Math.max(0,1-
Number(n)),i=`${n&&l<=20?Number(r).toFixed(l):r}% of snapshot TVL`;if(a>=.001)return i;let s=Number((t/e).toPrecision(2)),u=Math.min(4,Math.
floor(Math.log10(s)/3));return`${i} (about 1 in ${s/1e3**u}${" KMBT"[u]} of TVL)`}function makeFarmPlan(e,{playbooks:t,gas:a,funding:r,uncollateralized:n,
checklist:l},{depositUsd:i=defaults.depositsUsd[0],launchProbability12:s=0,exitThreshold:u=null}={}){if(!Number.isFinite(i)||i<=0)throw new Error(
"The farm plan needs a positive, finite deposit size.");let o=farmGroup(e.category),d=t[o]??t.generic,c=e.category?.toLowerCase().includes("\
uncollateralized")?n:d,g=o==="bridge",f=expectedHoldYears(s),p=f*defaults.weeksPerYear,h={once:1,"at launch":1,weekly:Math.floor(p),monthly:Math.
floor(defaults.monthsPerYear*f)},y=h[d.cadence],[b,m,v]=d.transactions,E=(g?0:b)+m*y+v,M=o==="derivatives"?defaults.tradeVolumeUsd*defaults.
tradingFeeRate:0,C=A=>{let k=A!==null&&Object.hasOwn(a.chains,A)?a.chains[A]:void 0,[x,O]=k??a.fallback,D=roundUsd(b*(g?O:x)),S=roundUsd(M+m*
x),V=roundUsd(v*x),I=roundUsd(x),le=(g?0:roundUsd(O))+D+V,K=roundUsd(le+I*s),Y=roundUsd(S*y),ie=roundUsd(K+Y);return{chain:A,transactionUsd:x,
bridgeUsd:O,entryCost:D,reviewCost:S,exitCost:V,claimCost:I,oneTimeCostUsd:K,recurringCostUsd:Y,totalCostUsd:ie,feeAssumed:k===void 0}},{chain:T,
transactionUsd:w,bridgeUsd:F,entryCost:z,reviewCost:H,exitCost:j,claimCost:G,oneTimeCostUsd:q,recurringCostUsd:X,totalCostUsd:W,feeAssumed:J}=e.
chains.map(C).sort((A,k)=>A.totalCostUsd-k.totalCostUsd||compareText(A.chain??"",k.chain??""))[0]??C(null),Q={deposit:formatUsd(i),chain:T??
"a verified chain",gas:`about ${formatUsd((E+1)*w)} for gas`,share:formatEntryShare(i,e.tvl_usd)},_=(A,k,x,O="once")=>({action:A.replace(/\{(\w+)\}/g,
(D,S)=>Q[S]??""),chain:T,costUsd:roundUsd(k),minutes:x,cadence:O}),[Z,ee,te]=d.minutes,[N,P,U,L]=l.minutes,R=g?null:_(r.bridge,F,defaults.bridgeMinutes),
ae=_(c.review,H,ee,d.cadence),B=`TVL drops under ${formatUsd(e.tvl_usd/2)}`,re=u?.change.toFixed(1).replace("-","\u2212"),ne=u?`Exit if 7-da\
y TVL change falls below ${re}% (bottom tenth of ${u.label} in this snapshot) or ${B}.`:`Exit if ${B}. No listed pre-token 7-day TVL data.`,
$=[_(T===null?r.unlisted:r.wallet,0,defaults.setupMinutes-N),_(l.eligibility,0,N),_(d.sizing?.action??l.size,0,P+(d.sizing?.extraMinutes??0)),
...R?[R]:[],_(c.enter,z,Z-P-L),ae,_(l.records,0,L),_(l.claim,G,U,"at launch"),{..._(c.exit,j,te-U),exitCondition:`${ne} ${c.exitCondition}`}];
return{chain:T,depositUsd:i,steps:$,fundingStep:R,exitThreshold:u,reviewCounts:h,holdWeeks:p,flags:J?["fee-assumed"]:[],assumptionsAsOf:defaults.
asOf,capitalApr:farmCapitalApr(o),oneTimeCostUsd:q,recurringCostUsd:X,totalCostUsd:W,totalMinutes:$.reduce((A,k)=>A+k.minutes*h[k.cadence],0)}}
function familyKey({slug:e,gecko_id:t}){return t===null?`slug:${e}`:`gecko:${t}`}function groupFamilies(e){let t=new Map;for(let a of[...e].
sort((r,n)=>compareText(r.slug,n.slug))){let{tvl_usd:r,mcap_usd:n}=a,l=familyKey(a),i=n!==null&&n>0?n:null,s=t.get(l);s?(s.members.push(a),s.
tvl_usd+=r,s.mcap_usd??=i):t.set(l,{key:l,representative:a,members:[a],tvl_usd:r,mcap_usd:i})}return[...t.values()]}var BRIDGE_PRODUCT="wrap\
ped and bridged products are",STAKED_PRODUCT="staked products are",HOUSE_RULE=" (house rule).",EXCLUDED_CATEGORIES=new Map([["Bridge",BRIDGE_PRODUCT],
["Canonical Bridge",BRIDGE_PRODUCT],["Liquid Staking",STAKED_PRODUCT],["Liquid Restaking",STAKED_PRODUCT],["Restaked BTC",STAKED_PRODUCT],["\
CEX","exchange custody is"]]),VERSION_SUFFIX=/\s(?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)$/i,PRODUCT_WORD=/(?<![\p{L}\p{M}\p{N}_])(?:wrapped|staked|staking)(?![\p{L}\p{M}\p{N}_])/iu,
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
{clock:l,coefficients:i,shares:s,terms:u}=e,o=oddsFeatures(protocolFeatures(t,n),u,s,l);o[0]=0;let d=linearScore(o,i),c=i[1]??0,g=f=>r(l,f,d,
c);return{oddsAge:n,oddsAt:g,launchProbability12:g(n)}}function bootstrapProbability12(e,t,a,r){return conditionalProbability(e,t,a,Math.max(
0,r))}function mulberry32(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let a=Math.imul(t^t>>>15,t|1);return a^=a+Math.imul(a^a>>>7,a|61),((a^
a>>>14)>>>0)/2**32}}function selectTerms(e,t){let a=[],r=[],n=t(a);for(;a.length<e.length;){let l=e.filter(u=>!a.includes(u)).map(u=>({term:u,
scores:t([...a,u],n),kept:false})),i,s=0;for(let u of l){let o=n.map((c,g)=>{let f=u.scores[g];return c===null||f==null?0:c-f}),d=o.reduce((c,g)=>c+
g,0);o.every(c=>c>0)&&d>s&&(i=u,s=d)}if(r.push({baseline:n,trials:l}),!i)break;i.kept=true,a.push(i.term),n=i.scores}return{terms:a,steps:r,
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
e),r=ranks(e,"actual"),n=ranks(e,"predicted"),l=(t+1)/2,i=0,s=0,u=0;for(let{slug:d}of e){let c=(r.get(d)??l)-l,g=(n.get(d)??l)-l;i+=c*g,s+=c**
2,u+=g**2}let o=Math.sqrt(s*u);return{n:t,medianMultiplier:a===void 0?null:Math.exp(a),spearman:o===0?null:clamp(i/o,-1,1)}}function meanBrier(e){
return e.length?e.reduce((t,{actual:a,predicted:r})=>t+(a-r)**2,0)/e.length:null}function oddsValidationFolds(e){return[splitFolds(seededFolds(
e,10)),[walkForwardSplit(e)]]}function predictOddsFolds(e,t){return e.map(a=>a.map(({train:r,test:n})=>{if(!r.length||!n.length)return[];let l=t(
r);return n.map(i=>({slug:i.slug,actual:i.label,predicted:l(i)}))}))}function scoreOddsFolds(e){return e.map(t=>meanBrier(t.flat()))}function scoreOdds(e,t){
return scoreOddsFolds(predictOddsFolds(e,t))}function statusPredictor(e,t){let{shares:a,clock:r,coefficients:n,medianAgeDays:l}=fitOddsModel(
e,t);return i=>sigmoid(linearScore(oddsFeatures(i,t,a,r,l),n))}function selectOddsTerms(e,t=oddsValidationFolds(e)){return selectTerms(ODDS_CANDIDATES,
a=>scoreOdds(t,r=>statusPredictor(r,a)))}var oddsKeys=["model","baseRate","pava","clockOnly"];function oddsScores(e){return{scores:scoreOddsFolds(
e.model),baselines:{baseRate:scoreOddsFolds(e.baseRate),pava:scoreOddsFolds(e.pava),clockOnly:scoreOddsFolds(e.clockOnly)}}}function scoreOddsEvidence(e,t){
let a=oddsValidationFolds(e);for(let r of oddsKeys){let n=t?.[r];if(!Array.isArray(n)||n.length!==a.length)return null;for(let[l,i]of a.entries()){
let s=n[l];if(!Array.isArray(s)||s.length!==i.length)return null;for(let[u,{train:o,test:d}]of i.entries())if(!matchesPredictions(s[u],o.length?
d:[],c=>c.label,true))return null}}return oddsScores(t)}var PLACEBO_SEED=10675;function growthPlacebo(e,t,a,r=PLACEBO_SEED){let n=mulberry32(
r),l=oddsValidationFolds(e),i=d=>statusPredictor(d,t),s=scoreOdds(l,i),u=s.map(()=>0),o=new Map(e.map(({slug:d},c)=>[d,c]));for(let d=0;d<a;d++){
let c=e.map(p=>p.growth);for(let p=c.length-1;p>0;p--){let h=Math.floor(n()*(p+1)),y=c[p];c[p]=c[h],c[h]=y}let g=p=>({...p,growth:c[o.get(p.
slug)??-1]??p.growth}),f=l.map(p=>p.map(({train:h,test:y})=>({train:h.map(g),test:y.map(g)})));scoreOdds(f,i).forEach((p,h)=>{let y=s[h];p!==
null&&y!=null&&p<=y&&(u[h]=(u[h]??0)+1)})}return{shuffles:a,seed:r,real:s,asGoodOrBetter:s.map((d,c)=>d===null?null:(u[c]??0)/a)}}var{fitHuber}=window.
Radar?.support??{};var{diagonalPenalty}=window.Radar?.support??{};//! Ridge uses unit weights.
function fitRidge(e,t,a,r=[]){let n=diagonalPenalty(r.length+3,t);for(let[s,u]of r.entries())n[s+1]=[0,...u.slice(0,s+1)];let l=e.map(({group:s,
tvl:u,age:o})=>[1,...r.map((d,c)=>+(s===c+1)),u,o]),i=e.map(({target:s})=>s);return fitHuber(l,i,n,a,(s,u)=>{let[,[,o=0]=[],[,d=0,c=0]=[]]=s;
s.length===3&&n[2]?.[2]===0&&o>0&&c>0&&d**2>=(1-8*Number.EPSILON)*o*c&&(s[2]=[0,0,1],u[2]=0);for(let[g,f]of s.entries())g>=s.length-2&&f[g]===
0&&(f[g]=1)})}var FITTED_KEYS=["lnTvl","lnAge"];function valueFeatures(e,t,a){let r=[];return e.change_7d===null&&r.push("growth-missing"),e.
listed_at===null&&r.push("age-missing"),{features:{lnTvl:Math.log(e.tvl_usd),lnAge:e.listed_at===null?a:logAge(e.listed_at,t),growth:logMomentum(
e.change_7d)},flags:r}}function prepareFit(e,t){let a=e.length;if(a===0)throw new Error("The value model needs at least one traded comparabl\
e.");let r=median(e.flatMap(({slug:o,lnAge:d})=>d===null?[]:[{slug:o,value:d}]))??0,n=featureStats(e.map(({lnTvl:o})=>o)),l=featureStats(e.map(
({lnAge:o})=>o??r)),i=e.reduce((o,d)=>o+d.target,0)/a,s=t==="tvl"?0:n.scale,u=t==="age"?0:l.scale;return{design:e.map(o=>({target:o.target-i,
tvl:s?(o.lnTvl-n.mean)/s:0,age:u?((o.lnAge??r)-l.mean)/u:0})),targetMean:i,tvlScale:s,ageScale:u,metadata:{n:a,medianLnAge:r,featureMeans:{lnTvl:n.
mean,lnAge:l.mean},featureRanges:{lnTvl:n.range,lnAge:l.range}}}}function restoreCoefficients({targetMean:e,tvlScale:t,ageScale:a,metadata:{
featureMeans:r}},n,l,i){let s=t?l/t:0,u=a?i/a:0;return{intercept:e+n-s*r.lnTvl-u*r.lnAge,lnTvl:s,lnAge:u}}function fitValueModel(e,t,{drop:a,
robust:r=true,momentum:n=true}={},l){let i=prepareFit(e,a),s=l?i.design.map((f,p)=>({...f,group:l.groupBySlug[e[p]?.slug??""]??0})):i.design,
{coefficients:u,huberScale:o}=fitRidge(s,t,r,l?.penalty),d=l?.groups.length??1,c=l?.contrastShares.reduce((f,p,h)=>f+p*(u[h+1]??0),0)??0,g=l&&
categoryTotals();return l?.groups.forEach((f,p)=>{g&&(g[f]=(p?u[p]??0:0)-c)}),{...i.metadata,lambda:t,momentum:n,huberScale:o,coefficients:restoreCoefficients(
i,(u[0]??0)+c,u[d]??0,u[d+1]??0),...g&&{categoryEffects:g}}}function logValue({lnTvl:e,growth:t,lnAge:a,category:r},{coefficients:n,momentum:l=true,
categoryEffects:i}){return n.intercept+n.lnTvl*(e+(l?t:0))+n.lnAge*a+(i?.[r??"other"]??0)}function predictValue(e,t,a){let r=valueFeatures(e,
t,a.medianLnAge),{featureMeans:n,featureRanges:l,coefficients:i}=a,{features:s}=r;a.categoryEffects&&(s.category=categoryGroup(e.category)),
FITTED_KEYS.some(f=>{let{min:p,max:h}=l[f];return s[f]<p||s[f]>h})&&r.flags.push("outside-comps-range");let{intercept:u,lnTvl:o,lnAge:d}=i,c=u+
o*n.lnTvl+d*n.lnAge,g=Math.exp(logValue(s,a));return{...r,valueUsd:g,launch_value_usd:clamp(Math.round(g),1,1e14),decomposition:{base:Math.exp(
c),multipliers:{lnTvl:Math.exp(o*(s.lnTvl-n.lnTvl)),growth:Math.exp(o*(a.momentum===false?0:s.growth)),lnAge:Math.exp(d*(s.lnAge-n.lnAge)),...a.
categoryEffects&&{category:Math.exp(a.categoryEffects[s.category??"other"])}}}}}function rankBoard(e,t,a){return e.map(r=>{let n=predictValue(
r.protocol,t,a);return{...r,...n,implied_value_usd:Math.max(1,Math.round(n.launch_value_usd*r.launchProbability12))}}).sort((r,n)=>n.implied_value_usd-
r.implied_value_usd||compareText(r.protocol.slug,n.protocol.slug)).map((r,n)=>({...r,rank:n+1}))}var VALUE_CANDIDATES=["momentum","age","cat\
egory"];function predictionsFor(e,t){return e.map(a=>({slug:a.slug,actual:a.target,predicted:t(a)}))}function predictComparable(e,t){let{lnTvl:a,
growth:r,lnAge:n}=e,l=e.category;return logValue({lnTvl:a,growth:r,lnAge:n??t.medianLnAge,category:l??"other"},t)}function valueOptions(e){return{
...!e.includes("age")&&{drop:"age"},momentum:e.includes("momentum")}}function categoryDesign(e,t){let a=categoryTotals();for(let{category:i}of e)
a[i]++;let r=Object.keys(a).filter(i=>a[i]>0),n=r.map(i=>a[i]/e.length),l=n.slice(1);return{groups:r,groupBySlug:Object.fromEntries(e.map(({
slug:i,category:s})=>[i,r.indexOf(s)])),contrastShares:l,penalty:l.map((i,s)=>l.map((u,o)=>t*((s===o?1:0)+n.length*i*u-i-u)))}}var VALUE_RIDGE_LAMBDA=.01,
VALUE_CATEGORY_PENALTY=64;function refitValue(e,t){let a=t.includes("category")?categoryDesign(e,VALUE_CATEGORY_PENALTY):void 0;return fitValueModel(
e,VALUE_RIDGE_LAMBDA,valueOptions(t),a)}function predictValueTrial({train:e,test:t},a,r=refitValue){if(!e.length||!t.length)return[];let n=r(
e,a);return predictionsFor(t,l=>predictComparable(l,n))}function selectValueTerms(e,t){return valueSelection(e,t,false)}function valueSelection(e,t,a){
let r=splitFolds(e.map(l=>[l])),n=walkForwardSplit(e);return selectTerms(VALUE_CANDIDATES,(l,i)=>{let s=medianLogError(predictValueTrial(n,l,
t))??null;return a&&i&&(s===null||i[1]==null||s>=i[1])?[null,s]:[medianLogError(r.flatMap(u=>predictValueTrial(u,l,t)))??null,s]})}function refitSelectedValue(e,t){
return refitValue(e,valueSelection(e,t,true).terms)}var TAIL_ALPHA=.1,MIN_BAND_FAMILIES=Math.ceil(1/TAIL_ALPHA);function leaveOneFamilyOut(e,t=refitSelectedValue){
if(e.length<2)return[];let a=[...e].sort((r,n)=>compareText(r.slug,n.slug));return a.map(r=>{let n=a.filter(i=>i!==r),l=typeof t=="number"?fitValueModel(
n,t):t(n);return{comparable:r,model:l,residual:r.target-predictComparable(r,l)}})}function jackknifePlusBand(e){let t=e.map(({slug:s,prediction:u,
residual:o})=>({slug:s,value:u+o})).sort((s,u)=>s.value-u.value||compareText(s.slug,u.slug)),a=s=>{let u=Math.floor((t.length+1)*s);return[t[u-
1]?.value??-1/0,t[t.length-u]?.value??1/0]},[r,n]=a(TAIL_ALPHA),[l,i]=a(.25);return{p10:r,p25:l,p75:i,p90:n}}function jackknifePlusBands(e,t=refitSelectedValue){
let a=new Map;if(e.length<3)return a;for(let r of e){let n=e.filter(i=>i!==r),l=leaveOneFamilyOut(n,t).map(({comparable:i,model:s,residual:u})=>({
slug:i.slug,prediction:predictComparable(r,s),residual:u}));a.set(r.slug,jackknifePlusBand(l))}return a}function rangeHonesty(e){let t=(a,r,n)=>{
let l=0,i=0;for(let s of e){let u=s[a],o=s[r];u===null||o===null||!Number.isFinite(u)||!Number.isFinite(o)||u>o||(i++,u<=s.actual&&s.actual<=
o&&l++)}return{stated:n,covered:l,n:i}};return{middle:t("p25","p75",.5),broad:t("p10","p90",.8)}}function describeBoardValues(e,t,a,r){let n=new Map(
e.map(u=>[u.protocol.slug,{row:u,samples:[],influence:null}]));for(let{comparable:{slug:u,familyKey:o},model:d,residual:c}of a)for(let g of rankBoard(
e,r,d)){let f=n.get(g.protocol.slug);if(!f)throw new Error("Missing board row for a valuation refit.");f.samples.push({slug:u,prediction:logValue(
g.features,d),residual:c});let p=g.rank-f.row.rank,h=f.influence,y=Math.abs(p),b=Math.abs(h?.rank_delta??0);(!h||y>b||y===b&&compareText(u,h.
slug)<0)&&(f.influence={slug:u,family_key:o,rank_delta:p})}let{tvlScale:l,ageScale:i,metadata:{medianLnAge:s}}=prepareFit(t);return[...n.values()].
map(({row:u,samples:o,influence:d})=>{let{p10:c,p90:g}=jackknifePlusBand(o),f=m=>clamp(Math.exp(m),1,1e14)*u.launchProbability12,{lnTvl:p,lnAge:h}=u.
features,y=t.map(m=>{let v=l?(m.lnTvl-p)/l:0,E=i?((m.lnAge??s)-h)/i:0;return{slug:m.slug,distance:v**2+E**2}}).sort((m,v)=>m.distance-v.distance||
compareText(m.slug,v.slug)).slice(0,5).map(({slug:m})=>m),b={interval_p10_usd:Math.max(1,Math.floor(f(c))),interval_p90_usd:Math.max(1,Math.
ceil(f(g))),influence:d,twins:y};return{protocol:u.protocol,diagnostics:b}})}function inputEffectContrasts(e,t,a,r){let n=protocolOdds(r,e,t),
l=predictValue(e,t,a),i=n.launchProbability12,s=(c,g,f)=>{let p=l.features,h=c.features,{lnTvl:y,lnAge:b}=a.coefficients,m=a.momentum?h.growth-
p.growth:0,v=f===void 0?-1:r.terms.indexOf(f),E=f===void 0?g:i;if(f!==void 0&&v>=0){let[M,...C]=r.coefficients,T=(C[v+1]??NaN)*(h[f]-p[f]);E=
protocolOdds({...r,coefficients:[(M??NaN)+T,...C]},e,t).launchProbability12}return[(c.valueUsd*g/(l.valueUsd*i)-1)*100,100*Math.expm1(y*(h.lnTvl-
p.lnTvl+m)+b*(h.lnAge-p.lnAge)+Math.log(E/i))]},u=(c,g)=>s(predictValue(c,t,a),protocolOdds(r,c,t).launchProbability12,g),o=new Date(Date.parse(
t)+YEAR_DAYS*864e5).toISOString(),d=e.listed_at===null&&a.coefficients.lnAge?{...a,medianLnAge:Math.log(Math.exp(a.medianLnAge)+YEAR_DAYS)}:
a;return[u({...e,tvl_usd:e.tvl_usd*1.1},"lnTvl"),u({...e,change_7d:(e.change_7d??0)+10},"growth"),s(predictValue(e,o,d),n.oddsAt(n.oddsAge+YEAR_DAYS))]}
function impliedValueEffects(e,t,a,r){let[n,l,i]=inputEffectContrasts(e,t,a,r);return[n[0],l[0],i[0]]}function coefficientEffects(e,t,a,r){let[
n,l,i]=inputEffectContrasts(e,t,a,r);return[n[1],l[1],i[1]]}function summarizeEffects(e){return[0,1,2].map(t=>{let a=[...e];if(a.some(([,l])=>!Number.
isFinite(l[t])))return[NaN,NaN,NaN];a.sort(([l,i],[s,u])=>i[t]-u[t]||compareText(l,s));let r=a.length,n=l=>a[l]?.[1][t]??NaN;return[(n(Math.
floor((r-1)/2))+n(Math.floor(r/2)))/2,n(Math.ceil(.1*r)-1),n(Math.ceil(.9*r)-1)]})}function logMedianRatio(e){let t=Math.floor(e.length/2),a=e[t]?.
logRatio,r=e[t-1]?.logRatio;if(a===void 0)throw new Error("A multiple needs at least one traded comparable.");return e.length%2===0&&r!==void 0?
a+Math.log1p(Math.exp(r-a))-Math.LN2:a}function fitMultiples(e){let t=e.map(n=>({slug:n.slug,category:n.category,logRatio:n.target-n.lnTvl})).
sort((n,l)=>n.logRatio-l.logRatio||compareText(n.slug,l.slug)),a=new Map;for(let n of t){let l=a.get(n.category);l?l.push(n):a.set(n.category,
[n])}let r={};for(let[n,l]of a)r[n]=logMedianRatio(l);return{flat:logMedianRatio(t),category:r}}var schemes=["leaveOneFamilyOut","seededFive\
Fold","walkForward"],models=["model","flatMultiple","categoryMultiple"];function fitOuterFold(e){let{train:t,test:a}=e,r=t.length&&a.length?
selectValueTerms(t).terms:[],n={model:predictValueTrial(e,r),flatMultiple:[],categoryMultiple:[]};if(t.length&&a.length){let{flat:l,category:i}=fitMultiples(
t);n.flatMultiple=predictionsFor(a,s=>l+s.lnTvl),n.categoryMultiple=predictionsFor(a,s=>(i[s.category]??l)+s.lnTvl)}return{terms:r,lambda:VALUE_RIDGE_LAMBDA,
predictions:n}}function scoreValueFolds(e){return{model:scorePredictions(e.flatMap(({model:t})=>t)),flatMultiple:scorePredictions(e.flatMap(
({flatMultiple:t})=>t)),categoryMultiple:scorePredictions(e.flatMap(({categoryMultiple:t})=>t))}}function valueValidationFolds(e){return{leaveOneFamilyOut:splitFolds(
e.map(t=>[t])),seededFiveFold:splitFolds(seededFolds(e)),walkForward:[walkForwardSplit(e)]}}function scoreValueEvidence(e,t){let a=valueValidationFolds(
e);for(let r of schemes){let n=t?.[r];if(!Array.isArray(n)||n.length!==a[r].length)return null;for(let[l,{train:i,test:s}]of a[r].entries())
if(!models.every(u=>matchesPredictions(n[l]?.[u],i.length?s:[],o=>o.target)))return null}return{leaveOneFamilyOut:scoreValueFolds(t.leaveOneFamilyOut),
seededFiveFold:scoreValueFolds(t.seededFiveFold),walkForward:scoreValueFolds(t.walkForward)}}function resample(e,t){return e.map(()=>e[Math.
floor(t()*e.length)])}function bootstrapSummary(e){let t=e.length,a=new Map;for(let{ranked:l}of e)l.forEach((i,s)=>{let u=a.get(i)??[];u.push(
s+1),a.set(i,u)});let r=new Map([...a].map(([l,i])=>(i.sort((s,u)=>s-u),[l,{rank_p10:i[Math.ceil(.1*t)-1],rank_p90:i[Math.ceil(.9*t)-1]}]))),
n=(e[0]?.coefficients??[]).map((l,i)=>{let s=e.map(({coefficients:o})=>o[i]);if(t<2||!s.every(Number.isFinite))return null;let u=s.reduce((o,d)=>o+
d,0)/t;return Math.sqrt(s.reduce((o,d)=>o+(d-u)**2,0)/(t-1))});return{ranks:r,standardErrors:n}}var EVIDENCE_REPLICATES=200,BOOTSTRAP_SEEDS=[
10673,10674];function bootstrapRadar(e,t,a,r,n,l,i,s=EVIDENCE_REPLICATES,u=BOOTSTRAP_SEEDS){let[o,d]=u,c=mulberry32(o),g=mulberry32(d),f=Object.
keys(r.coefficients),p=Object.keys(r.categoryEffects??{}),{ranks:h,standardErrors:y}=bootstrapSummary(Array.from({length:s},()=>{let m=refitValue(
resample(t,c),n),v=fitOddsModel(resample(a,g),l.terms),E=e.map(({protocol:M,status:C,boardReasons:T,reason:w,familyKey:F})=>({protocol:M,status:C,
boardReasons:T,reason:w,familyKey:F,launchProbability12:protocolOdds(v,M,i,bootstrapProbability12).launchProbability12}));return{ranked:rankBoard(
E,i,m).map(({protocol:M})=>M.slug),coefficients:[...f.map(M=>m.coefficients[M]),...p.map(M=>m.categoryEffects?.[M]??0),...v.coefficients]}})),
b=f.length+p.length;return{ranks:h,replicates:s,seeds:u,valueErrors:Object.fromEntries([...f,...p].map((m,v)=>[m,y[v]??null])),oddsErrors:y.
slice(b)}}function radarInputs({protocols:e,as_of:t}){let a=groupFamilies(e),r=buildCensus(e,a),n=groupComparableCategories(comparablesFromFamilies(
a,t),a);return{families:a,entries:r,comparables:n,population:oddsPopulation(r,t)}}function rankRadar({watchlist:e,as_of:t},a,r,n,l){checkClockCoefficient(
n.coefficients[1]);let i=boardEntries(a,e).map(u=>({...u,...protocolOdds(n,u.protocol,t)})),s=farmExitThresholds(a,l.playbooks);return rankBoard(
i,t,r).map(u=>{let{protocol:o,launch_value_usd:d,launchProbability12:c}=u,g=makeFarmPlan(o,l,{launchProbability12:c,exitThreshold:s.get(farmGroup(
o.category))??null});return{...u,plan:g,economics:estimateFarmEconomics(g,d,o.tvl_usd,c)}})}function recomputeRadar(e,{terms:t},a,r){let{families:n,
entries:l,comparables:i,population:s}=radarInputs(e),u=refitValue(i,t),o=fitOddsModel(s,a);return{model:u,odds:o,board:rankRadar(e,l,u,o,r),
families:n,comparables:i,population:s,census:censusRecords(l),houseRule:houseRuleMembership(e)}}function readPublishedSnapshot({meta:e,protocols:t,
watchlist:a}){if(!Array.isArray(t)||!Array.isArray(a)||t.length!==e?.protocolCount)return null;let{as_of:r,floor_usd:n,source:l}=e;return{as_of:r,
floor_usd:n,source:l,protocols:t,watchlist:a}}function reproduceSelection({comparables:e,population:t}){return{value:selectValueTerms(e),odds:selectOddsTerms(
t)}}function reproduceDiagnostics({board:e,comparables:t,population:a,model:r,odds:n},l,i,s,u){return{bootstrap:bootstrapRadar(e,t,a,r,l,n,i,
EVIDENCE_REPLICATES,s),placebo:growthPlacebo(a,n.terms,EVIDENCE_REPLICATES,u)}}var browserApi={baseRate,LOGISTIC_PENALTY,VALUE_CATEGORY_PENALTY,
BOOTSTRAP_SEEDS,PLACEBO_SEED,fitOuterFold,jackknifePlusBands,describeBoardValues,coefficientEffects,impliedValueEffects,summarizeEffects,rangeHonesty,
reproduceSelection,scoreValueEvidence,scoreOddsEvidence,reproduceDiagnostics,MIN_BAND_FAMILIES,depositAmounts,farmEconomicsTerms,makeFarmPlan,
farmAssumptions:defaults,estimateFarmEconomics,formatUsd,compareText,daysBetween,logValue,buildRadar:recomputeRadar,readPublishedSnapshot};Object.
assign(window.Radar??={},browserApi);
})();
