var Radar=(()=>{var __defProp=Object.defineProperty;var __getOwnPropDesc=Object.getOwnPropertyDescriptor;var __getOwnPropNames=Object.getOwnPropertyNames;var __hasOwnProp=Object.prototype.hasOwnProperty;var __export=(target,all)=>{for(var name in all)__defProp(target,name,{get:all[name],enumerable:true})};
var __copyProps=(to,from,except,desc)=>{if(from&&typeof from==="object"||typeof from==="function"){for(let key of __getOwnPropNames(
from))if(!__hasOwnProp.call(to,key)&&key!==except)__defProp(to,key,{get:()=>from[key],enumerable:!(desc=
__getOwnPropDesc(from,key))||desc.enumerable})}return to};var __toCommonJS=mod=>__copyProps(__defProp({},"__esModule",{value:true}),mod);var browser_api_exports={};__export(browser_api_exports,{buildRadar:()=>recomputeRadar,daysBetween:()=>daysBetween,
farmAssumptions:()=>FARM_ASSUMPTIONS,formatUsd:()=>formatUsd,planPortfolio:()=>planPortfolio,readPublishedSnapshot:()=>readPublishedSnapshot});var ASSUMPTIONS_AS_OF="2026-11-14";var FARM_ASSUMPTIONS={asOf:ASSUMPTIONS_AS_OF,airdropShareOfLaunchCap:.25,
farmerHaircut:.5,hourlyRateUsd:25,capitalApr:{yieldBearing:.02,nonYielding:.05},horizonMonths:12,monthsPerYear:12,
weeksPerYear:52,minutesPerHour:60,farmThreshold:1.5,thinThreshold:.75,depositsUsd:[1e3,1e4],tradeVolumeUsd:200,
tradingFeeRate:6e-4,setupMinutes:5,bridgeMinutes:10};function compareText(first,second){if(first<second)return-1;if(first>second)return 1;return 0}function formatUsd(value){const[whole="0",cents]=Math.abs(value).toFixed(2).split(".");const grouped=whole.
replace(/\B(?=(\d{3})+(?!\d))/g,",");const fraction=cents&&cents!=="00"?`.${cents}`:"";return`${value<
0?"-":""}$${grouped}${fraction}`}function farmEconomicsTerms(plan,valueUsd,tvlUsd,launchProbability,settings=FARM_ASSUMPTIONS){const fixedCosts=plan.
totalCostUsd+plan.totalMinutes/settings.minutesPerHour*settings.hourlyRateUsd;const horizonYears2=settings.
horizonMonths/settings.monthsPerYear;const capitalCarry=plan.capitalApr*horizonYears2;const k=valueUsd*
settings.airdropShareOfLaunchCap*launchProbability*settings.farmerHaircut/tvlUsd;return{fixedCosts,horizonYears:horizonYears2,
capitalCarry,k}}function estimateFarmEconomics(plan,valueUsd,tvlUsd,launchProbability){const{fixedCosts,
horizonYears:horizonYears2,capitalCarry,k}=farmEconomicsTerms(plan,valueUsd,tvlUsd,launchProbability);
const atDeposit=depositUsd=>{const expectedValueUsd=k*depositUsd;const costUsd=fixedCosts+depositUsd*
capitalCarry;const ratio=expectedValueUsd/costUsd;const verdict=ratio>=FARM_ASSUMPTIONS.farmThreshold?
"FARM":ratio>=FARM_ASSUMPTIONS.thinThreshold?"THIN":"SKIP";return{depositUsd,expectedValueUsd,costUsd,
verdict}};const[small,large]=FARM_ASSUMPTIONS.depositsUsd;return{launchProbability12:launchProbability,
airdropYieldApr:k/horizonYears2,deposits:[atDeposit(small),atDeposit(large)],breakEvenDepositUsd:k>capitalCarry?
fixedCosts/(k-capitalCarry):"never"}}function renderEconomics({deposits:[atDeposit],breakEvenDepositUsd}){
const{depositUsd,expectedValueUsd,costUsd,verdict}=atDeposit;const breakEven=breakEvenDepositUsd==="\
never"?"never":`≈ ${formatUsd(breakEvenDepositUsd)}`;return`Economics at ${formatUsd(depositUsd)} \
over ${FARM_ASSUMPTIONS.horizonMonths} months · expected airdrop ≈ ${formatUsd(expectedValueUsd)}\
 vs cost ≈ ${formatUsd(costUsd)} → ${verdict}. Break-even deposit ${breakEven}. Assumes ${FARM_ASSUMPTIONS.
airdropShareOfLaunchCap*100}% of circulating launch cap because a mostly unlocked airdrop can accoun\
t for much of a small launch float.`}var DEFAULT_DEPOSIT_USD=FARM_ASSUMPTIONS.depositsUsd[0];var horizonYears=FARM_ASSUMPTIONS.horizonMonths/
FARM_ASSUMPTIONS.monthsPerYear;var occurrences={once:1,weekly:Math.floor(FARM_ASSUMPTIONS.weeksPerYear*
horizonYears),monthly:FARM_ASSUMPTIONS.horizonMonths};function estimate(chain,gasTransactions,bridgeTransfers,{
chains,fallback}){const fees=chain!==null&&Object.hasOwn(chains,chain)?chains[chain]:void 0;const[transactionUsd,
bridgeUsd]=fees??fallback;const cost=roundUsd(bridgeTransfers*bridgeUsd+gasTransactions*transactionUsd);
return{chain,transactionUsd,bridgeUsd,cost,feeAssumed:fees===void 0}}function chooseChain(chains,gasTransactions,bridgeTransfers,gas){
let cheapest;for(const chain of chains){const candidate=estimate(chain,gasTransactions,bridgeTransfers,
gas);if(!cheapest||candidate.cost<cheapest.cost||candidate.cost===cheapest.cost&&compareText(chain,cheapest.
chain??"")<0){cheapest=candidate}}return cheapest??estimate(null,gasTransactions,bridgeTransfers,gas)}
function shorten(text,max){const normalized=text.trim().replace(/\s+/g," ");if(normalized.length<=max)
return normalized;return`${normalized.slice(0,max-1).trimEnd()}…`}function roundUsd(value){return Math.
round(value*100)/100}function makeFarmPlan(protocol,{playbooks,gas},depositUsd=DEFAULT_DEPOSIT_USD){
if(!Number.isFinite(depositUsd)||depositUsd<=0){throw new Error("The farm plan needs a positive, fin\
ite deposit size.")}const category=protocol.category?.trim().toLowerCase()??"";const[group,playbook]=Object.
entries(playbooks).find(([,book])=>book.categories.includes(category))??["generic",playbooks.generic];
const bridge=group==="bridge";const repeats=occurrences[playbook.cadence];const[entryTransactions,reviewTransactions,
exitTransactions]=playbook.transactions;const{chain,transactionUsd,bridgeUsd,feeAssumed}=chooseChain(
protocol.chains,(bridge?0:entryTransactions)+reviewTransactions*repeats+exitTransactions,bridge?entryTransactions:
1,gas);const[entryMinutes,reviewMinutes,exitMinutes]=playbook.minutes;const tradingFees=group==="der\
ivatives"?FARM_ASSUMPTIONS.tradeVolumeUsd*FARM_ASSUMPTIONS.tradingFeeRate:0;const deposit=formatUsd(
depositUsd);const fundingStep=bridge?null:{action:"If funding from another chain, verify the receivi\
ng asset and bridge funds.",chain,costUsd:bridgeUsd,minutes:FARM_ASSUMPTIONS.bridgeMinutes,cadence:"\
once"};const steps=[{action:chain===null?`Verify a supported chain before setting aside ${deposit} a\
nd gas.`:`Set aside ${deposit} in a compatible wallet or account and check its gas balance.`,chain,costUsd:0,
minutes:FARM_ASSUMPTIONS.setupMinutes,cadence:"once"}];if(fundingStep)steps.push(fundingStep);steps.
push({action:`${shorten(protocol.name,140)} — ${playbook.enter}`,chain,costUsd:roundUsd(entryTransactions*
(bridge?bridgeUsd:transactionUsd)),minutes:entryMinutes,cadence:"once"},{action:playbook.review,chain,
costUsd:roundUsd(tradingFees+reviewTransactions*transactionUsd),minutes:reviewMinutes,cadence:playbook.
cadence},{action:playbook.exit,chain,costUsd:roundUsd(exitTransactions*transactionUsd),minutes:exitMinutes,
cadence:"once",exitCondition:playbook.exitCondition});let oneTimeCostUsd=0;let recurringCostUsd=0;let totalMinutes=0;
for(const{costUsd,minutes,cadence}of steps){const count=occurrences[cadence];if(cadence==="once")oneTimeCostUsd+=
costUsd;else recurringCostUsd+=costUsd*count;totalMinutes+=minutes*count}return{chain,depositUsd,steps,
fundingStep,flags:feeAssumed?["fee-assumed"]:[],assumptionsAsOf:FARM_ASSUMPTIONS.asOf,horizonMonths:FARM_ASSUMPTIONS.
horizonMonths,capitalApr:playbook.capitalApr,oneTimeCostUsd:roundUsd(oneTimeCostUsd),recurringCostUsd:roundUsd(
recurringCostUsd),totalCostUsd:roundUsd(oneTimeCostUsd+recurringCostUsd),totalMinutes}}function scheduleFarmMinutes({
steps}){const weeks=Array(occurrences.weekly).fill(0);const addMinutes=(week,minutes)=>{weeks[week]=
(weeks[week]??0)+minutes};for(const{cadence,minutes,exitCondition}of steps){if(cadence==="weekly"){for(let week=0;week<
weeks.length;week++)addMinutes(week,minutes)}else if(cadence==="monthly"){for(let month=1;month<=occurrences.
monthly;month++){const monthEnd=Math.ceil(month*weeks.length/occurrences.monthly)-1;addMinutes(monthEnd,
minutes)}}else{addMinutes(exitCondition===void 0?0:weeks.length-1,minutes)}}return weeks}function renderFarmStep(step){
const action=shorten(step.action,280);const chain=shorten(step.chain??"Chain unlisted",110);const exit=step.
exitCondition?` | Exit · ${shorten(step.exitCondition,100)}`:"";return`${action} | ${chain} | Est. \
fee ${formatUsd(step.costUsd)} | ${step.minutes} minutes | ${step.cadence}${exit}`}var deposits=[1e3,2500,5e3,1e4];function planPortfolio(rows,{budgetUsd,hoursPerWeek,chains,assumptions}){
if(assumptions.horizonMonths!==FARM_ASSUMPTIONS.horizonMonths){throw new Error("The farm planner onl\
y supports a 12-month horizon.")}const permitted=chains&&new Set(chains);const usedMinutesByWeek=Array(
FARM_ASSUMPTIONS.weeksPerYear).fill(0);const weeklyCapMinutes=hoursPerWeek*assumptions.minutesPerHour;
const minutesPerAverageWeeklyHour=usedMinutesByWeek.length*assumptions.minutesPerHour;const candidates=rows.
map(({protocol,rank,plan,economics,implied_value_usd})=>{const supported=[...new Set(protocol.chains)].
sort(compareText);const choices=supported.length?supported:[null];const plans=choices.flatMap(chain=>{
if(permitted&&(chain===null||!permitted.has(chain)))return[];const option=chain===plan.chain||chain===
null?plan:makeFarmPlan({...protocol,chains:[chain]},assumptions.tables);return[{option,schedule:scheduleFarmMinutes(
option)}]});return{slug:protocol.slug,rank,plans,valueUsd:implied_value_usd,tvlUsd:protocol.tvl_usd,
probability:economics.launchProbability12}});const funded=new Set;const selected=new Set;const positions=[];
let feesCents=0;const totals={depositUsd:0,feesUsd:0,cashUsd:0,hoursPerWeek:0,expectedValueUsd:0,costUsd:0,
netUsd:0};function offers({slug,plans,valueUsd,tvlUsd,probability}){return plans.flatMap(({option,schedule})=>{
const{chain,fundingStep}=option;const waived=chain!==null&&funded.has(chain)?fundingStep:null;const feeCents=Math.
round((option.totalCostUsd-(waived?.costUsd??0))*100);const totalMinutes=option.totalMinutes-(waived?.
minutes??0);const weeklyMinutes=waived?schedule.map((minutes,week)=>week===0?minutes-waived.minutes:
minutes):schedule;const withinHours=weeklyMinutes.every((minutes,week)=>(usedMinutesByWeek[week]??0)+
minutes<=weeklyCapMinutes);const{fixedCosts,capitalCarry,k}=farmEconomicsTerms({totalCostUsd:feeCents/
100,totalMinutes,capitalApr:option.capitalApr},valueUsd,tvlUsd,probability,assumptions);return deposits.
map(depositUsd=>{const expectedValueUsd=k*depositUsd;const costUsd=fixedCosts+capitalCarry*depositUsd;
const netUsd=expectedValueUsd-costUsd;const position={slug,chain,depositUsd,feesUsd:feeCents/100,hoursPerWeek:totalMinutes/
minutesPerAverageWeeklyHour,expectedValueUsd,costUsd,netUsd};return{position,feeCents,weeklyMinutes,
fundsChain:fundingStep!==null,score:netUsd/(depositUsd+position.feesUsd),affordable:totals.depositUsd+
depositUsd+(feesCents+feeCents)/100<=budgetUsd,withinHours}})})}for(;;){let best;for(const candidate of candidates){
if(selected.has(candidate.slug))continue;for(const offer of offers(candidate)){if(!(offer.position.netUsd>
0&&offer.affordable&&offer.withinHours))continue;if(!best||offer.score>best.score||offer.score===best.
score&&compareText(candidate.slug,best.position.slug)<0){best=offer}}}if(!best)break;const{position}=best;
positions.push(position);selected.add(position.slug);if(position.chain!==null&&best.fundsChain)funded.
add(position.chain);feesCents+=best.feeCents;for(const[week,minutes]of best.weeklyMinutes.entries()){
usedMinutesByWeek[week]=(usedMinutesByWeek[week]??0)+minutes}totals.depositUsd+=position.depositUsd;
totals.expectedValueUsd+=position.expectedValueUsd;totals.costUsd+=position.costUsd;totals.netUsd+=position.
netUsd}totals.feesUsd=feesCents/100;totals.cashUsd=totals.depositUsd+totals.feesUsd;totals.hoursPerWeek=
usedMinutesByWeek.reduce((sum,minutes)=>sum+minutes,0)/minutesPerAverageWeeklyHour;const remaining=candidates.
filter(({slug})=>!selected.has(slug));const rejected=remaining.sort((a,b)=>a.rank-b.rank||compareText(
a.slug,b.slug)).slice(0,15).map(candidate=>{const options=offers(candidate);const positive=options.filter(
({position})=>position.netUsd>0);const feasible=positive.length?positive:options;const affordable=feasible.
filter(offer=>offer.affordable);let reason="non-positive";if(!options.length)reason="chain-excluded";else if(!affordable.
length)reason="over-budget";else if(!affordable.some(offer=>offer.withinHours))reason="over-hours";return{
slug:candidate.slug,reason}});const closest=positions.length?[]:remaining.flatMap(candidate=>{let best;
for(const{position,affordable,withinHours}of offers(candidate)){if(affordable&&withinHours&&(!best||
position.netUsd>best.netUsd)){best=position}}return best?[{...best,shortfallUsd:Math.max(0,-best.netUsd)}]:
[]}).sort((a,b)=>a.shortfallUsd-b.shortfallUsd||compareText(a.slug,b.slug)).slice(0,5);return{positions,
totals,rejected,closest}}var DAY_MS=864e5;function daysBetween(fromIso,toIso){return(Date.parse(toIso)-Date.parse(fromIso))/DAY_MS}function familyKey({slug,gecko_id}){return gecko_id===null?`slug:${slug}`:`gecko:${gecko_id}`}function groupFamilies(protocols){
const families=new Map;for(const protocol of[...protocols].sort((a,b)=>compareText(a.slug,b.slug))){
const{tvl_usd,mcap_usd}=protocol;const key=familyKey(protocol);const marketCap=mcap_usd!==null&&mcap_usd>
0?mcap_usd:null;const family=families.get(key);if(family){family.members.push(protocol);family.tvl_usd+=
tvl_usd;family.mcap_usd??=marketCap}else{families.set(key,{key,representative:protocol,members:[protocol],
tvl_usd,mcap_usd:marketCap})}}return[...families.values()]}var EXCLUDED_CATEGORIES=new Set(["Bridge","Canonical Bridge","Liquid Staking","Liquid Restaking","Re\
staked BTC","CEX"]);var VERSION_SUFFIX=/\s(?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)$/i;var PRODUCT_WORD=/(?<![\p{L}\p{M}\p{N}_])(?:wrapped|staked|staking)(?![\p{L}\p{M}\p{N}_])/iu;
var EXCHANGE_NAME=/^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)(?![\p{L}\p{M}\p{N}_])/iu;
function tokenFields({gecko_id,symbol}){if(gecko_id!==null)return symbol===null?"gecko_id":"gecko_id\
 and symbol";return symbol===null?null:"symbol"}function exclusionReason(protocol){const{category}=protocol;
if(category!==null&&EXCLUDED_CATEGORIES.has(category)){return`Category ${category} is excluded by th\
e house rule.`}const name=protocol.name.trim();if(VERSION_SUFFIX.test(name)){return"Name ends in a v\
ersion marker."}const productWord=name.match(PRODUCT_WORD)?.[0];if(productWord!==void 0){return`Name\
 contains the word “${productWord}”.`}const exchange=name.match(EXCHANGE_NAME)?.[0];return exchange===
void 0?null:`Name begins with an exchange name, “${exchange}”.`}function classify(protocol,marketCap=protocol.
mcap_usd){if(marketCap!==null&&marketCap>0){return{status:"traded",reason:"The family records a posi\
tive market cap."}}const fields=tokenFields(protocol);if(fields!==null){return{status:"token-unprice\
d",reason:`The protocol records a token via ${fields} without a positive market cap.`}}const reason=exclusionReason(
protocol);if(reason!==null)return{status:"excluded",reason};return{status:"pre-token",reason:"The pr\
otocol records no token."}}function buildCensus(protocols,families=groupFamilies(protocols)){const marketCaps=new Map(
families.map(({key,mcap_usd})=>[key,mcap_usd]));return protocols.map(protocol=>{const key=familyKey(
protocol);return{protocol,familyKey:key,...classify(protocol,marketCaps.get(key)??null)}})}function boardEntries(census,watchlist){const watchlisted=new Set(watchlist);const entries=[];for(const entry of census){
const boardReasons=[];if(entry.status==="pre-token")boardReasons.push("pre-token");if(watchlisted.has(
entry.protocol.slug))boardReasons.push("watchlist");if(boardReasons.length>0)entries.push({...entry,
boardReasons})}return entries}function clamp(value,min,max){return Math.min(max,Math.max(min,value))}function median(observations){
const sorted=[...observations].sort((a,b)=>a.value-b.value||compareText(a.slug,b.slug));const mid=Math.
floor(sorted.length/2);const upper=sorted[mid];const lower=sorted[mid-1];if(!upper)return void 0;return sorted.
length%2===0&&lower?(lower.value+upper.value)/2:upper.value}var YEAR_DAYS=365;function shareAt(points,age){let left=points[0];if(!left)return 0;if(age<=left.ageDays)return left.share;
for(const right of points){if(age<=right.ageDays){const fraction=(age-left.ageDays)/(right.ageDays-left.
ageDays);return left.share+fraction*(right.share-left.share)}left=right}return left.share}function launchProbability12(points,age){
const now=shareAt(points,age);if(now===1)return 0;return clamp((shareAt(points,age+YEAR_DAYS)-now)/(1-
now),0,1)}function logAge(listedAt,asOf){return Math.log(Math.max(1,daysBetween(listedAt,asOf)))}function logMomentum(change){
return change===null?0:Math.log1p(clamp(change,-50,100)/100)}function comparablesFromFamilies(families,asOf){
return families.flatMap(({key,representative,tvl_usd,mcap_usd})=>{if(mcap_usd===null)return[];const{
slug,listed_at,change_7d}=representative;return[{slug,familyKey:key,listedAt:listed_at,lnTvl:Math.log(
tvl_usd),lnAge:listed_at===null?null:logAge(listed_at,asOf),growth:logMomentum(change_7d),target:Math.
log(mcap_usd)}]})}function at(values,index){const value=values[index];if(value===void 0)throw new Error("Incomplete li\
near system.");return value}function choleskySolve(matrix,rhs){const n=matrix.length;if(rhs.length!==
n||matrix.some(row=>row.length!==n)){throw new Error("The linear system requires a square matrix and\
 a matching right-hand side.")}const lower=[];for(const[i,row]of matrix.entries()){const factorRow=[];
for(const[j,priorRow]of lower.entries()){let residual=at(row,j);for(const[k,value]of factorRow.entries()){
residual-=value*at(priorRow,k)}factorRow.push(residual/at(priorRow,j))}const diagonal=factorRow.reduce(
(sum,value)=>sum-value*value,at(row,i));if(!Number.isFinite(diagonal)||diagonal<=0){throw new Error(
"Cholesky factorization requires a positive-definite matrix.")}factorRow.push(Math.sqrt(diagonal));lower.
push(factorRow)}const y=[];for(const[i,row]of lower.entries()){let residual=at(rhs,i);for(const[j,value]of y.
entries())residual-=at(row,j)*value;y.push(residual/at(row,i))}const x=[];for(const[reverseIndex,row]of lower.
toReversed().entries()){const i=n-1-reverseIndex;let residual=at(y,i);for(let j=i+1;j<n;j++){const factorRow=lower[j];
if(!factorRow)throw new Error("Incomplete Cholesky factor.");residual-=at(factorRow,i)*at(x,j)}x[i]=
residual/at(row,i)}return x}var HUBER_K=1.345;var MAD_NORMAL_SCALE=1.4826;var MIN_SCALE=1e-8;var MAX_ITERATIONS=20;var TOLERANCE=1e-5;
function weightedRidge(rows,weights,lambda){let weightSum=0;let tvlSum=0;let ageSum=0;let targetSum=0;
let tvlSquared=0;let ageSquared=0;let tvlAge=0;let tvlTarget=0;let ageTarget=0;for(const[index,{tvl,
age,target}]of rows.entries()){const weight=weights[index]??1;const weightedTvl=weight*tvl;const weightedAge=weight*
age;weightSum+=weight;tvlSum+=weightedTvl;ageSum+=weightedAge;targetSum+=weight*target;tvlSquared+=weightedTvl*
tvl;ageSquared+=weightedAge*age;tvlAge+=weightedTvl*age;tvlTarget+=weightedTvl*target;ageTarget+=weightedAge*
target}if(lambda===0&&tvlSquared>0&&ageSquared>0&&tvlAge**2>=(1-8*Number.EPSILON)*tvlSquared*ageSquared){
return[...choleskySolve([[weightSum,tvlSum],[tvlSum,tvlSquared]],[targetSum,tvlTarget]),0]}return choleskySolve(
[[weightSum,tvlSum,ageSum],[tvlSum,(tvlSquared||1)+lambda,tvlAge],[ageSum,tvlAge,(ageSquared||1)+lambda]],
[targetSum,tvlTarget,ageTarget])}function medianInPlace(values){const middle=Math.floor(values.length/
2);let low=0;let high=values.length-1;while(low<high){const pivot=values[low+high>>>1]??0;let left=low;
let right=high;while(left<=right){while((values[left]??pivot)<pivot)left++;while((values[right]??pivot)>
pivot)right--;if(left<=right){const value=values[left]??pivot;values[left++]=values[right]??pivot;values[right--]=
value}}if(middle<=right)high=right;else if(middle>=left)low=left;else break}const upper=values[middle]??
0;if(values.length%2!==0)return upper;let lower=Number.NEGATIVE_INFINITY;for(let i=0;i<middle;i++)lower=
Math.max(lower,values[i]??upper);return(lower+upper)/2}function madScale(residuals,scratch){scratch.
set(residuals);const center=medianInPlace(scratch);for(let i=0;i<residuals.length;i++)scratch[i]=Math.
abs((residuals[i]??0)-center);return Math.max(MIN_SCALE,MAD_NORMAL_SCALE*medianInPlace(scratch))}function fitHuber(size,solve,evaluateResiduals,robust=true){
const weights=new Float64Array(size).fill(1);const residuals=new Float64Array(size);const scratch=new Float64Array(
size);let coefficients=solve(weights);evaluateResiduals(coefficients,residuals);let huberScale=madScale(
residuals,scratch);if(robust){for(let iteration=0;iteration<MAX_ITERATIONS;iteration++){const cutoff=HUBER_K*
huberScale;for(let i=0;i<residuals.length;i++){weights[i]=Math.min(1,cutoff/Math.abs(residuals[i]??0))}
const next=solve(weights);const converged=next.every((value,i)=>Math.abs(value-(coefficients[i]??0))<
TOLERANCE);coefficients=next;evaluateResiduals(coefficients,residuals);huberScale=madScale(residuals,
scratch);if(converged)break}}return{coefficients,huberScale}}function fitRidge(rows,lambda,robust){return fitHuber(
rows.length,weights=>weightedRidge(rows,weights,lambda),([intercept=0,tvlSlope=0,ageSlope=0],residuals)=>{
let i=0;for(const{target,tvl,age}of rows){residuals[i++]=target-(intercept+tvlSlope*tvl+ageSlope*age)}},
robust)}var FITTED_KEYS=["lnTvl","lnAge"];function valueFeatures(protocol,asOf,medianLnAge){const flags=[];if(protocol.
change_7d===null)flags.push("growth-missing");if(protocol.listed_at===null)flags.push("age-missing");
return{features:{lnTvl:Math.log(protocol.tvl_usd),lnAge:protocol.listed_at===null?medianLnAge:logAge(
protocol.listed_at,asOf),growth:logMomentum(protocol.change_7d)},flags}}function featureStats(values){
let sum=0;let min=Number.POSITIVE_INFINITY;let max=Number.NEGATIVE_INFINITY;for(const value of values){
sum+=value;min=Math.min(min,value);max=Math.max(max,value)}const mean=min===max?min:sum/values.length;
const scale=Math.sqrt(values.reduce((total,value)=>total+(value-mean)**2,0)/values.length);return{mean,
scale,range:{min,max}}}function prepareFit(rows,drop){const n=rows.length;if(n===0)throw new Error("\
The value model needs at least one traded comparable.");const medianLnAge=median(rows.flatMap(({slug,
lnAge})=>lnAge===null?[]:[{slug,value:lnAge}]))??0;const tvl=featureStats(rows.map(({lnTvl})=>lnTvl));
const age=featureStats(rows.map(({lnAge})=>lnAge??medianLnAge));const targetMean=rows.reduce((sum,row)=>sum+
row.target,0)/n;const tvlScale=drop==="tvl"?0:tvl.scale;const ageScale=drop==="age"?0:age.scale;const design=rows.
map(row=>({target:row.target-targetMean,tvl:tvlScale?(row.lnTvl-tvl.mean)/tvlScale:0,age:ageScale?((row.
lnAge??medianLnAge)-age.mean)/ageScale:0}));return{design,targetMean,tvlScale,ageScale,metadata:{n,medianLnAge,
featureMeans:{lnTvl:tvl.mean,lnAge:age.mean},featureRanges:{lnTvl:tvl.range,lnAge:age.range}}}}function restoreCoefficients({
targetMean,tvlScale,ageScale,metadata:{featureMeans}},centeredIntercept,tvlSlope,ageSlope){const lnTvl=tvlScale?
tvlSlope/tvlScale:0;const lnAge=ageScale?ageSlope/ageScale:0;const intercept=targetMean+centeredIntercept-
lnTvl*featureMeans.lnTvl-lnAge*featureMeans.lnAge;return{intercept,lnTvl,lnAge}}function fitValueModel(rows,lambda,{
drop,robust=true}={}){const prepared=prepareFit(rows,drop);const{coefficients:[base=0,tvl=0,age=0],huberScale}=fitRidge(
prepared.design,lambda,robust);return{...prepared.metadata,lambda,huberScale,coefficients:restoreCoefficients(
prepared,base,tvl,age)}}function logValue({lnTvl,growth,lnAge},{coefficients}){return coefficients.intercept+
coefficients.lnTvl*(lnTvl+growth)+coefficients.lnAge*lnAge}function predictValue(protocol,asOf,model){
const row=valueFeatures(protocol,asOf,model.medianLnAge);const{featureMeans,featureRanges,coefficients}=model;
const{features}=row;if(FITTED_KEYS.some(key=>{const{min,max}=featureRanges[key];return features[key]<
min||features[key]>max})){row.flags.push("outside-comps-range")}const{intercept,lnTvl,lnAge}=coefficients;
const logBase=intercept+lnTvl*featureMeans.lnTvl+lnAge*featureMeans.lnAge;const valueUsd=Math.exp(logValue(
features,model));return{...row,valueUsd,implied_value_usd:clamp(Math.round(valueUsd),1,1e14),decomposition:{
base:Math.exp(logBase),multipliers:{lnTvl:Math.exp(lnTvl*(features.lnTvl-featureMeans.lnTvl)),growth:Math.
exp(lnTvl*features.growth),lnAge:Math.exp(lnAge*(features.lnAge-featureMeans.lnAge))}}}}function rankBoard(entries,asOf,model){
return entries.map(entry=>({...entry,...predictValue(entry.protocol,asOf,model)})).sort((a,b)=>b.implied_value_usd-
a.implied_value_usd||compareText(a.protocol.slug,b.protocol.slug)).map((entry,index)=>({...entry,rank:index+
1}))}function radarInputs({protocols,as_of}){const families=groupFamilies(protocols);return{families,comparables:comparablesFromFamilies(
families,as_of)}}function rankRadar(snapshot,{families,comparables},lambda,launchClock,tables){const{
protocols,watchlist,as_of}=snapshot;const entries=buildCensus(protocols,families);const model=fitValueModel(
comparables,lambda);const ranked=rankBoard(boardEntries(entries,watchlist),as_of,model);const board=ranked.
map(row=>{const{protocol,implied_value_usd}=row;const age=protocol.listed_at===null?launchClock.medianAgeDays??
0:Math.max(0,daysBetween(protocol.listed_at,as_of));const p12=launchProbability12(launchClock.points,
age);const plan=makeFarmPlan(protocol,tables);const economics=estimateFarmEconomics(plan,implied_value_usd,
protocol.tvl_usd,p12);return{...row,plan,economics,farm_steps:[...plan.steps.map(renderFarmStep),renderEconomics(
economics)]}});return{entries,model,board}}function recomputeRadar(snapshot,lambda,launchClock,tables){const{model,board}=rankRadar(snapshot,radarInputs(
snapshot),lambda,launchClock,tables);return{model,board}}function readPublishedSnapshot({meta,protocols,watchlist}){if(!Array.isArray(protocols)||!Array.isArray(
watchlist)||protocols.length!==meta?.protocolCount){return null}const{as_of,floor_usd,source}=meta;return{
as_of,floor_usd,source,protocols,watchlist}}return __toCommonJS(browser_api_exports);})();
