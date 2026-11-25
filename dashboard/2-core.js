(() => {
var ASSUMPTIONS_AS_OF="2026-11-14",defaults={asOf:ASSUMPTIONS_AS_OF,airdropShareOfLaunchCap:.25,farmerHaircut:.5,hourlyRateUsd:25,
capitalApr:{yieldBearing:0,nonYielding:.05},horizonMonths:12,monthsPerYear:12,weeksPerYear:52,minutesPerHour:60,depositsUsd:[
1e3,5e3,1e4,25e3],tradeVolumeUsd:200,tradingFeeRate:6e-4,setupMinutes:5,bridgeMinutes:10};function formatUsd(value){let amount=Math.abs(value).toFixed(2).replace(/\.00$/,"");return`${value<0?"-":""}$${amount.replace(
/\B(?=(\d{3})+(?:\.|$))/g,",")}`}function expectedHoldYears(p12,capYears=1){if(p12===0)return capYears;let hazard=-Math.log1p(-p12);return-Math.expm1(-hazard*
capYears)/hazard}function farmEconomicsTerms(plan,valueUsd,tvlUsd,launchProbability,settings=defaults){let hours=plan.totalMinutes/settings.
minutesPerHour,horizonYears=settings.horizonMonths/settings.monthsPerYear,{yieldBearing,nonYielding}=settings.capitalApr??
defaults.capitalApr,capitalApr=plan.capitalApr;capitalApr===defaults.capitalApr.yieldBearing?capitalApr=yieldBearing:capitalApr===
defaults.capitalApr.nonYielding&&(capitalApr=nonYielding);let capitalCarry=capitalApr*expectedHoldYears(launchProbability,
horizonYears),k=valueUsd*settings.airdropShareOfLaunchCap*launchProbability*settings.farmerHaircut/tvlUsd;return{cashFees:plan.
totalCostUsd,hours,horizonYears,capitalCarry,k}}function estimateFarmEconomics(plan,valueUsd,tvlUsd,launchProbability,settings=defaults){
let terms=farmEconomicsTerms(plan,valueUsd,tvlUsd,launchProbability,settings),{cashFees,horizonYears,capitalCarry,k}=terms,
atDeposit=depositUsd=>{let amounts=depositAmounts(terms,depositUsd),{netUsd,netPerHourUsd}=amounts,verdict=netUsd<=0?"SK\
IP":netPerHourUsd>settings.hourlyRateUsd?"FARM":"THIN";return{depositUsd,...amounts,verdict}};return{launchProbability12:launchProbability,
airdropYieldApr:k/horizonYears,deposits:defaults.depositsUsd.map(atDeposit),breakEvenDepositUsd:k>capitalCarry?cashFees/
(k-capitalCarry):"never"}}function depositAmounts({cashFees,capitalCarry,hours,k},depositUsd){let expectedValueUsd=k*depositUsd,
carryUsd=capitalCarry*depositUsd,costUsd=cashFees+carryUsd,netUsd=expectedValueUsd-cashFees-carryUsd,netPerHourUsd=netUsd===
0?0:netUsd/hours;return{expectedValueUsd,costUsd,netUsd,netPerHourUsd}}//! Numeric kernels (weighted Cholesky least squares, Huber and logistic IRLS) ship in 5-extras.js.
var{compareText}=window.Radar?.support??{};var MIN_GROUP_CHANGES=10;function farmGroup(category,playbooks){let label=category?.trim().toLowerCase()??"";return Object.
keys(playbooks).find(group=>playbooks[group]?.categories.includes(label))??"generic"}function farmExitThresholds(census,playbooks){
let changes=census.flatMap(({protocol,status})=>{let{listed_at,change_7d,slug,category}=protocol;return status==="pre-to\
ken"&&listed_at!==null&&change_7d!==null?[{change:change_7d,slug,group:farmGroup(category,playbooks)}]:[]}).sort((a,b)=>a.
change-b.change||compareText(a.slug,b.slug)),decile=group=>group[Math.ceil(group.length/10)-1]?.change,pooled=decile(changes),
fallback=pooled===void 0?null:{change:pooled,label:"pooled categories"};return new Map(Object.entries(playbooks).map(([group,
{label}])=>{let sample=changes.filter(row=>row.group===group),change=sample.length<MIN_GROUP_CHANGES?void 0:decile(sample);
return[group,change===void 0?fallback:{change,label}]}))}function chooseChain(chains,transactions,transfers,gas){let quote=chain=>{let fees=chain!==null&&Object.hasOwn(gas.chains,
chain)?gas.chains[chain]:void 0,[transactionUsd,bridgeUsd]=fees??gas.fallback,cost=roundUsd(transfers*bridgeUsd+transactions*
transactionUsd);return{chain,transactionUsd,bridgeUsd,cost,feeAssumed:fees===void 0}};return chains.map(quote).sort((a,b)=>a.
cost-b.cost||compareText(a.chain??"",b.chain??""))[0]??quote(null)}function roundUsd(value){return Math.round(value*100)/
100}function formatEntryShare(depositUsd,tvlUsd){let percent=100*depositUsd/tvlUsd,rounded=percent.toPrecision(2),[,exponent]=rounded.
split("e"),decimals=Math.max(0,1-Number(exponent)),share=`${exponent&&decimals<=20?Number(rounded).toFixed(decimals):rounded}\
% of snapshot TVL`;if(percent>=.001)return share;let ratio=Number((tvlUsd/depositUsd).toPrecision(2)),scale=Math.min(4,Math.
floor(Math.log10(ratio)/3));return`${share} (about 1 in ${ratio/1e3**scale}${" KMBT"[scale]} of TVL)`}function makeFarmPlan(protocol,{
playbooks,gas,funding,uncollateralized,checklist},{depositUsd=defaults.depositsUsd[0],launchProbability12:launchProbability122=0,
exitThreshold=null}={}){if(!Number.isFinite(depositUsd)||depositUsd<=0)throw new Error("The farm plan needs a positive, \
finite deposit size.");let group=farmGroup(protocol.category,playbooks),playbook=playbooks[group]??playbooks.generic,copy=protocol.
category?.toLowerCase().includes("uncollateralized")?uncollateralized:playbook,bridge=group==="bridge",holdYears=expectedHoldYears(
launchProbability122),holdWeeks=holdYears*defaults.weeksPerYear,reviewCounts={once:1,"at launch":1,weekly:Math.floor(holdWeeks),
monthly:Math.floor(defaults.monthsPerYear*holdYears)},repeats=reviewCounts[playbook.cadence],[entry,review,exit]=playbook.
transactions,gasTransactions=(bridge?0:entry)+review*repeats+exit,{chain,transactionUsd,bridgeUsd,feeAssumed}=chooseChain(
protocol.chains,gasTransactions,bridge?entry:1,gas),fields={deposit:formatUsd(depositUsd),chain:chain??"a verified chain",
gas:`about ${formatUsd((gasTransactions+1)*transactionUsd)} for gas`,share:formatEntryShare(depositUsd,protocol.tvl_usd)},
step=(action,costUsd,minutes,cadence="once")=>({action:action.replace(/\{(\w+)\}/g,(_,key)=>fields[key]??""),chain,costUsd:roundUsd(
costUsd),minutes,cadence}),[entryMinutes,reviewMinutes,exitMinutes]=playbook.minutes,[eligibilityMinutes,sizeMinutes,claimMinutes,
recordMinutes]=checklist.minutes,tradingFees=group==="derivatives"?defaults.tradeVolumeUsd*defaults.tradingFeeRate:0,fundingStep=bridge?
null:step(funding.bridge,bridgeUsd,defaults.bridgeMinutes),recurring=step(copy.review,tradingFees+review*transactionUsd,
reviewMinutes,playbook.cadence),claim=step(checklist.claim,transactionUsd,claimMinutes,"at launch"),floor=`TVL drops und\
er ${formatUsd(protocol.tvl_usd/2)}`,drawdown=exitThreshold?.change.toFixed(1).replace("-","−"),trigger=exitThreshold?
`Exit if 7-day TVL change falls below ${drawdown}% (bottom tenth of ${exitThreshold.label} in this snapshot) or ${floor}\
.`:`Exit if ${floor}. No listed pre-token 7-day TVL data.`,steps=[step(chain===null?funding.unlisted:funding.wallet,0,defaults.
setupMinutes-eligibilityMinutes),step(checklist.eligibility,0,eligibilityMinutes),step(playbook.sizing?.action??checklist.
size,0,sizeMinutes+(playbook.sizing?.extraMinutes??0)),...fundingStep?[fundingStep]:[],step(copy.enter,entry*(bridge?bridgeUsd:
transactionUsd),entryMinutes-sizeMinutes-recordMinutes),recurring,step(checklist.records,0,recordMinutes),claim,{...step(
copy.exit,exit*transactionUsd,exitMinutes-claimMinutes),exitCondition:`${trigger} ${copy.exitCondition}`}],fixedCost=steps.
filter(({cadence})=>cadence==="once").reduce((sum,{costUsd})=>sum+costUsd,0),oneTimeCostUsd=roundUsd(fixedCost+claim.costUsd*
launchProbability122),recurringCostUsd=roundUsd(recurring.costUsd*repeats);return{chain,depositUsd,steps,fundingStep,exitThreshold,
reviewCounts,holdWeeks,flags:feeAssumed?["fee-assumed"]:[],assumptionsAsOf:defaults.asOf,capitalApr:playbook.capitalApr,
oneTimeCostUsd,recurringCostUsd,totalCostUsd:roundUsd(oneTimeCostUsd+recurringCostUsd),totalMinutes:steps.reduce((sum,item)=>sum+
item.minutes*reviewCounts[item.cadence],0)}}function pava(bins){let pools=[];for(let bin of bins)for(pools.push({...bin,size:1});pools.length>1;){let left=pools.at(
-2),right=pools.at(-1);if(!left||!right||left.recorded*right.count<=right.recorded*left.count)break;left.count+=right.count,
left.recorded+=right.recorded,left.size+=right.size,pools.pop()}return pools.flatMap(({count,recorded,size})=>Array(size).
fill(recorded/count))}var YEAR_DAYS=365;function fitAgeShares(rows){let bins=new Map;for(let{ageDays:age,label}of rows){let year=Math.floor(age/
YEAR_DAYS),bin=bins.get(year)??{count:0,recorded:0,ageSum:0};bin.count++,bin.recorded+=label,bin.ageSum+=age,bins.set(year,
bin)}let ordered=[...bins].sort(([a],[b])=>a-b).map(([,bin])=>bin),shares=pava(ordered);return ordered.map(({ageSum,count},i)=>({
ageDays:ageSum/count,share:shares[i]??0,count}))}function tailHazard(points){for(let i=points.length-1;i>0;i--){let left=points[i-
1],right=points[i];if(left&&right&&right.share>left.share)return Math.log((1-left.share)/(1-right.share))/(right.ageDays-
left.ageDays)}return-Math.log1p(-(points[0]?.share??0))/YEAR_DAYS}function shareAt(points,age){let left=points[0];if(!left)
return 0;if(age<=left.ageDays)return left.share;for(let right of points){if(age<=right.ageDays){let fraction=(age-left.ageDays)/
(right.ageDays-left.ageDays);return left.share+fraction*(right.share-left.share)}left=right}return left.share+(1-left.share)*
-Math.expm1(-tailHazard(points)*(age-left.ageDays))}var{clamp,featureStats,median}=window.Radar?.support??{};function daysBetween(fromIso,toIso){return(Date.parse(toIso)-Date.parse(fromIso))/864e5}var categories={dex:["dex","dexs","liquidity manager"],lending:["lending","uncollateralized lending","cdp","cdp manager",
"collateral markets"],staking:["liquid staking","staking pool","restaking","liquid restaking","restaked btc"],yield:["yi\
eld","yield aggregator","leveraged farming","farm"],derivatives:["derivatives","interest rate derivatives","basis tradin\
g","options","options vault"],rwa:["rwa"],bridge:["bridge","canonical bridge","cross chain bridge"],other:[]};function categoryGroup(category){
let label=category?.trim().toLowerCase()??"";for(let[group,labels]of Object.entries(categories))if(labels.includes(label))
return group;return"other"}function categoryTotals(){return Object.fromEntries(Object.keys(categories).map(group=>[group,
0]))}function groupComparableCategories(rows,families){let groups=new Map(families.map(({key,representative})=>[key,categoryGroup(
representative.category)]));return rows.map(row=>({...row,category:groups.get(row.familyKey)??"other"}))}function logAge(listedAt,asOf){return Math.log(Math.max(1,daysBetween(listedAt,asOf)))}function logMomentum(change){return change===
null?0:Math.log1p(clamp(change,-50,100)/100)}function comparablesFromFamilies(families,asOf){return families.flatMap(({key,
representative,tvl_usd,mcap_usd})=>{if(mcap_usd===null)return[];let{slug,listed_at,change_7d}=representative;return[{slug,
familyKey:key,listedAt:listed_at,lnTvl:Math.log(tvl_usd),lnAge:listed_at===null?null:logAge(listed_at,asOf),growth:logMomentum(
change_7d),target:Math.log(mcap_usd)}]})}var{fitLogistic,linearScore,sigmoid}=window.Radar?.support??{};var ODDS_CANDIDATES=["lnTvl","growth","lnChains","categoryShare"],PENALTY=1,PRIOR_STRENGTH=20;function protocolFeatures(protocol,ageDays){
return{ageDays,lnTvl:Math.log(protocol.tvl_usd),growth:logMomentum(protocol.change_7d),lnChains:Math.log(Math.max(1,protocol.
chains.length)),category:categoryGroup(protocol.category)}}function oddsPopulation(entries,asOf){return entries.flatMap(
({protocol,status})=>{let{slug,listed_at:listedAt}=protocol;return listedAt===null||status==="excluded"?[]:[{...protocolFeatures(
protocol,Math.max(0,daysBetween(listedAt,asOf))),slug,familyKey:slug,listedAt,label:+(status==="traded"||status==="token\
-unpriced")}]}).sort((a,b)=>compareText(a.slug,b.slug))}function baseRate(rows){return rows.reduce((sum,{label})=>sum+label,
0)/rows.length}function categoryTokenShares(rows,prior=PRIOR_STRENGTH){let counts=categoryTotals(),recorded=categoryTotals();
for(let{category,label}of rows)counts[category]++,recorded[category]+=label;let rate=baseRate(rows);for(let category of Object.
keys(counts))recorded[category]=(recorded[category]+prior*rate)/(counts[category]+prior);return recorded}function oddsFeatures(row,terms,shares,clock){
return[clockLogit(clock,row.ageDays),...terms.map(term=>term==="categoryShare"?shares[row.category]:row[term])]}function clockLogit(clock,age){
let share=clamp(shareAt(clock,age),.01,.99);return Math.log(share/(1-share))}function fitOddsModel(rows,terms){let shares=categoryTokenShares(
rows),clock=fitAgeShares(rows),coefficients=fitLogistic(rows.map(row=>oddsFeatures(row,terms,shares,clock)),rows.map(({label})=>label),
PENALTY);return{terms,coefficients,shares,clock,n:rows.length,medianAgeDays:median(rows.map(({slug,ageDays})=>({slug,value:ageDays})))??
0,maxAgeDays:rows.reduce((max,{ageDays})=>Math.max(max,ageDays),0)}}function checkClockCoefficient(gamma=0){if(!(gamma>0))
throw new Error("Token-status clock coefficient γ must be positive.")}function launchProbability12(clock,age,otherLogit,gamma){
return checkClockCoefficient(gamma),conditionalProbability(clock,age,otherLogit,gamma)}function conditionalProbability(clock,age,otherLogit,gamma){
let future=clockLogit(clock,age+YEAR_DAYS),rise=future-clockLogit(clock,age);return rise===0?-Math.expm1(-tailHazard(clock)*
YEAR_DAYS):clamp(sigmoid(otherLogit+gamma*future)*-Math.expm1(-gamma*rise),0,1)}function protocolOdds(model,protocol,asOf,probability=launchProbability12){
let ageDays=protocol.listed_at===null?model.medianAgeDays:Math.max(0,daysBetween(protocol.listed_at,asOf)),{clock,coefficients,
shares,terms}=model,features=oddsFeatures(protocolFeatures(protocol,ageDays),terms,shares,clock);features[0]=0;let otherLogit=linearScore(
features,coefficients),gamma=coefficients[1]??0,oddsAt=days=>probability(clock,days,otherLogit,gamma);return{oddsAge:ageDays,
oddsAt,launchProbability12:oddsAt(ageDays)}}function selectTerms(candidates,evaluate){let terms=[],steps=[],scores=evaluate(terms);for(;terms.length<candidates.length;){
let trials=candidates.filter(term=>!terms.includes(term)).map(term=>({term,scores:evaluate([...terms,term]),kept:!1})),best,
bestGain=0;for(let trial of trials){let gains=scores.map((error,i)=>{let challenger=trial.scores[i];return error===null||
challenger==null?0:error-challenger}),gain=gains.reduce((sum,value)=>sum+value,0);gains.every(value=>value>0)&&gain>bestGain&&
(best=trial,bestGain=gain)}if(steps.push({baseline:scores,trials}),!best)break;best.kept=!0,terms.push(best.term),scores=
best.scores}return{terms,steps,scores}}function mulberry32(seed){let state=seed>>>0;return()=>{state=state+1831565813>>>0;let mixed=Math.imul(state^state>>>15,
state|1);return mixed^=mixed+Math.imul(mixed^mixed>>>7,mixed|61),((mixed^mixed>>>14)>>>0)/2**32}}var FOLD_COUNT=5,FOLD_SEED=10772;function bySlug(a,b){return compareText(a.slug,b.slug)}function seededFolds(rows,count=FOLD_COUNT){
let ordered=[...rows].sort(bySlug),keys=[...new Set(ordered.map(({familyKey:familyKey2})=>familyKey2))],next=mulberry32(
FOLD_SEED),assignments=new Map;for(;keys.length>0;){let index=Math.floor(next()*keys.length);assignments.set(keys[index],
assignments.size%count);let last=keys.pop();index<keys.length&&(keys[index]=last)}let folds=Array.from({length:count},()=>[]);
for(let row of ordered)folds[assignments.get(row.familyKey)??-1]?.push(row);return folds}function splitFolds(heldOut){return heldOut.
map((test,i)=>({train:heldOut.flatMap((fold,j)=>i===j?[]:fold).sort(bySlug),test}))}function walkForwardSplit(rows){let dated=rows.
filter(row=>row.listedAt!==null).sort((a,b)=>compareText(a.listedAt,b.listedAt)||bySlug(a,b)),cutoff=Math.floor(dated.length*
.6),lastTrainingDate=dated[cutoff-1]?.listedAt,test=dated.slice(cutoff).filter(({listedAt})=>listedAt!==lastTrainingDate),
heldOut=new Set(test.map(({familyKey:familyKey2})=>familyKey2));return{train:rows.filter(row=>!heldOut.has(row.familyKey)).
sort(bySlug),test}}function meanBrier(predictions){return predictions.length?predictions.reduce((sum,{actual,predicted})=>sum+(actual-predicted)**
2,0)/predictions.length:null}function oddsValidationFolds(rows){return[splitFolds(seededFolds(rows,10)),[walkForwardSplit(
rows)]]}function scoreOdds(folds,fitPredictor){return folds.map(scheme=>meanBrier(scheme.flatMap(({train,test})=>{if(!train.
length||!test.length)return[];let predict=fitPredictor(train);return test.map(row=>({actual:row.label,predicted:predict(
row)}))})))}function statusPredictor(train,terms){let{shares,clock,coefficients}=fitOddsModel(train,terms);return row=>sigmoid(
linearScore(oddsFeatures(row,terms,shares,clock),coefficients))}function validateOdds(rows){let folds=oddsValidationFolds(
rows),rate=scoreOdds(folds,train=>{let share=baseRate(train);return()=>share}),pava2=scoreOdds(folds,train=>{let points=fitAgeShares(
train);return row=>shareAt(points,row.ageDays)}),selection=selectTerms(ODDS_CANDIDATES,terms=>scoreOdds(folds,train=>statusPredictor(
train,terms)));return{...selection,baselines:{baseRate:rate,pava:pava2,clockOnly:selection.steps[0]?.baseline??selection.
scores}}}var{fitRidge}=window.Radar?.support??{};var FITTED_KEYS=["lnTvl","lnAge"];function valueFeatures(protocol,asOf,medianLnAge){let flags=[];return protocol.change_7d===
null&&flags.push("growth-missing"),protocol.listed_at===null&&flags.push("age-missing"),{features:{lnTvl:Math.log(protocol.
tvl_usd),lnAge:protocol.listed_at===null?medianLnAge:logAge(protocol.listed_at,asOf),growth:logMomentum(protocol.change_7d)},
flags}}function prepareFit(rows,drop){let n=rows.length;if(n===0)throw new Error("The value model needs at least one tra\
ded comparable.");let medianLnAge=median(rows.flatMap(({slug,lnAge})=>lnAge===null?[]:[{slug,value:lnAge}]))??0,tvl=featureStats(
rows.map(({lnTvl})=>lnTvl)),age=featureStats(rows.map(({lnAge})=>lnAge??medianLnAge)),targetMean=rows.reduce((sum,row)=>sum+
row.target,0)/n,tvlScale=drop==="tvl"?0:tvl.scale,ageScale=drop==="age"?0:age.scale;return{design:rows.map(row=>({target:row.
target-targetMean,tvl:tvlScale?(row.lnTvl-tvl.mean)/tvlScale:0,age:ageScale?((row.lnAge??medianLnAge)-age.mean)/ageScale:
0})),targetMean,tvlScale,ageScale,metadata:{n,medianLnAge,featureMeans:{lnTvl:tvl.mean,lnAge:age.mean},featureRanges:{lnTvl:tvl.
range,lnAge:age.range}}}}function restoreCoefficients({targetMean,tvlScale,ageScale,metadata:{featureMeans}},centeredIntercept,tvlSlope,ageSlope){
let lnTvl=tvlScale?tvlSlope/tvlScale:0,lnAge=ageScale?ageSlope/ageScale:0;return{intercept:targetMean+centeredIntercept-
lnTvl*featureMeans.lnTvl-lnAge*featureMeans.lnAge,lnTvl,lnAge}}function fitValueModel(rows,lambda,{drop,robust=!0,momentum=!0}={},category){
let prepared=prepareFit(rows,drop),design=category?prepared.design.map((row,i)=>({...row,group:category.groupBySlug[rows[i]?.
slug??""]??0})):prepared.design,{coefficients,huberScale}=fitRidge(design,lambda,robust,category?.penalty),tvlColumn=category?.
groups.length??1,center=category?.contrastShares.reduce((sum,share,i)=>sum+share*(coefficients[i+1]??0),0)??0,categoryEffects=category&&
categoryTotals();return category?.groups.forEach((key,i)=>{categoryEffects&&(categoryEffects[key]=(i?coefficients[i]??0:
0)-center)}),{...prepared.metadata,lambda,momentum,huberScale,coefficients:restoreCoefficients(prepared,(coefficients[0]??
0)+center,coefficients[tvlColumn]??0,coefficients[tvlColumn+1]??0),...categoryEffects&&{categoryEffects}}}function logValue({
lnTvl,growth,lnAge,category},{coefficients,momentum=!0,categoryEffects}){return coefficients.intercept+coefficients.lnTvl*
(lnTvl+(momentum?growth:0))+coefficients.lnAge*lnAge+(categoryEffects?.[category??"other"]??0)}function predictValue(protocol,asOf,model){
let row=valueFeatures(protocol,asOf,model.medianLnAge),{featureMeans,featureRanges,coefficients}=model,{features}=row;model.
categoryEffects&&(features.category=categoryGroup(protocol.category)),FITTED_KEYS.some(key=>{let{min,max}=featureRanges[key];
return features[key]<min||features[key]>max})&&row.flags.push("outside-comps-range");let{intercept,lnTvl,lnAge}=coefficients,
logBase=intercept+lnTvl*featureMeans.lnTvl+lnAge*featureMeans.lnAge,valueUsd=Math.exp(logValue(features,model));return{...row,
valueUsd,launch_value_usd:clamp(Math.round(valueUsd),1,1e14),decomposition:{base:Math.exp(logBase),multipliers:{lnTvl:Math.
exp(lnTvl*(features.lnTvl-featureMeans.lnTvl)),growth:Math.exp(lnTvl*(model.momentum===!1?0:features.growth)),lnAge:Math.
exp(lnAge*(features.lnAge-featureMeans.lnAge)),...model.categoryEffects&&{category:Math.exp(model.categoryEffects[features.
category??"other"])}}}}}function rankBoard(entries,asOf,model){return entries.map(entry=>{let value=predictValue(entry.protocol,
asOf,model);return{...entry,...value,implied_value_usd:Math.max(1,Math.round(value.launch_value_usd*entry.launchProbability12))}}).
sort((a,b)=>b.implied_value_usd-a.implied_value_usd||compareText(a.protocol.slug,b.protocol.slug)).map((entry,index)=>({
...entry,rank:index+1}))}function impliedValueEffects(protocol,asOf,model,odds){let baseOdds=protocolOdds(odds,protocol,asOf),base=predictValue(protocol,
asOf,model).valueUsd*baseOdds.launchProbability12,effect=(value,probability)=>(value*probability/base-1)*100,perturb=record=>effect(
predictValue(record,asOf,model).valueUsd,protocolOdds(odds,record,asOf).launchProbability12),nextYear=new Date(Date.parse(
asOf)+YEAR_DAYS*864e5).toISOString(),agedModel=protocol.listed_at===null&&model.coefficients.lnAge?{...model,medianLnAge:Math.
log(Math.exp(model.medianLnAge)+YEAR_DAYS)}:model;return[perturb({...protocol,tvl_usd:protocol.tvl_usd*1.1}),perturb({...protocol,
change_7d:(protocol.change_7d??0)+10}),effect(predictValue(protocol,nextYear,agedModel).valueUsd,baseOdds.oddsAt(baseOdds.
oddsAge+YEAR_DAYS))]}function summarizeEffects(effects){return[0,1,2].map(input=>{let values=[...effects];if(values.some(
([,effect])=>!Number.isFinite(effect[input])))return[NaN,NaN,NaN];values.sort(([a,x],[b,y])=>x[input]-y[input]||compareText(
a,b));let n=values.length,at=i=>values[i]?.[1][input]??NaN;return[(at(Math.floor((n-1)/2))+at(Math.floor(n/2)))/2,at(Math.
ceil(.1*n)-1),at(Math.ceil(.9*n)-1)]})}function medianLogError(rows){return median(rows.map(({slug,actual,predicted})=>({slug,value:Math.abs(actual-predicted)})))}var VALUE_CANDIDATES=["momentum","age","category"];function predictionsFor(rows,predict){return rows.map(row=>({slug:row.slug,actual:row.target,predicted:predict(row)}))}function modelPredictions(rows,model){
return predictionsFor(rows,row=>predictComparable(row,model))}function predictComparable(row,model){let{lnTvl,growth,lnAge}=row,
category=row.category;return logValue({lnTvl,growth,lnAge:lnAge??model.medianLnAge,category:category??"other"},model)}function valueOptions(terms){return{...!terms.includes("age")&&{drop:"age"},momentum:terms.includes("momentum")}}var TAIL_ALPHA=.1,MIN_BAND_FAMILIES=Math.ceil(1/TAIL_ALPHA);function rangeHonesty(points){let count=(low,high,stated)=>{let covered=0,n=0;for(let point of points){let a=point[low],
b=point[high];a===null||b===null||!Number.isFinite(a)||!Number.isFinite(b)||a>b||(n++,a<=point.actual&&point.actual<=b&&
covered++)}return{stated,covered,n}};return{middle:count("p25","p75",.5),broad:count("p10","p90",.8)}}function categoryDesign(rows,{lambda,categoryPenaltyMultiple}){let counts=categoryTotals();for(let{category}of rows)counts[category]++;
let groups=Object.keys(counts).filter(key=>counts[key]>0),shares=groups.map(category=>counts[category]/rows.length),contrastShares=shares.
slice(1),penalty=lambda*categoryPenaltyMultiple;return{groups,groupBySlug:Object.fromEntries(rows.map(({slug,category})=>[
slug,groups.indexOf(category)])),contrastShares,penalty:contrastShares.map((left,i)=>contrastShares.map((right,j)=>penalty*
((i===j?1:0)+shares.length*left*right-left-right)))}}function refitValue(rows,fit){return fitValueModel(rows,fit.lambda,valueOptions(fit.terms),fit.category)}function refitValueSubset(rows,fit){
let{lambda,categoryPenaltyMultiple}=fit;return categoryPenaltyMultiple===void 0?refitValue(rows,fit):refitValue(rows,{...fit,
category:categoryDesign(rows,{lambda,categoryPenaltyMultiple})})}function selectValueTerms(rows,{lambda,categoryTrial}){let folds=[splitFolds(rows.map(row=>[row])),[walkForwardSplit(rows)]],
candidates=categoryTrial?VALUE_CANDIDATES:VALUE_CANDIDATES.filter(term=>term!=="category");return selectTerms(candidates,
terms=>{let parameters=terms.includes("category")&&categoryTrial?categoryTrial:{lambda},fit={terms,...parameters};return folds.
map(scheme=>medianLogError(scheme.flatMap(({train,test})=>!train.length||!test.length?[]:modelPredictions(test,refitValueSubset(
train,fit))))??null)})}function familyKey({slug,gecko_id}){return gecko_id===null?`slug:${slug}`:`gecko:${gecko_id}`}function groupFamilies(protocols){
let families=new Map;for(let protocol of[...protocols].sort((a,b)=>compareText(a.slug,b.slug))){let{tvl_usd,mcap_usd}=protocol,
key=familyKey(protocol),marketCap=mcap_usd!==null&&mcap_usd>0?mcap_usd:null,family=families.get(key);family?(family.members.
push(protocol),family.tvl_usd+=tvl_usd,family.mcap_usd??=marketCap):families.set(key,{key,representative:protocol,members:[
protocol],tvl_usd,mcap_usd:marketCap})}return[...families.values()]}var BRIDGE_PRODUCT="wrapped and bridged products are",STAKED_PRODUCT="staked products are",HOUSE_RULE=" (house rule).",EXCLUDED_CATEGORIES=new Map(
[["Bridge",BRIDGE_PRODUCT],["Canonical Bridge",BRIDGE_PRODUCT],["Liquid Staking",STAKED_PRODUCT],["Liquid Restaking",STAKED_PRODUCT],
["Restaked BTC",STAKED_PRODUCT],["CEX","exchange custody is"]]),VERSION_SUFFIX=/\s(?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)$/i,PRODUCT_WORD=/(?<![\p{L}\p{M}\p{N}_])(?:wrapped|staked|staking)(?![\p{L}\p{M}\p{N}_])/iu,
EXCHANGE_NAME=/^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)(?![\p{L}\p{M}\p{N}_])/iu;function tokenFields({
gecko_id,symbol}){return gecko_id!==null?symbol===null?"gecko_id":"gecko_id and symbol":symbol===null?null:"symbol"}function exclusionReason(protocol){
let{category}=protocol,product=category===null?void 0:EXCLUDED_CATEGORIES.get(category);if(product)return`${category} ca\
tegory: ${product} not ranked${HOUSE_RULE}`;let name=protocol.name.trim();if(VERSION_SUFFIX.test(name))return`Name ends \
in a version marker${HOUSE_RULE}`;let productWord=name.match(PRODUCT_WORD)?.[0];if(productWord!==void 0)return`Name cont\
ains “${productWord}”${HOUSE_RULE}`;let exchange=name.match(EXCHANGE_NAME)?.[0];return exchange===void 0?null:`Name \
starts with the exchange name “${exchange}”${HOUSE_RULE}`}function classify(protocol,marketCap=protocol.mcap_usd){if(marketCap!==
null&&marketCap>0)return{status:"traded",reason:"The family records a positive market cap."};let fields=tokenFields(protocol);
if(fields!==null)return{status:"token-unpriced",reason:`The protocol records a token via ${fields} without a positive ma\
rket cap.`};let reason=exclusionReason(protocol);return reason!==null?{status:"excluded",reason}:{status:"pre-token",reason:"\
The protocol records no token."}}function buildCensus(protocols,families=groupFamilies(protocols)){let marketCaps=new Map(
families.map(({key,mcap_usd})=>[key,mcap_usd]));return protocols.map(protocol=>{let key=familyKey(protocol);return{protocol,
familyKey:key,...classify(protocol,marketCaps.get(key)??null)}})}function houseRuleMembership({protocols,floor_usd,watchlist}){
let watchlisted=new Set(watchlist),matches=new Set(protocols.filter(protocol=>protocol.tvl_usd>=floor_usd&&tokenFields(protocol)===
null&&exclusionReason(protocol)===null).map(({slug})=>slug).sort(compareText)),truePositives=[],falsePositives=[];for(let slug of matches)
(watchlisted.has(slug)?truePositives:falsePositives).push(slug);let falseNegatives=[...watchlisted].filter(slug=>!matches.
has(slug)).sort(compareText);return{truePositives,falsePositives,falseNegatives}}function boardEntries(census,watchlist){let watchlisted=new Set(watchlist),entries=[];for(let entry of census){let boardReasons=[];
entry.status==="pre-token"&&boardReasons.push("pre-token"),watchlisted.has(entry.protocol.slug)&&boardReasons.push("watc\
hlist"),boardReasons.length>0&&entries.push({...entry,boardReasons})}return entries}function radarInputs({protocols,as_of}){let families=groupFamilies(protocols),entries=buildCensus(protocols,families),comparables=comparablesFromFamilies(
families,as_of);return{families,entries,comparables,population:oddsPopulation(entries,as_of)}}function rankRadar({watchlist,
as_of},entries,model,odds,tables){checkClockCoefficient(odds.coefficients[1]);let candidates=boardEntries(entries,watchlist).
map(entry=>({...entry,...protocolOdds(odds,entry.protocol,as_of)})),thresholds=farmExitThresholds(entries,tables.playbooks);
return rankBoard(candidates,as_of,model).map(row=>{let{protocol,launch_value_usd,launchProbability12:p12}=row,plan=makeFarmPlan(
protocol,tables,{launchProbability12:p12,exitThreshold:thresholds.get(farmGroup(protocol.category,tables.playbooks))??null});
return{...row,plan,economics:estimateFarmEconomics(plan,launch_value_usd,protocol.tvl_usd,p12)}})}function recomputeRadar(snapshot,valueFit,oddsTerms,tables){
let{families,entries,comparables,population}=radarInputs(snapshot),model=refitValue(comparables,valueFit),odds=fitOddsModel(
population,oddsTerms);return{model,odds,board:rankRadar(snapshot,entries,model,odds,tables),families,comparables,population,
houseRule:houseRuleMembership(snapshot)}}function readPublishedSnapshot({meta,protocols,watchlist}){if(!Array.isArray(protocols)||!Array.isArray(watchlist)||protocols.
length!==meta?.protocolCount)return null;let{as_of,floor_usd,source}=meta;return{as_of,floor_usd,source,protocols,watchlist}}
function reproduceSelection({comparables,families,population},trialFit){return{value:selectValueTerms(groupComparableCategories(
comparables,families),trialFit),odds:validateOdds(population)}}var browserApi={impliedValueEffects,summarizeEffects,rangeHonesty,
reproduceSelection,MIN_BAND_FAMILIES,depositAmounts,farmEconomicsTerms,makeFarmPlan,farmAssumptions:defaults,estimateFarmEconomics,
formatUsd,compareText,daysBetween,logValue,buildRadar:recomputeRadar,readPublishedSnapshot};Object.assign(window.Radar??={},browserApi);
})();
