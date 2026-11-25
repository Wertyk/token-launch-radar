(() => {
var ASSUMPTIONS_AS_OF="2026-11-14",defaults={asOf:ASSUMPTIONS_AS_OF,airdropShareOfLaunchCap:.25,farmerHaircut:.5,hourlyRateUsd:25,capitalApr:{
yieldBearing:0,nonYielding:.05},horizonMonths:12,monthsPerYear:12,weeksPerYear:52,minutesPerHour:60,depositsUsd:[1e3,5e3,1e4,25e3],tradeVolumeUsd:200,
tradingFeeRate:6e-4,setupMinutes:5,bridgeMinutes:10};function formatUsd(e){let t=Math.abs(e).toFixed(2).replace(/\.00$/,"");return`${e<0?"-":
""}$${t.replace(/\B(?=(\d{3})+(?:\.|$))/g,",")}`}function expectedHoldYears(e,t=1){if(e===0)return t;let r=-Math.log1p(-e);return-Math.expm1(
-r*t)/r}function farmEconomicsTerms(e,t,r,a,n=defaults){let l=e.totalMinutes/n.minutesPerHour,i=n.horizonMonths/n.monthsPerYear,{yieldBearing:u,
nonYielding:s}=n.capitalApr??defaults.capitalApr,o=e.capitalApr;o===defaults.capitalApr.yieldBearing?o=u:o===defaults.capitalApr.nonYielding&&
(o=s);let d=o*expectedHoldYears(a,i),g=t*n.airdropShareOfLaunchCap*a*n.farmerHaircut/r;return{cashFees:e.totalCostUsd,hours:l,horizonYears:i,
capitalCarry:d,k:g}}function estimateFarmEconomics(e,t,r,a,n=defaults){let l=farmEconomicsTerms(e,t,r,a,n),{cashFees:i,horizonYears:u,capitalCarry:s,
k:o}=l,d=g=>{let f=depositAmounts(l,g),{netUsd:c,netPerHourUsd:p}=f,h=c<=0?"SKIP":p>n.hourlyRateUsd?"FARM":"THIN";return{depositUsd:g,...f,verdict:h}};
return{launchProbability12:a,airdropYieldApr:o/u,deposits:defaults.depositsUsd.map(d),breakEvenDepositUsd:o>s?i/(o-s):"never"}}function depositAmounts({
cashFees:e,capitalCarry:t,hours:r,k:a},n){let l=a*n,i=t*n,u=e+i,s=l-e-i,o=s===0?0:s/r;return{expectedValueUsd:l,costUsd:u,netUsd:s,netPerHourUsd:o}}
//! Numeric kernels (weighted Cholesky least squares, Huber and logistic IRLS) ship in 5-extras.js.
var{compareText}=window.Radar?.support??{};var MIN_GROUP_CHANGES=10,farmCategories={lending:["lending","uncollateralized lending","collatera\
l markets"],cdp:["cdp","cdp manager"],dex:["dex","dexs","liquidity manager"],derivatives:["derivatives","interest rate derivatives","basis t\
rading","options","options vault","perps"],yield:["yield","yield aggregator","leveraged farming","farm","risk curators"],allocator:["onchain\
 capital allocator"],staking:["liquid staking","staking pool","restaking","liquid restaking","restaked btc","staking"],rwa:["rwa"],stablecoin:[
"stablecoin","dual-token stablecoin","stablecoin wrapper"],prediction:["prediction market","prediction markets"],bridge:["bridge","canonical\
 bridge","cross chain bridge"]};function farmGroup(e){let t=e?.trim().toLowerCase()??"";return Object.entries(farmCategories).find(([,r])=>r.
includes(t))?.[0]??"generic"}function farmExitThresholds(e,t){let r=e.flatMap(({protocol:i,status:u})=>{let{listed_at:s,change_7d:o,slug:d,category:g}=i;
return u==="pre-token"&&s!==null&&o!==null?[{change:o,slug:d,group:farmGroup(g)}]:[]}).sort((i,u)=>i.change-u.change||compareText(i.slug,u.slug)),
a=i=>i[Math.ceil(i.length/10)-1]?.change,n=a(r),l=n===void 0?null:{change:n,label:"pooled categories"};return new Map(Object.entries(t).map(
([i,{label:u}])=>{let s=r.filter(d=>d.group===i),o=s.length<MIN_GROUP_CHANGES?void 0:a(s);return[i,o===void 0?l:{change:o,label:u}]}))}function roundUsd(e){
return Math.round(e*100)/100}function farmCapitalApr(e){let t=["lending","dex","yield","allocator","staking","rwa"].includes(e);return defaults.
capitalApr[t?"yieldBearing":"nonYielding"]}function formatEntryShare(e,t){let r=100*e/t,a=r.toPrecision(2),[,n]=a.split("e"),l=Math.max(0,1-
Number(n)),i=`${n&&l<=20?Number(a).toFixed(l):a}% of snapshot TVL`;if(r>=.001)return i;let u=Number((t/e).toPrecision(2)),s=Math.min(4,Math.
floor(Math.log10(u)/3));return`${i} (about 1 in ${u/1e3**s}${" KMBT"[s]} of TVL)`}function makeFarmPlan(e,{playbooks:t,gas:r,funding:a,uncollateralized:n,
checklist:l},{depositUsd:i=defaults.depositsUsd[0],launchProbability12:u=0,exitThreshold:s=null}={}){if(!Number.isFinite(i)||i<=0)throw new Error(
"The farm plan needs a positive, finite deposit size.");let o=farmGroup(e.category),d=t[o]??t.generic,g=e.category?.toLowerCase().includes("\
uncollateralized")?n:d,f=o==="bridge",c=expectedHoldYears(u),p=c*defaults.weeksPerYear,h={once:1,"at launch":1,weekly:Math.floor(p),monthly:Math.
floor(defaults.monthsPerYear*c)},m=h[d.cadence],[v,y,M]=d.transactions,E=(f?0:v)+y*m+M,b=o==="derivatives"?defaults.tradeVolumeUsd*defaults.
tradingFeeRate:0,w=A=>{let k=A!==null&&Object.hasOwn(r.chains,A)?r.chains[A]:void 0,[C,O]=k??r.fallback,N=roundUsd(v*(f?O:C)),x=roundUsd(b+y*
C),V=roundUsd(M*C),I=roundUsd(C),le=(f?0:roundUsd(O))+N+V,z=roundUsd(le+I*u),K=roundUsd(x*m),ie=roundUsd(z+K);return{chain:A,transactionUsd:C,
bridgeUsd:O,entryCost:N,reviewCost:x,exitCost:V,claimCost:I,oneTimeCostUsd:z,recurringCostUsd:K,totalCostUsd:ie,feeAssumed:k===void 0}},{chain:T,
transactionUsd:F,bridgeUsd:S,entryCost:Y,reviewCost:j,exitCost:H,claimCost:G,oneTimeCostUsd:q,recurringCostUsd:X,totalCostUsd:W,feeAssumed:J}=e.
chains.map(w).sort((A,k)=>A.totalCostUsd-k.totalCostUsd||compareText(A.chain??"",k.chain??""))[0]??w(null),Q={deposit:formatUsd(i),chain:T??
"a verified chain",gas:`about ${formatUsd((E+1)*F)} for gas`,share:formatEntryShare(i,e.tvl_usd)},_=(A,k,C,O="once")=>({action:A.replace(/\{(\w+)\}/g,
(N,x)=>Q[x]??""),chain:T,costUsd:roundUsd(k),minutes:C,cadence:O}),[Z,ee,te]=d.minutes,[D,P,U,L]=l.minutes,R=f?null:_(a.bridge,S,defaults.bridgeMinutes),
re=_(g.review,j,ee,d.cadence),B=`TVL drops under ${formatUsd(e.tvl_usd/2)}`,ae=s?.change.toFixed(1).replace("-","\u2212"),ne=s?`Exit if 7-da\
y TVL change falls below ${ae}% (bottom tenth of ${s.label} in this snapshot) or ${B}.`:`Exit if ${B}. No listed pre-token 7-day TVL data.`,
$=[_(T===null?a.unlisted:a.wallet,0,defaults.setupMinutes-D),_(l.eligibility,0,D),_(d.sizing?.action??l.size,0,P+(d.sizing?.extraMinutes??0)),
...R?[R]:[],_(g.enter,Y,Z-P-L),re,_(l.records,0,L),_(l.claim,G,U,"at launch"),{..._(g.exit,H,te-U),exitCondition:`${ne} ${g.exitCondition}`}];
return{chain:T,depositUsd:i,steps:$,fundingStep:R,exitThreshold:s,reviewCounts:h,holdWeeks:p,flags:J?["fee-assumed"]:[],assumptionsAsOf:defaults.
asOf,capitalApr:farmCapitalApr(o),oneTimeCostUsd:q,recurringCostUsd:X,totalCostUsd:W,totalMinutes:$.reduce((A,k)=>A+k.minutes*h[k.cadence],0)}}
function familyKey({slug:e,gecko_id:t}){return t===null?`slug:${e}`:`gecko:${t}`}function groupFamilies(e){let t=new Map;for(let r of[...e].
sort((a,n)=>compareText(a.slug,n.slug))){let{tvl_usd:a,mcap_usd:n}=r,l=familyKey(r),i=n!==null&&n>0?n:null,u=t.get(l);u?(u.members.push(r),u.
tvl_usd+=a,u.mcap_usd??=i):t.set(l,{key:l,representative:r,members:[r],tvl_usd:a,mcap_usd:i})}return[...t.values()]}var BRIDGE_PRODUCT="wrap\
ped and bridged products are",STAKED_PRODUCT="staked products are",HOUSE_RULE=" (house rule).",EXCLUDED_CATEGORIES=new Map([["Bridge",BRIDGE_PRODUCT],
["Canonical Bridge",BRIDGE_PRODUCT],["Liquid Staking",STAKED_PRODUCT],["Liquid Restaking",STAKED_PRODUCT],["Restaked BTC",STAKED_PRODUCT],["\
CEX","exchange custody is"]]),VERSION_SUFFIX=/\s(?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)$/i,PRODUCT_WORD=/(?<![\p{L}\p{M}\p{N}_])(?:wrapped|staked|staking)(?![\p{L}\p{M}\p{N}_])/iu,
EXCHANGE_NAME=/^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)(?![\p{L}\p{M}\p{N}_])/iu;function tokenFields({gecko_id:e,symbol:t}){
return e!==null?t===null?"gecko_id":"gecko_id and symbol":t===null?null:"symbol"}function exclusionReason(e){let{category:t}=e,r=t===null?void 0:
EXCLUDED_CATEGORIES.get(t);if(r)return`${t} category: ${r} not ranked${HOUSE_RULE}`;let a=e.name.trim();if(VERSION_SUFFIX.test(a))return`Nam\
e ends in a version marker${HOUSE_RULE}`;let n=a.match(PRODUCT_WORD)?.[0];if(n!==void 0)return`Name contains \u201C${n}\u201D${HOUSE_RULE}`;
let l=a.match(EXCHANGE_NAME)?.[0];return l===void 0?null:`Name starts with the exchange name \u201C${l}\u201D${HOUSE_RULE}`}function classify(e,t=e.
mcap_usd){if(t!==null&&t>0)return{status:"traded",reason:"The family records a positive market cap."};let r=tokenFields(e);if(r!==null)return{
status:"token-unpriced",reason:`The protocol records a token via ${r} without a positive market cap.`};let a=exclusionReason(e);return a!==null?
{status:"excluded",reason:a}:{status:"pre-token",reason:"The protocol records no token."}}function buildCensus(e,t=groupFamilies(e)){let r=new Map(
t.map(({key:a,mcap_usd:n})=>[a,n]));return e.map(a=>{let n=familyKey(a);return{protocol:a,familyKey:n,...classify(a,r.get(n)??null)}})}function censusRecords(e){
return e.map(({protocol:{slug:t,name:r,category:a,tvl_usd:n},...l})=>({slug:t,name:r,category:a,tvl_usd:n,...l}))}function houseRuleMembership({
protocols:e,floor_usd:t,watchlist:r}){let a=new Set(r),n=new Set(e.filter(s=>s.tvl_usd>=t&&tokenFields(s)===null&&exclusionReason(s)===null).
map(({slug:s})=>s).sort(compareText)),l=[],i=[];for(let s of n)(a.has(s)?l:i).push(s);let u=[...a].filter(s=>!n.has(s)).sort(compareText);return{
truePositives:l,falsePositives:i,falseNegatives:u}}function boardEntries(e,t){let r=new Set(t),a=[];for(let n of e){let l=[];n.status==="pre\
-token"&&l.push("pre-token"),r.has(n.protocol.slug)&&l.push("watchlist"),l.length>0&&a.push({...n,boardReasons:l})}return a}function pava(e){
let t=[];for(let r of e)for(t.push({...r,size:1});t.length>1;){let a=t.at(-2),n=t.at(-1);if(!a||!n||a.recorded*n.count<=n.recorded*a.count)break;
a.count+=n.count,a.recorded+=n.recorded,a.size+=n.size,t.pop()}return t.flatMap(({count:r,recorded:a,size:n})=>Array(n).fill(a/r))}var YEAR_DAYS=365;
function fitAgeShares(e){let t=new Map;for(let{ageDays:n,label:l}of e){let i=Math.floor(n/YEAR_DAYS),u=t.get(i)??{count:0,recorded:0,ageSum:0};
u.count++,u.recorded+=l,u.ageSum+=n,t.set(i,u)}let r=[...t].sort(([n],[l])=>n-l).map(([,n])=>n),a=pava(r);return r.map(({ageSum:n,count:l},i)=>({
ageDays:n/l,share:a[i]??0,count:l}))}function tailHazard(e){for(let t=e.length-1;t>0;t--){let r=e[t-1],a=e[t];if(r&&a&&a.share>r.share)return Math.
log((1-r.share)/(1-a.share))/(a.ageDays-r.ageDays)}return-Math.log1p(-(e[0]?.share??0))/YEAR_DAYS}function shareAt(e,t){let r=e[0];if(!r)return 0;
if(t<=r.ageDays)return r.share;for(let a of e){if(t<=a.ageDays){let n=(t-r.ageDays)/(a.ageDays-r.ageDays);return r.share+n*(a.share-r.share)}
r=a}return r.share+(1-r.share)*-Math.expm1(-tailHazard(e)*(t-r.ageDays))}var{clamp,featureStats,median}=window.Radar?.support??{};function daysBetween(e,t){
return(Date.parse(t)-Date.parse(e))/864e5}var categories={dex:["dex","dexs","liquidity manager"],lending:["lending","uncollateralized lendin\
g","cdp","cdp manager","collateral markets"],staking:["liquid staking","staking pool","restaking","liquid restaking","restaked btc"],yield:[
"yield","yield aggregator","leveraged farming","farm"],derivatives:["derivatives","interest rate derivatives","basis trading","options","opt\
ions vault"],rwa:["rwa"],bridge:["bridge","canonical bridge","cross chain bridge"],other:[]};function categoryGroup(e){let t=e?.trim().toLowerCase()??
"";for(let[r,a]of Object.entries(categories))if(a.includes(t))return r;return"other"}function categoryTotals(){return Object.fromEntries(Object.
keys(categories).map(e=>[e,0]))}function groupComparableCategories(e,t){let r=new Map(t.map(({key:a,representative:n})=>[a,categoryGroup(n.category)]));
return e.map(a=>({...a,category:r.get(a.familyKey)??"other"}))}function logAge(e,t){return Math.log(Math.max(1,daysBetween(e,t)))}function logMomentum(e){
return e===null?0:Math.log1p(clamp(e,-50,100)/100)}function comparablesFromFamilies(e,t){return e.flatMap(({key:r,representative:a,tvl_usd:n,
mcap_usd:l})=>{let{slug:i,listed_at:u,change_7d:s}=a;return exclusionReason(a)!==null||l===null?[]:[{slug:i,familyKey:r,listedAt:u,lnTvl:Math.
log(n),lnAge:u===null?null:logAge(u,t),growth:logMomentum(s),target:Math.log(l)}]})}var{fitLogistic,linearScore,sigmoid}=window.Radar?.support??
{};var ODDS_CANDIDATES=["lnTvl","growth","lnChains","categoryShare"],LOGISTIC_PENALTY=1,PRIOR_STRENGTH=20;function protocolFeatures(e,t){return{
ageDays:t,lnTvl:Math.log(e.tvl_usd),growth:logMomentum(e.change_7d),lnChains:Math.log(Math.max(1,e.chains.length)),category:categoryGroup(e.
category)}}function oddsPopulation(e,t){return e.flatMap(({protocol:r,status:a})=>{let{slug:n,listed_at:l}=r;return exclusionReason(r)!==null?
[]:[{...protocolFeatures(r,l===null?null:Math.max(0,daysBetween(l,t))),slug:n,familyKey:n,listedAt:l,label:+(a==="traded"||a==="token-unpric\
ed")}]}).sort((r,a)=>compareText(r.slug,a.slug))}function baseRate(e){return e.reduce((t,{label:r})=>t+r,0)/e.length}function categoryTokenShares(e,t=PRIOR_STRENGTH){
let r=categoryTotals(),a=categoryTotals();for(let{category:l,label:i}of e)r[l]++,a[l]+=i;let n=baseRate(e);for(let l of Object.keys(r))a[l]=
(a[l]+t*n)/(r[l]+t);return a}function oddsFeatures(e,t,r,a,n=0){return[clockLogit(a,e.ageDays??n),...t.map(l=>l==="categoryShare"?r[e.category]:
e[l])]}function clockLogit(e,t){let r=clamp(shareAt(e,t),.01,.99);return Math.log(r/(1-r))}function fitOddsClock(e){let t=e.flatMap(({ageDays:r,
slug:a,label:n})=>r===null?[]:[{ageDays:r,slug:a,label:n}]);return{clock:t.length?fitAgeShares(t):[{ageDays:0,share:baseRate(e),count:e.length}],
medianAgeDays:median(t.map(({slug:r,ageDays:a})=>({slug:r,value:a})))??0,maxAgeDays:t.reduce((r,{ageDays:a})=>Math.max(r,a),0)}}function prepareOddsFit(e){
return{...fitOddsClock(e),shares:categoryTokenShares(e)}}function fitOddsModel(e,t,{shares:r,...a}=prepareOddsFit(e)){let n=fitLogistic(e.map(
l=>oddsFeatures(l,t,r,a.clock,a.medianAgeDays)),e.map(({label:l})=>l),LOGISTIC_PENALTY);return{...a,terms:t,coefficients:n,shares:r,n:e.length}}
function checkClockCoefficient(e=0){if(!(e>0))throw new Error("Token-status clock coefficient \u03B3 must be positive.")}function launchProbability12(e,t,r,a){
return checkClockCoefficient(a),conditionalProbability(e,t,r,a)}function conditionalProbability(e,t,r,a){let n=clockLogit(e,t+YEAR_DAYS),l=a*
(n-clockLogit(e,t));return l===0?-Math.expm1(-tailHazard(e)*YEAR_DAYS):clamp(sigmoid(r+a*n)*-Math.expm1(-l),0,1)}function protocolOdds(e,t,r,a=launchProbability12){
let n=t.listed_at===null?e.medianAgeDays:Math.max(0,daysBetween(t.listed_at,r)),{clock:l,coefficients:i,shares:u,terms:s}=e,o=oddsFeatures(protocolFeatures(
t,n),s,u,l);o[0]=0;let d=linearScore(o,i),g=i[1]??0,f=c=>a(l,c,d,g);return{oddsAge:n,oddsAt:f,launchProbability12:f(n)}}function bootstrapProbability12(e,t,r,a){
return conditionalProbability(e,t,r,Math.max(0,a))}function mulberry32(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let r=Math.imul(t^t>>>15,
t|1);return r^=r+Math.imul(r^r>>>7,r|61),((r^r>>>14)>>>0)/2**32}}function selectTerms(e,t){let r=[],a=[],n=t(r);for(;r.length<e.length;){let l=e.
filter(s=>!r.includes(s)).map(s=>({term:s,scores:t([...r,s],n),kept:false})),i,u=0;for(let s of l){let o=n.map((g,f)=>{let c=s.scores[f];return g===
null||c==null?0:g-c}),d=o.reduce((g,f)=>g+f,0);o.every(g=>g>0)&&d>u&&(i=s,u=d)}if(a.push({baseline:n,trials:l}),!i)break;i.kept=true,r.push(
i.term),n=i.scores}return{terms:r,steps:a,scores:n}}var FOLD_COUNT=5,FOLD_SEED=10772;function bySlug(e,t){return compareText(e.slug,t.slug)}
function seededFolds(e,t=FOLD_COUNT){let r=[...e].sort(bySlug),a=[...new Set(r.map(({familyKey:u})=>u))],n=mulberry32(FOLD_SEED),l=new Map;for(;a.
length>0;){let u=Math.floor(n()*a.length);l.set(a[u],l.size%t);let s=a.pop();u<a.length&&(a[u]=s)}let i=Array.from({length:t},()=>[]);for(let u of r)
i[l.get(u.familyKey)??-1]?.push(u);return i}function splitFolds(e){let t=e.flatMap((r,a)=>r.map(n=>({row:n,index:a}))).sort((r,a)=>bySlug(r.
row,a.row));return e.map((r,a)=>{let n=[];for(let{row:l,index:i}of t)i!==a&&n.push(l);return{train:n,test:r}})}function walkForwardSplit(e){
let t=e.filter(i=>i.listedAt!==null).sort((i,u)=>compareText(i.listedAt,u.listedAt)||bySlug(i,u)),r=Math.floor(t.length*.6),a=t[r-1]?.listedAt,
n=t.slice(r).filter(({listedAt:i})=>i!==a),l=new Set(n.map(({familyKey:i})=>i));return{train:t.filter(i=>!l.has(i.familyKey)).sort(bySlug),test:n}}
function matchesPredictions(e,t,r,a=false){return Array.isArray(e)&&e.length===t.length&&t.every((n,l)=>{let i=e[l],u=r(n);return i?.slug===
n.slug&&Number.isFinite(i.actual)&&(a?i.actual===u:Math.abs(i.actual-u)<=1e-9*Math.max(1,Math.abs(u)))&&Number.isFinite(i.predicted)&&(!a||i.
predicted>=0&&i.predicted<=1)})}function medianLogError(e){return median(e.map(({slug:t,actual:r,predicted:a})=>({slug:t,value:Math.abs(r-a)})))}
function ranks(e,t){let r=[...e].sort((l,i)=>l[t]-i[t]||compareText(l.slug,i.slug)),a=new Map,n=0;for(;n<r.length;){let l=n+1;for(;l<r.length&&
r[l]?.[t]===r[n]?.[t];)l++;for(let i of r.slice(n,l))a.set(i.slug,(n+1+l)/2);n=l}return a}function scorePredictions(e){let t=e.length,r=medianLogError(
e),a=ranks(e,"actual"),n=ranks(e,"predicted"),l=(t+1)/2,i=0,u=0,s=0;for(let{slug:d}of e){let g=(a.get(d)??l)-l,f=(n.get(d)??l)-l;i+=g*f,u+=g**
2,s+=f**2}let o=Math.sqrt(u*s);return{n:t,medianMultiplier:r===void 0?null:Math.exp(r),spearman:o===0?null:clamp(i/o,-1,1)}}function meanBrier(e){
return e.length?e.reduce((t,{actual:r,predicted:a})=>t+(r-a)**2,0)/e.length:null}function oddsValidationFolds(e){return[splitFolds(seededFolds(
e,10)),[walkForwardSplit(e)]]}function predictOddsFold({train:e,test:t},r){if(!e.length||!t.length)return[];let a=r(e);return t.map(n=>({slug:n.
slug,actual:n.label,predicted:a(n)}))}function predictOddsFolds(e,t){return e.map(r=>r.map(a=>predictOddsFold(a,t)))}function scoreOddsFolds(e){
return e.map(t=>meanBrier(t.flat()))}function scoreOdds(e,t){return scoreOddsFolds(predictOddsFolds(e,t))}function statusPredictor(e,t,r){let{
shares:a,clock:n,coefficients:l,medianAgeDays:i}=fitOddsModel(e,t,r);return u=>sigmoid(linearScore(oddsFeatures(u,t,a,n,i),l))}function selectOddsTerms(e,t=oddsValidationFolds(
e)){return oddsSelection(t,false)}function oddsSelection(e,t){let[r=[],a=[]]=e,n=new Map(e.flat().filter(({train:l,test:i})=>l.length&&i.length).
map(({train:l})=>[l,prepareOddsFit(l)]));return selectTerms(ODDS_CANDIDATES,(l,i)=>{let u=o=>statusPredictor(o,l,n.get(o));if(!t)return scoreOdds(
e,u);let s=scoreOdds([a],u)[0]??null;return i&&(s===null||i[1]==null||s>=i[1])?[null,s]:[scoreOdds([r],u)[0]??null,s]})}function fitOuterOddsFold(e){
return predictOddsFold(e,t=>statusPredictor(t,oddsSelection(oddsValidationFolds(t),true).terms))}var oddsKeys=["model","baseRate","pava","cl\
ockOnly"];function oddsScores(e){return{scores:scoreOddsFolds(e.model),baselines:{baseRate:scoreOddsFolds(e.baseRate),pava:scoreOddsFolds(e.
pava),clockOnly:scoreOddsFolds(e.clockOnly)}}}function scoreOddsEvidence(e,t){let r=oddsValidationFolds(e);for(let a of oddsKeys){let n=t?.[a];
if(!Array.isArray(n)||n.length!==r.length)return null;for(let[l,i]of r.entries()){let u=n[l];if(!Array.isArray(u)||u.length!==i.length)return null;
for(let[s,{train:o,test:d}]of i.entries())if(!matchesPredictions(u[s],o.length?d:[],g=>g.label,true))return null}}return oddsScores(t)}var PLACEBO_SEED=10675;
function growthPlacebo(e,t,r,a=PLACEBO_SEED){let n=mulberry32(a),l=new Map(e.map(({slug:c},p)=>[c,p])),i=new Map(e.map(c=>[c,{...c}])),u=c=>i.
get(c),s=new Map,o=oddsValidationFolds(e).map(c=>c.map(({train:p,test:h})=>{let m=p.map(u);return p.length&&h.length&&s.set(m,prepareOddsFit(
m)),{train:m,test:h.map(u)}})),d=c=>statusPredictor(c,t,s.get(c)),g=scoreOdds(o,d),f=g.map(()=>0);for(let c=0;c<r;c++){let p=e.map(h=>h.growth);
for(let h=p.length-1;h>0;h--){let m=Math.floor(n()*(h+1)),v=p[h];p[h]=p[m],p[m]=v}for(let[h,m]of i)m.growth=p[l.get(h.slug)??-1]??h.growth;scoreOdds(
o,d).forEach((h,m)=>{let v=g[m];h!==null&&v!=null&&h<=v&&(f[m]=(f[m]??0)+1)})}return{shuffles:r,seed:a,real:g,asGoodOrBetter:g.map((c,p)=>c===
null?null:(f[p]??0)/r)}}var{fitHuber,medianInPlace}=window.Radar?.support??{};var{diagonalPenalty,stabilizeRidge}=window.Radar?.support??{};
//! Ridge uses unit weights.
function fitRidge(e,t,r,a=[],n=true){let l=diagonalPenalty(a.length+3,t);for(let[s,o]of a.entries())l[s+1]=[0,...o.slice(0,s+1)];let i=e.every(
({tvl:s,age:o,target:d})=>Number.isFinite(s)&&Number.isFinite(o)&&Number.isFinite(d))&&a.every(s=>s.every(o=>!Object.is(o,-0)))?{rows:e}:e.map(
({group:s,tvl:o,age:d})=>[1,...a.map((g,f)=>+(s===f+1)),o,d]),u="rows"in i?[]:e.map(({target:s})=>s);//! For collinear unpenalized slopes, keep TVL and fix the final column (age) at zero.
return fitHuber(i,u,l,r,t>0?void 0:(s,o)=>stabilizeRidge(s,o,t===0?2:void 0),n)}var FITTED_KEYS=["lnTvl","lnAge"];function valueFeatures(e,t,r){
let a=[];return e.change_7d===null&&a.push("growth-missing"),e.listed_at===null&&a.push("age-missing"),{features:{lnTvl:Math.log(e.tvl_usd),
lnAge:e.listed_at===null?r:logAge(e.listed_at,t),growth:logMomentum(e.change_7d)},flags:a}}function prepareFit(e,t,r){let a=e.length;if(a===
0)throw new Error("The value model needs at least one traded comparable.");let n=medianAge(e),l=featureStats(e.map(({lnTvl:d})=>d)),i=featureStats(
e.map(({lnAge:d})=>d??n)),u=e.reduce((d,g)=>d+g.target,0)/a,s=t==="tvl"?0:l.scale,o=t==="age"?0:i.scale;return{design:e.map(d=>({target:d.target-
u,tvl:s?(d.lnTvl-l.mean)/s:0,age:o?((d.lnAge??n)-i.mean)/o:0,group:r?.groupBySlug.get(d.slug)??0})),targetMean:u,tvlScale:s,ageScale:o,metadata:{
n:a,medianLnAge:n,featureMeans:{lnTvl:l.mean,lnAge:i.mean},featureRanges:{lnTvl:l.range,lnAge:i.range}}}}function medianAge(e){let t=new Float64Array(
e.length),r=0;for(let{lnAge:a}of e)if(a!==null){if(!Number.isFinite(a)||Object.is(a,-0))return median(e.flatMap(({slug:n,lnAge:l})=>l===null?
[]:[{slug:n,value:l}]))??0;t[r++]=a}return medianInPlace(t.subarray(0,r))}function restoreCoefficients({targetMean:e,tvlScale:t,ageScale:r,metadata:{
featureMeans:a}},n,l,i){let u=t?l/t:0,s=r?i/r:0;return{intercept:e+n-u*a.lnTvl-s*a.lnAge,lnTvl:u,lnAge:s}}function fitValueModel(e,t,{drop:r,
robust:a=true,momentum:n=true,reportScale:l=true}={},i){let u=prepareFit(e,r,i),{coefficients:s,huberScale:o}=fitRidge(u.design,t,a,i?.penalty,
l),d=i?.groups.length??1,g=i?.contrastShares.reduce((c,p,h)=>c+p*(s[h+1]??0),0)??0,f=i&&categoryTotals();return i?.groups.forEach((c,p)=>{f&&
(f[c]=(p?s[p]??0:0)-g)}),{...u.metadata,lambda:t,momentum:n,huberScale:o,coefficients:restoreCoefficients(u,(s[0]??0)+g,s[d]??0,s[d+1]??0),...f&&
{categoryEffects:f}}}function logValue({lnTvl:e,growth:t,lnAge:r,category:a},{coefficients:n,momentum:l=true,categoryEffects:i}){return n.intercept+
n.lnTvl*(e+(l?t:0))+n.lnAge*r+(i?.[a??"other"]??0)}function predictValue(e,t,r){let a=valueFeatures(e,t,r.medianLnAge),{featureMeans:n,featureRanges:l,
coefficients:i}=r,{features:u}=a;r.categoryEffects&&(u.category=categoryGroup(e.category)),FITTED_KEYS.some(c=>{let{min:p,max:h}=l[c];return u[c]<
p||u[c]>h})&&a.flags.push("outside-comps-range");let{intercept:s,lnTvl:o,lnAge:d}=i,g=s+o*n.lnTvl+d*n.lnAge,f=Math.exp(logValue(u,r));return{
...a,valueUsd:f,launch_value_usd:clamp(Math.round(f),1,1e14),decomposition:{base:Math.exp(g),multipliers:{lnTvl:Math.exp(o*(u.lnTvl-n.lnTvl)),
growth:Math.exp(o*(r.momentum===false?0:u.growth)),lnAge:Math.exp(d*(u.lnAge-n.lnAge)),...r.categoryEffects&&{category:Math.exp(r.categoryEffects[u.
category??"other"])}}}}}function rankBoard(e,t,r){return e.map(a=>{let n=predictValue(a.protocol,t,r);return{...a,...n,implied_value_usd:Math.
max(1,Math.round(n.launch_value_usd*a.launchProbability12))}}).sort((a,n)=>n.implied_value_usd-a.implied_value_usd||compareText(a.protocol.slug,
n.protocol.slug)).map((a,n)=>({...a,rank:n+1}))}var VALUE_CANDIDATES=["momentum","age","category"];function predictionsFor(e,t){return e.map(
r=>({slug:r.slug,actual:r.target,predicted:t(r)}))}function predictComparable(e,t){let{lnTvl:r,growth:a,lnAge:n}=e,l=e.category;return logValue(
{lnTvl:r,growth:a,lnAge:n??t.medianLnAge,category:l??"other"},t)}function valueOptions(e){return{...!e.includes("age")&&{drop:"age"},momentum:e.
includes("momentum")}}function categoryDesign(e,t){let r=categoryTotals();for(let{category:u}of e)r[u]++;let a=Object.keys(r).filter(u=>r[u]>
0),n=a.map(u=>r[u]/e.length),l=new Map;for(let{slug:u,category:s}of e)l.set(u,a.indexOf(s));let i=n.slice(1);return{groups:a,groupBySlug:l,contrastShares:i,
penalty:i.map((u,s)=>i.map((o,d)=>t*((s===d?1:0)+n.length*u*o-u-o)))}}var VALUE_RIDGE_LAMBDA=.01,VALUE_CATEGORY_PENALTY=64;function refitValue(e,t,r=true){
let a=t.includes("category")?categoryDesign(e,VALUE_CATEGORY_PENALTY):void 0;return fitValueModel(e,VALUE_RIDGE_LAMBDA,{...valueOptions(t),reportScale:r},
a)}function predictValueTrial({train:e,test:t},r,a=refitValue){if(!e.length||!t.length)return[];let n=a(e,r);return predictionsFor(t,l=>predictComparable(
l,n))}function selectValueTerms(e,t){return valueSelection(e,t,false)}function valueSelection(e,t,r){let a=walkForwardSplit(e),n=u=>medianLogError(
predictValueTrial(a,u,t))??null;if(r){let u=n([]);if(u===null||!VALUE_CANDIDATES.some(s=>{let o=n([s]);return o!==null&&o<u}))return{terms:[],
steps:[],scores:[null,u]}}let l=e.length<2?[]:splitFolds(e.map(u=>[u])),i=t??refitValue;return selectTerms(VALUE_CANDIDATES,(u,s)=>{let o=n(
u);if(r&&s&&(o===null||s[1]==null||o>=s[1]))return[null,o];let d=l.map(({train:g,test:f})=>{let c=f[0];return{slug:c.slug,value:Math.abs(c.target-
predictComparable(c,i(g,u)))}});return[median(d)??null,o]})}function refitSelectedValue(e,t){return refitValue(e,valueSelection(e,t,true).terms)}
var TAIL_ALPHA=.1,MIN_BAND_FAMILIES=Math.ceil(1/TAIL_ALPHA);function leaveOneFamilyOut(e,t=refitSelectedValue){if(e.length<2)return[];let r=[
...e].sort((a,n)=>compareText(a.slug,n.slug));return r.map(a=>{let n=r.filter(i=>i!==a),l=typeof t=="number"?fitValueModel(n,t):t(n);return{
comparable:a,model:l,residual:a.target-predictComparable(a,l)}})}function jackknifePlusBand(e){let t=e.map(({slug:u,prediction:s,residual:o})=>({
slug:u,value:s+o})).sort((u,s)=>u.value-s.value||compareText(u.slug,s.slug)),r=u=>{let s=Math.floor((t.length+1)*u);return[t[s-1]?.value??-1/
0,t[t.length-s]?.value??1/0]},[a,n]=r(TAIL_ALPHA),[l,i]=r(.25);return{p10:a,p25:l,p75:i,p90:n}}function jackknifePlusBands(e,t=refitSelectedValue){
let r=new Map;if(e.length<3)return r;for(let a of e){let n=e.filter(i=>i!==a),l=leaveOneFamilyOut(n,t).map(({comparable:i,model:u,residual:s})=>({
slug:i.slug,prediction:predictComparable(a,u),residual:s}));r.set(a.slug,jackknifePlusBand(l))}return r}function rangeHonesty(e){let t=(r,a,n)=>{
let l=0,i=0;for(let u of e){let s=u[r],o=u[a];s===null||o===null||!Number.isFinite(s)||!Number.isFinite(o)||s>o||(i++,s<=u.actual&&u.actual<=
o&&l++)}return{stated:n,covered:l,n:i}};return{middle:t("p25","p75",.5),broad:t("p10","p90",.8)}}function describeBoardValues(e,t,r,a){let n=new Map(
e.map(s=>[s.protocol.slug,{row:s,samples:[],influence:null}]));for(let{comparable:{slug:s,familyKey:o},model:d,residual:g}of r)for(let f of rankBoard(
e,a,d)){let c=n.get(f.protocol.slug);if(!c)throw new Error("Missing board row for a valuation refit.");c.samples.push({slug:s,prediction:logValue(
f.features,d),residual:g});let p=f.rank-c.row.rank,h=c.influence,m=Math.abs(p),v=Math.abs(h?.rank_delta??0);(!h||m>v||m===v&&compareText(s,h.
slug)<0)&&(c.influence={slug:s,family_key:o,rank_delta:p})}let{tvlScale:l,ageScale:i,metadata:{medianLnAge:u}}=prepareFit(t);return[...n.values()].
map(({row:s,samples:o,influence:d})=>{let{p10:g,p90:f}=jackknifePlusBand(o),c=y=>clamp(Math.exp(y),1,1e14)*s.launchProbability12,{lnTvl:p,lnAge:h}=s.
features,m=t.map(y=>{let M=l?(y.lnTvl-p)/l:0,E=i?((y.lnAge??u)-h)/i:0;return{slug:y.slug,distance:M**2+E**2}}).sort((y,M)=>y.distance-M.distance||
compareText(y.slug,M.slug)).slice(0,5).map(({slug:y})=>y),v={interval_p10_usd:Math.max(1,Math.floor(c(g))),interval_p90_usd:Math.max(1,Math.
ceil(c(f))),influence:d,twins:m};return{protocol:s.protocol,diagnostics:v}})}function inputEffectContrasts(e,t,r,a){let n=protocolOdds(a,e,t),
l=predictValue(e,t,r),i=n.launchProbability12,u=(g,f,c)=>{let p=l.features,h=g.features,{lnTvl:m,lnAge:v}=r.coefficients,y=r.momentum?h.growth-
p.growth:0,M=c===void 0?-1:a.terms.indexOf(c),E=c===void 0?f:i;if(c!==void 0&&M>=0){let[b,...w]=a.coefficients,T=(w[M+1]??NaN)*(h[c]-p[c]);E=
protocolOdds({...a,coefficients:[(b??NaN)+T,...w]},e,t).launchProbability12}return[(g.valueUsd*f/(l.valueUsd*i)-1)*100,100*Math.expm1(m*(h.lnTvl-
p.lnTvl+y)+v*(h.lnAge-p.lnAge)+Math.log(E/i))]},s=(g,f)=>u(predictValue(g,t,r),protocolOdds(a,g,t).launchProbability12,f),o=new Date(Date.parse(
t)+YEAR_DAYS*864e5).toISOString(),d=e.listed_at===null&&r.coefficients.lnAge?{...r,medianLnAge:Math.log(Math.exp(r.medianLnAge)+YEAR_DAYS)}:
r;return[s({...e,tvl_usd:e.tvl_usd*1.1},"lnTvl"),s({...e,change_7d:(e.change_7d??0)+10},"growth"),u(predictValue(e,o,d),n.oddsAt(n.oddsAge+YEAR_DAYS))]}
function impliedValueEffects(e,t,r,a){let[n,l,i]=inputEffectContrasts(e,t,r,a);return[n[0],l[0],i[0]]}function coefficientEffects(e,t,r,a){let[
n,l,i]=inputEffectContrasts(e,t,r,a);return[n[1],l[1],i[1]]}function summarizeEffects(e){return[0,1,2].map(t=>{let r=[...e];if(r.some(([,l])=>!Number.
isFinite(l[t])))return[NaN,NaN,NaN];r.sort(([l,i],[u,s])=>i[t]-s[t]||compareText(l,u));let a=r.length,n=l=>r[l]?.[1][t]??NaN;return[(n(Math.
floor((a-1)/2))+n(Math.floor(a/2)))/2,n(Math.ceil(.1*a)-1),n(Math.ceil(.9*a)-1)]})}function logMedianRatio(e){let t=Math.floor(e.length/2),r=e[t]?.
logRatio,a=e[t-1]?.logRatio;if(r===void 0)throw new Error("A multiple needs at least one traded comparable.");return e.length%2===0&&a!==void 0?
r+Math.log1p(Math.exp(a-r))-Math.LN2:r}function fitMultiples(e){let t=e.map(n=>({slug:n.slug,category:n.category,logRatio:n.target-n.lnTvl})).
sort((n,l)=>n.logRatio-l.logRatio||compareText(n.slug,l.slug)),r=new Map;for(let n of t){let l=r.get(n.category);l?l.push(n):r.set(n.category,
[n])}let a={};for(let[n,l]of r)a[n]=logMedianRatio(l);return{flat:logMedianRatio(t),category:a}}var schemes=["leaveOneFamilyOut","seededFive\
Fold","walkForward"],models=["model","flatMultiple","categoryMultiple"];function fitOuterFold(e){let{train:t,test:r}=e,a=t.length&&r.length?
selectValueTerms(t).terms:[],n=foldPredictions(e,predictValueTrial(e,a));return{terms:a,lambda:VALUE_RIDGE_LAMBDA,predictions:n}}function foldPredictions({
train:e,test:t},r){let a={model:r,flatMultiple:[],categoryMultiple:[]};if(e.length&&t.length){let{flat:n,category:l}=fitMultiples(e);a.flatMultiple=
predictionsFor(t,i=>n+i.lnTvl),a.categoryMultiple=predictionsFor(t,i=>(l[i.category]??n)+i.lnTvl)}return a}function scoreValueFolds(e){return{
model:scorePredictions(e.flatMap(({model:t})=>t)),flatMultiple:scorePredictions(e.flatMap(({flatMultiple:t})=>t)),categoryMultiple:scorePredictions(
e.flatMap(({categoryMultiple:t})=>t))}}function valueValidationFolds(e){return{leaveOneFamilyOut:splitFolds(e.map(t=>[t])),seededFiveFold:splitFolds(
seededFolds(e)),walkForward:[walkForwardSplit(e)]}}function scoreValueEvidence(e,t){let r=valueValidationFolds(e);for(let a of schemes){let n=t?.[a];
if(!Array.isArray(n)||n.length!==r[a].length)return null;for(let[l,{train:i,test:u}]of r[a].entries())if(!models.every(s=>matchesPredictions(
n[l]?.[s],i.length?u:[],o=>o.target)))return null}return{leaveOneFamilyOut:scoreValueFolds(t.leaveOneFamilyOut),seededFiveFold:scoreValueFolds(
t.seededFiveFold),walkForward:scoreValueFolds(t.walkForward)}}function resample(e,t){return e.map(()=>e[Math.floor(t()*e.length)])}function bootstrapSummary(e){
let t=e.length,r=new Map;for(let{ranked:l}of e)l.forEach((i,u)=>{let s=r.get(i)??[];s.push(u+1),r.set(i,s)});let a=new Map([...r].map(([l,i])=>(i.
sort((u,s)=>u-s),[l,{rank_p10:i[Math.ceil(.1*t)-1],rank_p90:i[Math.ceil(.9*t)-1]}]))),n=(e[0]?.coefficients??[]).map((l,i)=>{let u=e.map(({coefficients:o})=>o[i]);
if(t<2||!u.every(Number.isFinite))return null;let s=u.reduce((o,d)=>o+d,0)/t;return Math.sqrt(u.reduce((o,d)=>o+(d-s)**2,0)/(t-1))});return{
ranks:a,standardErrors:n}}var EVIDENCE_REPLICATES=200,BOOTSTRAP_SEEDS=[10673,10674];function bootstrapRadar(e,t,r,a,n,l,i,u=EVIDENCE_REPLICATES,s=BOOTSTRAP_SEEDS){
let[o,d]=s,g=mulberry32(o),f=mulberry32(d),c=Object.keys(a.coefficients),p=Object.keys(a.categoryEffects??{}),{ranks:h,standardErrors:m}=bootstrapSummary(
Array.from({length:u},()=>{let y=refitValue(resample(t,g),n),M=fitOddsModel(resample(r,f),l.terms),E=e.map(({protocol:b,status:w,boardReasons:T,
reason:F,familyKey:S})=>({protocol:b,status:w,boardReasons:T,reason:F,familyKey:S,launchProbability12:protocolOdds(M,b,i,bootstrapProbability12).
launchProbability12}));return{ranked:rankBoard(E,i,y).map(({protocol:b})=>b.slug),coefficients:[...c.map(b=>y.coefficients[b]),...p.map(b=>y.
categoryEffects?.[b]??0),...M.coefficients]}})),v=c.length+p.length;return{ranks:h,replicates:u,seeds:s,valueErrors:Object.fromEntries([...c,
...p].map((y,M)=>[y,m[M]??null])),oddsErrors:m.slice(v)}}function radarInputs({protocols:e,as_of:t}){let r=groupFamilies(e),a=buildCensus(e,
r),n=groupComparableCategories(comparablesFromFamilies(r,t),r);return{families:r,entries:a,comparables:n,population:oddsPopulation(a,t)}}function rankRadar({
watchlist:e,as_of:t},r,a,n,l){checkClockCoefficient(n.coefficients[1]);let i=boardEntries(r,e).map(s=>({...s,...protocolOdds(n,s.protocol,t)})),
u=farmExitThresholds(r,l.playbooks);return rankBoard(i,t,a).map(s=>{let{protocol:o,launch_value_usd:d,launchProbability12:g}=s,f=makeFarmPlan(
o,l,{launchProbability12:g,exitThreshold:u.get(farmGroup(o.category))??null});return{...s,plan:f,economics:estimateFarmEconomics(f,d,o.tvl_usd,
g)}})}function recomputeRadar(e,{terms:t},r,a){let{families:n,entries:l,comparables:i,population:u}=radarInputs(e),s=refitValue(i,t),o=fitOddsModel(
u,r);return{model:s,odds:o,board:rankRadar(e,l,s,o,a),families:n,comparables:i,population:u,census:censusRecords(l),houseRule:houseRuleMembership(
e)}}function readPublishedSnapshot({meta:e,protocols:t,watchlist:r}){if(!Array.isArray(t)||!Array.isArray(r)||t.length!==e?.protocolCount)return null;
let{as_of:a,floor_usd:n,source:l}=e;return{as_of:a,floor_usd:n,source:l,protocols:t,watchlist:r}}function reproduceSelection({comparables:e,
population:t}){return{value:selectValueTerms(e),odds:selectOddsTerms(t)}}function reproduceDiagnostics({board:e,comparables:t,population:r,model:a,
odds:n},l,i,u,s){return{bootstrap:bootstrapRadar(e,t,r,a,l,n,i,EVIDENCE_REPLICATES,u),placebo:growthPlacebo(r,n.terms,EVIDENCE_REPLICATES,s)}}
var browserApi={baseRate,LOGISTIC_PENALTY,VALUE_CATEGORY_PENALTY,BOOTSTRAP_SEEDS,PLACEBO_SEED,fitOuterFold,fitOuterOddsFold,jackknifePlusBands,
describeBoardValues,coefficientEffects,impliedValueEffects,summarizeEffects,rangeHonesty,reproduceSelection,scoreValueEvidence,scoreOddsEvidence,
reproduceDiagnostics,MIN_BAND_FAMILIES,depositAmounts,farmEconomicsTerms,makeFarmPlan,farmAssumptions:defaults,estimateFarmEconomics,formatUsd,
compareText,daysBetween,logValue,buildRadar:recomputeRadar,readPublishedSnapshot};Object.assign(window.Radar??={},browserApi);
})();
