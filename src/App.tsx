import React,{useCallback,useEffect,useMemo,useState} from "react";
import { CheckCircle2, LogOut, TriangleAlert } from "lucide-react";
import { BrandLockup } from "./components/Brand";
import { Shell,type SectionId } from "./components/Shell";
import { TodayView } from "./components/views/TodayView";
import { LearnView } from "./components/views/LearnView";
import { TeachView } from "./components/views/TeachView";
import { SkillsView } from "./components/views/SkillsView";
import { PracticeView } from "./components/views/PracticeView";
import { WorkView } from "./components/views/WorkView";
import { SimulatorView,type SimulatorState } from "./components/views/SimulatorView";
import { ConnectionsView } from "./components/views/ConnectionsView";
import { AnalyticsView,type AnalyticsData } from "./components/views/AnalyticsView";
import { ControlView, type GovernanceData } from "./components/views/ControlView";
import { AuditView } from "./components/views/AuditView";
import { AccountsView } from "./components/views/AccountsView";
import { BillingView } from "./components/views/BillingView";
import { OwnerView } from "./components/views/OwnerView";
import { SubscriptionBanner } from "./components/SubscriptionBanner";
import { SectorsView } from "./components/views/SectorsView";
import { PartnersAdminView } from "./components/views/PartnersAdminView";
import { PartnerPortalView } from "./components/views/PartnerPortalView";
import { HelpPanel } from "./components/Explain";
import { CommandPalette, type CommandTarget } from "./components/CommandPalette";
import { ApprovalModal } from "./components/ApprovalModal";
import { apiOrNull, authApi, SubscriptionBlockedError, UnauthorizedError, type BillingSnapshot, type Plan } from "./lib/api";
import { LoginScreen } from "./components/LoginScreen";
import { OrgSetupView } from "./components/OrgSetupView";
import type { ApprovalRequest,AuditEvent,AutonomyLevel,Connector,LearningProposal,Organization,ShadowComparison,Skill,TestCase,User,WorkItem } from "./types";

/*
 * الارتداد عند تعذّر الخادم.
 *
 * كان هذا الكائن نسخةً ثانية من الأرقام المخترعة: 412 مهمة و84.5 ساعة و78.4%
 * أتمتة. أي أن فشل الطلب كان يُظهر أرقاماً جميلة بدل أن يقول إنه فشل. صار فارغاً
 * صراحةً — والشاشة تعرض «—» و«لا قياس بعد».
 */
const fallbackAnalytics:AnalyticsData={
  kpis:{totalTasksCompleted:0,totalHoursSaved:0,automationRatePercent:null,shadowMatchRatePercent:null,
    errorRatePercent:null,humanTakeoverPercent:null,avgProcessDurationMin:null,institutionalCoverageScore:null},
  trend:{available:false,reason:"لم تصل بيانات من الخادم بعد.",points:[]},
  riskDistribution:{low:0,medium:0,high:0,critical:0,total:0},
  topSkillsByUsage:[]
};
const fallbackSimulator:SimulatorState={step:"initial",messages:[{id:"welcome",sender:"ai",text:"أهلاً بك. كيف نقدر نساعدك اليوم؟",timestamp:"الآن"}]};

type ContextResponse={organization:Organization;users:User[];currentUser:User;organizationConfigured?:boolean;sectorCode?:string};

/*
 * الحالة الأولى فارغة لا مبذورة. كانت الواجهة تبدأ ببيانات «أكاديمية المستقبل»
 * حتى يصل جواب الخادم، فتومض مدرسةٌ وموظفةٌ نموذجية في مؤسسةٍ حقيقية.
 */
const blankOrganization:Organization={id:"",name:"",nameEn:"",industry:"",tagline:"",logo:"",verifiedSkillsCount:0,hoursSavedMonth:0};
const blankUser:User={id:"",name:" ",email:"",role:"employee",department:"",avatar:""};

export default function App(){
  const [lang,setLang]=useState<"ar"|"en">("ar");
  /*
   * العودة من صفحة الدفع تفتح شاشة الاشتراك.
   *
   * كان الخادم يُعيد الدافع إلى `/?payment=...#billing`، والواجهة لا تقرأ
   * الجزء ولا المعامل: تبدأ دائماً من «اليوم». فيعود من دفع للتوّ إلى شاشةٍ لا
   * تذكر دفعته، ولا يرى نتيجتها إلا إن فتح الاشتراك بنفسه — وهي اللحظة التي
   * يحتاج فيها التأكيد أكثر من أي لحظة أخرى.
   */
  const [section,setSection]=useState<SectionId>(()=>
    new URLSearchParams(window.location.search).has("payment")||window.location.hash==="#billing"?"billing":"today");
  const [organization,setOrganization]=useState<Organization>(blankOrganization);
  const [user,setUser]=useState<User>(blankUser);
  const [skills,setSkills]=useState<Skill[]>([]);
  const [work,setWork]=useState<WorkItem[]>([]);
  const [proposals,setProposals]=useState<LearningProposal[]>([]);
  const [approvals,setApprovals]=useState<ApprovalRequest[]>([]);
  const [connectors,setConnectors]=useState<Connector[]>([]);
  const [practice,setPractice]=useState<TestCase[]>([]);
  const [shadow,setShadow]=useState<ShadowComparison[]>([]);
  const [audit,setAudit]=useState<AuditEvent[]>([]);
  /* هل أعدّت المؤسسة نفسها؟ null حتى يصل جواب الخادم. */
  const [orgConfigured,setOrgConfigured]=useState<boolean|null>(null);
  /* المالك فتح لوحته قبل إعداد المؤسسة. */
  const [ownerOnly,setOwnerOnly]=useState(false);
  const [analytics,setAnalytics]=useState<AnalyticsData>(fallbackAnalytics);
  const [sim,setSim]=useState<SimulatorState>(fallbackSimulator);
  const [activeApproval,setActiveApproval]=useState<string|null>(null);
  const [approvalBusy,setApprovalBusy]=useState(false);
  const [practiceBusy,setPracticeBusy]=useState(false);
  const [shadowBusy,setShadowBusy]=useState(false);
  const [simBusy,setSimBusy]=useState(false);
  const [testingConnector,setTestingConnector]=useState<string|null>(null);
  const [paused,setPaused]=useState(false);
  const [serverLive,setServerLive]=useState(false);
  const [demoEnabled,setDemoEnabled]=useState(false);
  const [demoActive,setDemoActive]=useState(false);
  const [demoBusy,setDemoBusy]=useState(false);
  const [toast,setToast]=useState<{text:string;error?:boolean}|null>(null);
  // "checking" حتى نعرف من /auth/me؛ لا يُعرض أي سطح تشغيلي قبل الحسم.
  // "setup" = لا يوجد أي حساب بعد، فالشاشة تُنشئ حساب المشغّل بدل أن تطلب الدخول.
  const [authState,setAuthState]=useState<"checking"|"setup"|"anonymous"|"authenticated">("checking");
  const [account,setAccount]=useState<{id:string;role:string}|null>(null);
  /*
   * حالة الترخيص تُحمَّل مع كل شيء آخر لا عند فتح شاشة الاشتراك وحدها: الشريط
   * التحذيري يجب أن يظهر لمن يعمل في «اليوم» أو «العمل»، لا لمن ذهب يتفقّد فاتورته.
   */
  const [billing,setBilling]=useState<BillingSnapshot|null>(null);
  const [plans,setPlans]=useState<Plan[]>([]);
  const [billingLoading,setBillingLoading]=useState(true);
  const [governance,setGovernance]=useState<GovernanceData|null>(null);
  const [todayData,setTodayData]=useState<{metrics:any;institutionalMemoryCoverage:any}|null>(null);

  const notify=useCallback((text:string,error=false)=>{setToast({text,error});window.setTimeout(()=>setToast(null),2800)},[]);
  /*
   * غلافٌ واحد لكل كتابة.
   *
   * المسارات كانت تُنادى بـ`void`، فرفضُها يضيع بلا مُلتقط بينما يكمل النداء إلى
   * إشعار النجاح. والغلاف يُمسك الرفض ويقول سببه الحقيقي: الاشتراك موقوف، أو
   * الجلسة انتهت، أو تعذّرت العملية.
   */
  const guarded=useCallback(<A extends unknown[]>(fn:(...args:A)=>Promise<unknown>)=>async(...args:A)=>{
    try{ await fn(...args) }
    catch(error){
      /*
       * أعلام الانشغال تُطفأ هنا لا في المسارات.
       *
       * كل مسار يُشعل علمه ثم يطفئه بعد النداء. ورميُ الرفض يقفز فوق الإطفاء،
       * فيبقى الزرّ دوّاراً إلى الأبد ويظنّ المستخدم أن العملية ما تزال جارية —
       * وهو انطباعٌ أسوأ من رسالة الرفض نفسها.
       */
      setPracticeBusy(false); setShadowBusy(false); setSimBusy(false);
      setApprovalBusy(false); setTestingConnector(null);
      if(error instanceof SubscriptionBlockedError){ setToast({text:error.message,error:true}); window.setTimeout(()=>setToast(null),5200); void refreshBilling(); return }
      if(error instanceof UnauthorizedError){ setAuthState("anonymous"); return }
      setToast({text:lang==="ar"?"تعذّرت العملية. حاول مرة أخرى.":"Action failed. Try again.",error:true});
      window.setTimeout(()=>setToast(null),3200);
    }
  },[lang]);

  const refreshAudit=useCallback(async()=>{const d=await apiOrNull<{auditEvents:AuditEvent[]}>("/audit");if(d?.auditEvents)setAudit(d.auditEvents)},[]);
  const refreshWork=useCallback(async()=>{const d=await apiOrNull<{workItems:WorkItem[]}>("/work");if(d?.workItems)setWork(d.workItems)},[]);
  const refreshApprovals=useCallback(async()=>{const d=await apiOrNull<{approvalRequests:ApprovalRequest[]}>("/approvals");if(d?.approvalRequests)setApprovals(d.approvalRequests)},[]);
  const refreshSkills=useCallback(async()=>{const d=await apiOrNull<{skills:Skill[]}>("/skills");if(d?.skills)setSkills(d.skills)},[]);
  const refreshSimulator=useCallback(async()=>{const d=await apiOrNull<{state:SimulatorState}>("/simulator/state");if(d?.state)setSim(d.state)},[]);
  const refreshBilling=useCallback(async()=>{
    setBillingLoading(true);
    const [snapshot,catalogue]=await Promise.all([
      apiOrNull<BillingSnapshot>("/billing/subscription"),
      apiOrNull<{plans:Plan[]}>("/billing/plans"),
    ]);
    if(snapshot)setBilling(snapshot);
    if(catalogue?.plans)setPlans(catalogue.plans);
    setBillingLoading(false);
  },[]);

  useEffect(()=>{document.documentElement.dir=lang==="ar"?"rtl":"ltr";document.documentElement.lang=lang},[lang]);
  /*
   * الاختصار المكتوب على الحقل منذ البداية ولم يكن مربوطاً بشيء. ويُلتقط على
   * مستوى النافذة ليعمل من أي شاشة، ويُمنع السلوك الافتراضي للمتصفح.
   */
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setPaletteOpen(v=>!v)}
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);
  /*
   * فحص الهوية. قابل لإعادة النداء لأن الدخول إلى البيئة التجريبية يغيّر الجواب:
   * الزائر التجريبي يمرّ من الحارس بلا حساب، فيصير "authenticated" داخل صندوقه.
   */
  /*
   * ويُنادى بعد الدخول والتهيئة أيضاً، لا عند الإقلاع وحده.
   *
   * كان الدخول يضبط `authState` مباشرةً ولا يملأ `account` إطلاقاً — فيبقى null
   * حتى إعادة تحميل الصفحة. والنتيجة أن الدور مجهول في أول جلسة: لا يظهر مدخل
   * لوحة المالك لمالك النظام، ولا يُعرض زرّ تركيب حزمة النشاط لمن يملك تركيبها.
   * يدخل صاحب المنصة فلا يجد شاشته، ولا شيء يفسّر له لماذا.
   */
  const checkAuth=useCallback(async()=>{
    try{ const me=await authApi.me(); setAccount({id:me.account.id,role:me.account.role}); setAuthState("authenticated"); return true; }
    catch{ /* لا جلسة — نفحص هل النظام مُهيَّأ أصلاً قبل عرض شاشة دخول لا تنفع. */ }
    try{
      const status=await authApi.status();
      setAuthState(status.needsSetup?"setup":"anonymous");
    }catch{ setAuthState("anonymous"); }
    return false;
  },[]);

  /* One loader, used on boot and again whenever the demo sandbox is entered or
     reset — every screen has to repopulate from the sandbox, not just the one
     the visitor happens to be looking at. */
  const loadAll=useCallback(async()=>{
    try{
      const health=await apiOrNull<{status:string}>("/health"); setServerLive(health?.status==="ok");
      void refreshBilling();
      const [context,learn,sk,wo,ap,co,au,an,gv,td,si,pr]=await Promise.all([
        apiOrNull<ContextResponse>("/context"),
        apiOrNull<{proposals:LearningProposal[]}>("/learn"),
        apiOrNull<{skills:Skill[]}>("/skills"),
        apiOrNull<{workItems:WorkItem[]}>("/work"),
        apiOrNull<{approvalRequests:ApprovalRequest[]}>("/approvals"),
        apiOrNull<{connectors:Connector[]}>("/connections"),
        apiOrNull<{auditEvents:AuditEvent[]}>("/audit"),
        apiOrNull<AnalyticsData>("/analytics"),
        apiOrNull<{governance:GovernanceData}>("/governance"),
        apiOrNull<{metrics:any;institutionalMemoryCoverage:any}>("/today"),
        apiOrNull<{state:SimulatorState}>("/simulator/state"),
        apiOrNull<{testCases:TestCase[];shadowComparisons:ShadowComparison[]}>("/practice"),
      ]);
      if(context){setOrganization(context.organization);setUser(context.currentUser);setOrgConfigured(context.organizationConfigured!==false)}
      if(learn?.proposals)setProposals(learn.proposals); if(sk?.skills)setSkills(sk.skills); if(wo?.workItems)setWork(wo.workItems);
      if(ap?.approvalRequests)setApprovals(ap.approvalRequests); if(co?.connectors)setConnectors(co.connectors); if(au?.auditEvents)setAudit(au.auditEvents);
      if(an)setAnalytics(an); if(gv?.governance)setGovernance(gv.governance); if(td)setTodayData(td); if(si?.state)setSim(si.state);
      if(pr){setPractice(pr.testCases||[]);setShadow(pr.shadowComparisons||[])}
    }catch(error){
      // انتهاء الجلسة أثناء التحميل يعيدنا للبوابة بدل عرض بيانات بذرة كأنها سجلّ المؤسسة.
      if(error instanceof UnauthorizedError)setAuthState("anonymous");
    }
  },[refreshBilling]);

  const refreshDemoConfig=useCallback(async()=>{
    const cfg=await apiOrNull<{enabled:boolean;active:boolean}>("/demo/config");
    setDemoEnabled(Boolean(cfg?.enabled)); setDemoActive(Boolean(cfg?.active));
    return cfg;
  },[]);

  useEffect(()=>{void refreshDemoConfig();void checkAuth()},[refreshDemoConfig,checkAuth]);
  useEffect(()=>{if(authState==="authenticated")void loadAll()},[authState,loadAll]);

  const enterDemo=async(sector?:string)=>{
    setDemoBusy(true);
    const d=await apiOrNull<{ok:boolean}>("/demo/enter",{method:"POST",body:JSON.stringify(sector?{sector}:{})});
    if(d?.ok){await refreshDemoConfig();await checkAuth();await loadAll();notify(lang==="ar"?"أنت الآن في بيئة تجريبية معزولة — لا تتأثر بيانات المؤسسة":"You are in an isolated demo environment")}
    else notify(lang==="ar"?"تعذّر فتح البيئة التجريبية":"Could not start the demo",true);
    setDemoBusy(false);
  };
  const resetDemo=async()=>{
    setDemoBusy(true);
    const d=await apiOrNull<{ok:boolean}>("/demo/reset",{method:"POST",body:"{}"});
    if(d?.ok){await loadAll();notify(lang==="ar"?"تمت إعادة البيانات التجريبية":"Demo data reset")}
    else{await refreshDemoConfig();notify(lang==="ar"?"انتهت الجلسة التجريبية":"Demo session expired",true)}
    setDemoBusy(false);
  };
  /*
   * تسجيل الخروج.
   *
   * الخادم كان جاهزًا من البداية — `POST /api/auth/logout` يحذف صفّ الجلسة
   * ويمسح الكوكي — و`authApi.logout` موجودة. لكن لم يكن في الواجهة ما يناديها،
   * فلا سبيل إلى الخروج من الحساب أصلًا: يبقى مفتوحًا حتى تنتهي مهلته.
   *
   * وإعادة تحميل كاملة بعده، لا تبديلُ حالةٍ في المحلّ: على الشاشة سجلّ التدقيق
   * وطلبات الاعتماد ومهامّ صاحب الحساب السابق، وتركها في الذاكرة يعني أنها قد
   * تلمع لمن يدخل بعده. الصفحة تُبنى من الصفر، فلا يبقى منه شيء.
   *
   * وفشلُ الطلب لا يُدّعى نجاحًا: الكوكي لم تُمسح، والجلسة قائمة — فيُقال ذلك
   * ولا يُعاد التحميل، لأن إعادته تُظهر شاشة دخولٍ بينما الحساب ما زال مفتوحًا.
   */
  const [helpOpen,setHelpOpen]=useState(false);
  const [paletteOpen,setPaletteOpen]=useState(false);
  const [signingOut,setSigningOut]=useState(false);
  const signOut=async()=>{
    setSigningOut(true);
    try{
      await authApi.logout();
    }catch{
      setSigningOut(false);
      notify(lang==="ar"?"تعذّر تسجيل الخروج. تحقّق من الاتصال ثم أعد المحاولة":"Could not sign out. Check your connection and try again",true);
      return;
    }
    window.location.reload();
  };

  const exitDemo=async()=>{
    setDemoBusy(true);
    await apiOrNull<{ok:boolean}>("/demo/exit",{method:"POST",body:"{}"});
    await refreshDemoConfig(); await checkAuth();
    setDemoBusy(false);
    notify(lang==="ar"?"تم الخروج من البيئة التجريبية":"Left the demo environment");
  };

  const resolve=guarded(async(proposalId:string,clarificationId:string,answer:string)=>{
    const d=await apiOrNull<{proposal:LearningProposal}>("/learn/clarify",{method:"POST",body:JSON.stringify({proposalId,clarificationId,selectedAnswer:answer})});
    if(d?.proposal)setProposals(v=>v.map(p=>p.id===proposalId?d.proposal:p));
    else setProposals(v=>v.map(p=>p.id===proposalId?{...p,status:"resolved",clarifications:p.clarifications?.map(c=>c.id===clarificationId?{...c,selectedAnswer:answer}:c)}:p));
    notify(lang==="ar"?"تم اعتماد القرار في عقل المؤسسة":"Decision verified in Company Brain");void refreshAudit();
  });
  const promote=guarded(async(id:string,l:AutonomyLevel)=>{
    const d=await apiOrNull<{success:boolean;message:string;skill?:Skill}>(`/skills/${id}/promote`,{method:"POST",body:JSON.stringify({targetLevel:l})});
    if(d?.success&&d.skill)setSkills(v=>v.map(s=>s.id===id?d.skill!:s));
    else if(d && !d.success){notify(d.message,true);return}else setSkills(v=>v.map(s=>s.id===id?{...s,autonomyLevel:l}:s));
    notify(lang==="ar"?"تم تحديث مستوى الاستقلالية":"Autonomy updated");void refreshAudit();
  });
  const rollback=guarded(async(id:string,v:number)=>{const d=await apiOrNull<{success:boolean;message:string;skill?:Skill}>(`/skills/${id}/rollback`,{method:"POST",body:JSON.stringify({targetVersion:v})});if(d?.skill)setSkills(x=>x.map(s=>s.id===id?d.skill!:s));else setSkills(x=>x.map(s=>s.id===id?{...s,activeVersion:v}:s));notify(d?.message|| (lang==="ar"?`تم الرجوع إلى v${v}`:`Rolled back to v${v}`));void refreshAudit()});
  const toggleSkill=guarded(async(id:string)=>{const d=await apiOrNull<{skill?:Skill;active?:boolean}>(`/skills/${id}/killswitch`,{method:"POST",body:"{}"});if(d?.skill)setSkills(x=>x.map(s=>s.id===id?d.skill!:s));else setSkills(x=>x.map(s=>s.id===id?{...s,killSwitchActive:!s.killSwitchActive}:s));notify(lang==="ar"?"تم تحديث حالة المهارة":"Skill state updated");void refreshAudit()});
  const runPractice=guarded(async()=>{setPracticeBusy(true);const d=await apiOrNull<{testCases:TestCase[];passRate:number|null;passedCount:number;totalCount:number}>("/practice/run",{method:"POST",body:"{}"});if(d?.testCases)setPractice(d.testCases);setPracticeBusy(false);
    /*
     * النتيجة تُقال كما هي، نجحت أو رسبت. كان المحرّك يُنجح الكل دائماً، فلم يكن
     * لهذا الإشعار معنى — والآن الرسوب وارد، وهو أهمّ ما يُقال للمستخدم.
     */
    notify(lang==="ar"
      ?(d?.passRate==null?"لا حالات اختبار معرَّفة — لم يجرِ تقييم":`اكتمل التقييم — اجتازت ${d.passedCount} من ${d.totalCount} (${d.passRate}%)`)
      :"Practice complete", Boolean(d&&d.passRate!==null&&d.passRate<100));void refreshAudit()});
  const runShadow=guarded(async()=>{setShadowBusy(true);const d=await apiOrNull<{comparisons:ShadowComparison[];matchRate:number|null}>("/shadow/run",{method:"POST",body:"{}"});if(d?.comparisons)setShadow(d.comparisons);setShadowBusy(false);
    /* النسبة قد تكون null بحقّ: لا حالة تحمل قراراً بشرياً يُقارَن به. */
    notify(lang==="ar"?(d?.matchRate==null?"لا حالات ظلّ تحمل قراراً بشرياً — لم تجرِ مقارنة":`اكتمل الظل — تطابق ${d.matchRate}%`):"Shadow comparison complete");void refreshAudit()});
  const takeOver=guarded(async(id:string)=>{const d=await apiOrNull<{item:WorkItem}>(`/work/${id}/takeover`,{method:"POST",body:"{}"});if(d?.item)setWork(v=>v.map(w=>w.id===id?d.item:w));else setWork(v=>v.map(w=>w.id===id?{...w,assignedMode:"human_takeover"}:w));setActiveApproval(null);notify(lang==="ar"?"استلم الموظف الحالة":"Human takeover active");void refreshAudit()});
  const resume=guarded(async(id:string)=>{const d=await apiOrNull<{item:WorkItem}>(`/work/${id}/resume-ai`,{method:"POST",body:"{}"});if(d?.item)setWork(v=>v.map(w=>w.id===id?d.item:w));else setWork(v=>v.map(w=>w.id===id?{...w,assignedMode:"ai"}:w));notify(lang==="ar"?"عاد التنفيذ إلى نهج":"NAHJ resumed");void refreshAudit()});
  const decideApproval=guarded(async(id:string,decision:"approved"|"rejected",comments="")=>{setApprovalBusy(true);const d=await apiOrNull<{success:boolean}>(`/approvals/${id}/decide`,{method:"POST",body:JSON.stringify({decision,comments})});setApprovalBusy(false);
    /* رفض الخادم (صلاحية، أو حُسم من قبل) لا يُعرض نجاحاً ولا يُعلَّم محلياً معتمداً. */
    if(!d?.success){await refreshApprovals();notify(lang==="ar"?"لم يُنفَّذ القرار — تحقّق من صلاحيتك أو أن الطلب لم يُحسم من قبل":"Decision not applied — check your permission or whether it was already decided",true);return;}
    await Promise.all([refreshApprovals(),refreshWork(),refreshSimulator(),refreshAudit()]);setActiveApproval(null);notify(decision==="approved"?(lang==="ar"?"تم الاعتماد والتنفيذ":"Approved & executed"):(lang==="ar"?"تم الرفض":"Rejected"))});
  const testConnector=guarded(async(id:string)=>{setTestingConnector(id);const d=await apiOrNull<{connector:Connector}>(`/connections/${id}/test`,{method:"POST",body:"{}"});if(d?.connector)setConnectors(v=>v.map(c=>c.id===id?d.connector:c));setTestingConnector(null);notify(lang==="ar"?"الاتصال سليم":"Connection healthy");void refreshAudit()});
  const simSend=guarded(async(text:string)=>{setSimBusy(true);const d=await apiOrNull<{state:SimulatorState}>("/simulator/message",{method:"POST",body:JSON.stringify({text})});if(d?.state){setSim(d.state);/* طلب الموافقة الذي فتحته المحادثة يُحمَّل ليظهر في البوابة والتنبيهات. */if(d.state.approvalStatus==="pending")await loadAll();}else setSim(v=>({...v,messages:[...v.messages,{id:`c_${Date.now()}`,sender:"customer",text,timestamp:"الآن"},{id:`a_${Date.now()}`,sender:"ai",text:lang==="ar"?"وصلت رسالتك. أتابعها وفق الإجراء المعتمد.":"Got it. I’m following the verified process.",timestamp:"الآن"}]}));setSimBusy(false)});
  const simReset=guarded(async()=>{const d=await apiOrNull<{state:SimulatorState}>("/simulator/reset",{method:"POST",body:"{}"});setSim(d?.state||fallbackSimulator)});
  const simUpload=guarded(async()=>{setSimBusy(true);const d=await apiOrNull<{state:SimulatorState}>("/simulator/upload-doc",{method:"POST",body:"{}"});if(d?.state)setSim(d.state);await Promise.all([refreshApprovals(),refreshWork()]);setSimBusy(false);notify(lang==="ar"?"تم التحقق من المستند":"Document verified")});
  const codified=guarded(async()=>{await refreshSkills();const context=await apiOrNull<ContextResponse>("/context");if(context)setOrganization(context.organization);setSection("skills")});

  const approvalByWork=useMemo(()=>Object.fromEntries(approvals.filter(a=>a.status==="pending").map(a=>[a.workItemId,a.id])),[approvals]);
  const activeApprovalObj=approvals.find(a=>a.id===activeApproval&&a.status==="pending")||null;
  const alertCount=approvals.filter(a=>a.status==="pending").length+proposals.filter(p=>p.status==="pending").length;
  const isOwner=account?.role==="owner";

  if(authState==="checking")return <div className="boot-gate"/>;
  if(authState==="anonymous"||authState==="setup")
    return <LoginScreen lang={lang} needsSetup={authState==="setup"} onAuthenticated={()=>void checkAuth()}/>;

  /*
   * حساب المسوّق سطحٌ واحد.
   *
   * لا شريط تنقّل ولا شاشات تشغيلية: هو طرفٌ خارجي لا شأن له بمهارات المؤسسة
   * ولا حالات عملها. والخادم يحجبه أيضاً — فالحجب في الطبقتين لا في الواجهة
   * وحدها، لأن واجهةً تُخفي زرّاً تبقى مساراتها مفتوحة لمن يعرف عنوانها.
   */
  /*
   * نشرٌ لم تُعِدّه مؤسسته بعد: شاشة الإعداد بدل شاشات العمل. فبذرة العرض لا
   * تُعرض أبداً على أنها سجلّ المؤسسة. والمسوّق خارج هذا — لوحته لا تمسّ المؤسسة.
   */
  /*
   * مالك المنصة قبل الإعداد: لوحته وحدها في إطارٍ بسيط — لا شاشات تشغيلٍ تعرض
   * بذرة العرض. وزرٌّ يعيده إلى الإعداد متى أراد.
   */
  if(orgConfigured===false&&!demoActive&&isOwner&&ownerOnly)
    return <div className="partner-shell" dir={lang==="ar"?"rtl":"ltr"}>
      <div className="ambient-canvas" aria-hidden="true"/>
      <header className="partner-topbar">
        <BrandLockup compact/>
        <div className="owner-only-actions">
          <button type="button" className="btn-secondary" onClick={()=>setOwnerOnly(false)}>{lang==="ar"?"أعِدّ المؤسسة":"Set up organization"}</button>
          <button type="button" className="top-icon" onClick={()=>void signOut()} disabled={signingOut}
            title={lang==="ar"?"تسجيل الخروج":"Sign out"} aria-label={lang==="ar"?"تسجيل الخروج":"Sign out"}><LogOut/></button>
        </div>
      </header>
      <main className="partner-stage"><OwnerView lang={lang} notify={notify} onChanged={()=>void refreshBilling()}/></main>
      {toast&&<div className={`toast ${toast.error?"error":""}`}>{toast.error?<TriangleAlert/>:<CheckCircle2/>}<span>{toast.text}</span></div>}
    </div>;

  if(orgConfigured===false&&!demoActive&&account?.role!=="partner")
    return <OrgSetupView lang={lang} canSetup={account?.role==="admin"||account?.role==="owner"}
      onDone={()=>{void loadAll();setSection("today");window.scrollTo(0,0)}} onSignOut={()=>void signOut()}
      onOpenOwner={isOwner?()=>setOwnerOnly(true):undefined}/>;

  if(account?.role==="partner")
    return <div className="partner-shell" dir={lang==="ar"?"rtl":"ltr"}>
      <div className="ambient-canvas" aria-hidden="true"/>
      <header className="partner-topbar">
        <BrandLockup compact/>
        <button type="button" className="top-icon" onClick={()=>void signOut()} disabled={signingOut}
          title={lang==="ar"?"تسجيل الخروج":"Sign out"} aria-label={lang==="ar"?"تسجيل الخروج":"Sign out"}><LogOut/></button>
      </header>
      <main className="partner-stage"><PartnerPortalView lang={lang} notify={notify}/></main>
      {toast&&<div className={`toast ${toast.error?"error":""}`}>{toast.error?<TriangleAlert/>:<CheckCircle2/>}<span>{toast.text}</span></div>}
    </div>;

  let view:React.ReactNode;
  switch(section){
    case "today":view=<TodayView lang={lang} organization={organization} onNavigate={setSection} approvals={approvals} proposals={proposals} workItems={work} onApproval={setActiveApproval} todayMetrics={todayData?.metrics||null} memory={todayData?.institutionalMemoryCoverage||null} skills={skills} practiceCount={practice.length} canManageAccounts={account?.role==="admin"||account?.role==="owner"}/>;break;
    case "learn":view=<LearnView lang={lang} proposals={proposals} onResolve={resolve}/>;break;
    case "teach":view=<TeachView lang={lang} onSkillCodified={()=>void codified()} onNotify={notify}/>;break;
    case "skills":view=<SkillsView lang={lang} skills={skills} onPromote={(id,l)=>void promote(id,l)} onRollback={(id,v)=>void rollback(id,v)} onToggleKill={id=>void toggleSkill(id)}/>;break;
    case "practice":view=<PracticeView lang={lang} cases={practice} shadow={shadow} running={practiceBusy} shadowRunning={shadowBusy} onRunPractice={()=>void runPractice()} onRunShadow={()=>void runShadow()}/>;break;
    case "work":view=<WorkView lang={lang} items={work} approvalByWork={approvalByWork} onTakeOver={id=>void takeOver(id)} onResume={id=>void resume(id)} onApproval={setActiveApproval}/>;break;
    case "simulator":view=<SimulatorView lang={lang} state={sim} busy={simBusy} onSend={t=>void simSend(t)} onReset={()=>void simReset()} onUpload={()=>void simUpload()} onOpenApproval={()=>{/* الطلب الذي فتحته هذه المحادثة بعينه — لا أول طلبٍ معلّق في المؤسسة. */const a=approvals.find(x=>x.id===sim.approvalId&&x.status==="pending")||approvals.find(x=>x.status==="pending");if(a)setActiveApproval(a.id)}}/>;break;
    case "connections":view=<ConnectionsView lang={lang} connectors={connectors} testingId={testingConnector} onTest={id=>void testConnector(id)}/>;break;
    case "analytics":view=<AnalyticsView lang={lang} data={analytics}/>;break;
    case "control":view=<ControlView lang={lang} governance={governance} paused={paused} onPause={()=>{setPaused(v=>!v);notify(!paused?(lang==="ar"?"تم إيقاف التنفيذ الآلي":"Execution paused"):(lang==="ar"?"تم الاستئناف":"Execution resumed"))}}/>;break;
    case "audit":view=<AuditView lang={lang} events={audit}/>;break;
    case "accounts":view=<AccountsView lang={lang} currentAccountId={account?.id||""} isAdmin={account?.role==="admin"||account?.role==="owner"} notify={notify}/>;break;
    case "partners":view=<PartnersAdminView lang={lang} notify={notify}/>;break;
    case "partnerPortal":view=<PartnerPortalView lang={lang} notify={notify}/>;break;
    case "sectors":view=<SectorsView lang={lang} isDemo={demoActive} canApply={account?.role==="admin"||account?.role==="owner"} notify={notify} onApplied={()=>void loadAll()}/>;break;
    case "billing":view=<BillingView lang={lang} snapshot={billing} plans={plans} loading={billingLoading} canRequest={account?.role==="admin"||account?.role==="manager"} canPay={account?.role==="admin"||account?.role==="manager"||account?.role==="owner"} onRefresh={()=>void refreshBilling()} notify={notify}/>;break;
    /* لوحة المالك لا تُركَّب أصلاً لغير المالك — والخادم يرفضها أيضاً، فالحجب في الطبقتين. */
    case "owner":view=isOwner?<OwnerView lang={lang} notify={notify} onChanged={()=>void refreshBilling()}/>:<BillingView lang={lang} snapshot={billing} plans={plans} loading={billingLoading} canRequest={false} canPay={account?.role==="owner"} onRefresh={()=>void refreshBilling()} notify={notify}/>;break;
  }

  return <>
    <Shell section={section} onSection={setSection} organization={organization} user={user} lang={lang} onToggleLang={()=>setLang(v=>v==="ar"?"en":"ar")} alerts={alertCount} onAlert={()=>{const a=approvals.find(x=>x.status==="pending");if(a)setActiveApproval(a.id);else setSection("learn")}} serverLive={serverLive} demoEnabled={demoEnabled} demoActive={demoActive} demoBusy={demoBusy} onEnterDemo={()=>void enterDemo()} onResetDemo={()=>void resetDemo()} onExitDemo={()=>void exitDemo()} onSignOut={()=>void signOut()} signingOut={signingOut} onHelp={()=>setHelpOpen(true)} onSearch={()=>setPaletteOpen(true)} isOwner={isOwner} licenceBanner={<SubscriptionBanner snapshot={billing} lang={lang} onOpen={()=>setSection("billing")}/>}>{paused&&<div className="pause-banner"><TriangleAlert/>{lang==="ar"?"التنفيذ الآلي متوقف. التعلم والمراجعة يعملان.":"Autonomous execution is paused. Learning and review remain active."}</div>}{view}</Shell>
    <ApprovalModal lang={lang} approval={activeApprovalObj} busy={approvalBusy} onClose={()=>setActiveApproval(null)} onApprove={id=>void decideApproval(id,"approved")} onReject={(id,r)=>void decideApproval(id,"rejected",r)} onTakeOver={id=>void takeOver(id)}/>
    <HelpPanel open={helpOpen} onClose={()=>setHelpOpen(false)}/>
    <CommandPalette open={paletteOpen} onClose={()=>setPaletteOpen(false)} lang={lang} skills={skills} workItems={work}
      approvals={approvals} audit={audit} isOwner={isOwner}
      onGo={(target:CommandTarget)=>{setSection(target.section);if(target.approvalId)setActiveApproval(target.approvalId)}}/>
    {toast&&<div className={`toast ${toast.error?"error":""}`}>{toast.error?<TriangleAlert/>:<CheckCircle2/>}<span>{toast.text}</span></div>}
  </>;
}
