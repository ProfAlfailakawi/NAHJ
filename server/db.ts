import {
  initialOrganization,
  demoUsers,
  initialKnowledgeSources,
  initialPolicies,
  initialSkills,
  initialLearningProposals,
  initialWorkItems,
  initialApprovalRequests,
  initialAuditEvents,
  initialConnectors,
  initialTestCases,
  initialShadowComparisons,
} from "../src/data/seedData.ts";
import {
  Organization,
  User,
  KnowledgeSource,
  Policy,
  Skill,
  LearningProposal,
  WorkItem,
  ApprovalRequest,
  AuditEvent,
  Connector,
  TestCase,
  ShadowComparison,
  LearningSession,
} from "../src/types/index.ts";
import { syncDocToFirestore, getFirebaseStatus } from "./firebase.ts";
import { AUDIT_RETENTION, readState, startPersistenceWorker } from "./persistence.ts";
import { AsyncLocalStorage } from "node:async_hooks";
import { createDemoSandboxSeed, type DemoSandboxSeed } from "./demoSandbox.ts";

export interface SimulatorMessage {
  id: string;
  sender: "customer" | "ai" | "system";
  text: string;
  timestamp: string;
  cardType?: "info" | "fee_quote" | "document_request" | "booking_confirmation" | "approval_pending";
  metadata?: Record<string, any>;
}

export interface SimulatorState {
  step: "initial" | "age_asked" | "grade_confirmed" | "doc_requested" | "doc_uploaded" | "booking_offered" | "approval_triggered" | "completed";
  studentName?: string;
  childAge?: number;
  grade?: string;
  civilIdNumber?: string;
  civilIdVerified?: boolean;
  visitDate?: string;
  tuitionFee?: number;
  requiresManagerApproval?: boolean;
  approvalStatus?: "pending" | "approved";
  messages: SimulatorMessage[];
}

/*
 * يُعيد ما حُفظ سابقاً إن وُجد، وإلا البذرة. هذا هو الفرق بين منتج يتذكّر ونموذج عرض
 * يبدأ من الصفر عند كل إقلاع. يُستعمل للمخزن الحقيقي فقط — البيئة التجريبية لا تُحفظ
 * ولا تُقرأ من القرص إطلاقاً.
 */
function hydrate<T>(key: string, seed: T): T {
  const persisted = readState<T>(key);
  return persisted === undefined ? seed : persisted;
}

export class Store {
  /**
   * `isDemo` is the one switch that keeps a visitor's synthetic activity out of
   * the institution's Firestore project. Every write path below checks it, so a
   * demo session can be as noisy as it likes without leaving a trace in real data.
   *
   * It is also what decides where this store's initial contents come from: a demo
   * store clones the synthetic seed, while the real store hydrates from SQLite so
   * a restart does not erase what the institution actually did.
   */
  public readonly isDemo: boolean;
  public organization: Organization;
  public users: User[];
  public currentUserId: string;
  public knowledgeSources: KnowledgeSource[];
  public policies: Policy[];
  public skills: Skill[];
  public learningProposals: LearningProposal[];
  public learningSessions: LearningSession[];
  public workItems: WorkItem[];
  public approvalRequests: ApprovalRequest[];
  public auditEvents: AuditEvent[];
  public connectors: Connector[];
  public testCases: TestCase[];
  public shadowComparisons: ShadowComparison[];

  constructor(seed?: DemoSandboxSeed) {
    this.isDemo = Boolean(seed);
    const persisted = <T>(key: string, value: T): T => (seed ? value : hydrate(key, value));

    this.organization = seed ? seed.organization : persisted("organization", { ...initialOrganization });
    this.users = seed ? seed.users : persisted("users", [...demoUsers]);
    this.currentUserId = seed ? "usr_noura" : persisted("currentUserId", "usr_noura");
    this.knowledgeSources = seed ? seed.knowledgeSources : persisted("knowledgeSources", [...initialKnowledgeSources]);
    this.policies = seed ? seed.policies : persisted("policies", [...initialPolicies]);
    this.skills = seed ? seed.skills : persisted("skills", JSON.parse(JSON.stringify(initialSkills)));
    this.learningProposals = seed ? seed.learningProposals : persisted("learningProposals", JSON.parse(JSON.stringify(initialLearningProposals)));
    this.learningSessions = seed ? [] : persisted("learningSessions", [] as LearningSession[]);
    this.workItems = seed ? seed.workItems : persisted("workItems", JSON.parse(JSON.stringify(initialWorkItems)));
    this.approvalRequests = seed ? seed.approvalRequests : persisted("approvalRequests", JSON.parse(JSON.stringify(initialApprovalRequests)));
    this.auditEvents = seed ? seed.auditEvents : persisted("auditEvents", JSON.parse(JSON.stringify(initialAuditEvents)));
    this.connectors = seed ? seed.connectors : persisted("connectors", JSON.parse(JSON.stringify(initialConnectors)));
    this.testCases = seed ? seed.testCases : persisted("testCases", JSON.parse(JSON.stringify(initialTestCases)));
    this.shadowComparisons = seed ? seed.shadowComparisons : persisted("shadowComparisons", JSON.parse(JSON.stringify(initialShadowComparisons)));

    const freshSimulator: SimulatorState = {
      step: "initial",
    messages: [
      {
        id: "msg_welcome",
        sender: "ai",
        text: "أهلاً بك في أكاديمية المستقبل الدولية! يسعدنا تواصلكم واستقبال استفساركم بشأن تسجيل طلاب جدد للعام الدراسي 2026/2027.",
        timestamp: "10:14 ص",
      },
    ],
    };
    this.simulatorState = seed ? freshSimulator : persisted("simulatorState", freshSimulator);
  }

  /*
   * يُسنَد في الباني لا كمُهيّئ حقل: مُهيّئات الحقول تعمل قبل جسم الباني، فكانت
   * `this.isDemo` ما تزال undefined وتأخذ كل بيئة تجريبية الحالة المحفوظة من القرص —
   * أي العكس تماماً من الغرض.
   */
  public simulatorState: SimulatorState;

  public getCurrentUser(): User {
    return this.users.find((u) => u.id === this.currentUserId) || this.users[0];
  }

  public setCurrentUser(userId: string): User {
    const u = this.users.find((x) => x.id === userId);
    if (u) {
      this.currentUserId = u.id;
      return u;
    }
    return this.getCurrentUser();
  }

  public logAudit(event: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")} ${now.getHours() >= 12 ? "م" : "ص"}`;
    const newEvent: AuditEvent = {
      id: `aud_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: `اليوم، ${timeStr}`,
      ...event,
    };
    this.auditEvents.unshift(newEvent);
    // سجل التدقيق يُقصّ عند حدّ ثابت وإلا نما بلا سقف في الذاكرة وفي الملف معاً.
    if (this.auditEvents.length > AUDIT_RETENTION) this.auditEvents.length = AUDIT_RETENTION;
    // Background sync to Firestore nahj-a27a4 — never from a demo sandbox.
    if (!this.isDemo) void syncDocToFirestore("auditEvents", newEvent.id, newEvent);
    return newEvent;
  }

  public resetSimulator(): void {
    this.simulatorState = {
      step: "initial",
      messages: [
        {
          id: "msg_welcome_reset",
          sender: "ai",
          text: "أهلاً بك في أكاديمية المستقبل الدولية! يسعدنا تواصلكم واستقبال استفساركم بشأن تسجيل طلاب جدد للعام الدراسي 2026/2027.",
          timestamp: "الآن",
        },
      ],
    };
    if (!this.isDemo) void syncDocToFirestore("simulator", "state", this.simulatorState);
  }

  /**
   * Synchronize entire operational memory to Firebase Firestore project nahj-a27a4
   */
  public async syncAllToFirebase(): Promise<{ success: boolean; count: number; status: any }> {
    // A sandbox never publishes. Reporting success keeps the demo's own
    // "sync" screen honest-looking without a single document being written.
    if (this.isDemo) return { success: true, count: 0, status: getFirebaseStatus() };
    try {
      let count = 0;
      // 1. Organization & Users
      await syncDocToFirestore("organization", "current", this.organization);
      count++;
      for (const u of this.users) {
        await syncDocToFirestore("users", u.id, u);
        count++;
      }
      // 2. Skills
      for (const s of this.skills) {
        await syncDocToFirestore("skills", s.id, s);
        count++;
      }
      // 3. Work items
      for (const w of this.workItems) {
        await syncDocToFirestore("workItems", w.id, w);
        count++;
      }
      // 4. Learning proposals
      for (const p of this.learningProposals) {
        await syncDocToFirestore("learningProposals", p.id, p);
        count++;
      }
      // 5. Approvals
      for (const a of this.approvalRequests) {
        await syncDocToFirestore("approvalRequests", a.id, a);
        count++;
      }
      // 6. Connectors
      for (const c of this.connectors) {
        await syncDocToFirestore("connectors", c.id, c);
        count++;
      }
      // 7. Audit events
      for (const e of this.auditEvents.slice(0, 30)) {
        await syncDocToFirestore("auditEvents", e.id, e);
        count++;
      }
      // 8. Test cases & Shadow comparisons
      for (const t of this.testCases) {
        await syncDocToFirestore("testCases", t.id, t);
        count++;
      }
      for (const sc of this.shadowComparisons) {
        await syncDocToFirestore("shadowComparisons", sc.id, sc);
        count++;
      }
      // 9. Simulator state
      await syncDocToFirestore("simulator", "state", this.simulatorState);
      count++;

      console.log(`[Firebase nahj-a27a4] Successfully synced ${count} entities to Firestore.`);
      return { success: true, count, status: getFirebaseStatus() };
    } catch (err: any) {
      console.warn("[Firebase nahj-a27a4] Sync error:", err);
      return { success: false, count: 0, status: getFirebaseStatus() };
    }
  }
}

const baseStore = new Store();

/**
 * Demo sandboxes.
 *
 * Each visitor who enters Demo is handed a private `Store`, kept in memory and
 * reachable only through their own session cookie. `db` is a proxy: inside a
 * demo request it resolves to that visitor's sandbox, and everywhere else to
 * the single real store. Route handlers were written against `db` and did not
 * have to change.
 */
type DemoRecord = { store: Store; expiresAt: number };
const demoContext = new AsyncLocalStorage<{ sessionId: string; store: Store }>();
const demoSandboxes = new Map<string, DemoRecord>();

function currentStore(): Store {
  return demoContext.getStore()?.store || baseStore;
}

export const db: Store = new Proxy(baseStore, {
  get(_target, prop, receiver) {
    const store = currentStore();
    const value = Reflect.get(store, prop, receiver);
    return typeof value === "function" ? value.bind(store) : value;
  },
  set(_target, prop, value) {
    return Reflect.set(currentStore(), prop, value);
  },
  has(_target, prop) { return Reflect.has(currentStore(), prop); },
  ownKeys() { return Reflect.ownKeys(currentStore()); },
  getOwnPropertyDescriptor(_target, prop) { return Reflect.getOwnPropertyDescriptor(currentStore(), prop); },
}) as Store;

export const DEMO_SESSION_TTL_MS = 60 * 60 * 1000;

/** Drop sandboxes whose visitor left, so an unattended demo cannot grow without bound. */
function sweepExpiredSandboxes(): void {
  const now = Date.now();
  for (const [id, record] of demoSandboxes) if (record.expiresAt <= now) demoSandboxes.delete(id);
}

export const DemoSandbox = {
  isDemoRequest: (): boolean => Boolean(demoContext.getStore()),
  currentSessionId: (): string => demoContext.getStore()?.sessionId || "",
  create(sessionId: string, ttlMs: number = DEMO_SESSION_TTL_MS): void {
    sweepExpiredSandboxes();
    demoSandboxes.set(sessionId, { store: new Store(createDemoSandboxSeed()), expiresAt: Date.now() + ttlMs });
  },
  reset(sessionId: string, ttlMs: number = DEMO_SESSION_TTL_MS): boolean {
    if (!sessionId.startsWith("demo_") || !demoSandboxes.has(sessionId)) return false;
    demoSandboxes.set(sessionId, { store: new Store(createDemoSandboxSeed()), expiresAt: Date.now() + ttlMs });
    return true;
  },
  destroy(sessionId: string): void { demoSandboxes.delete(sessionId); },
  /** Runs `fn` bound to the visitor's sandbox. Returns false when the session has expired. */
  run(sessionId: string, ttlMs: number, fn: () => void): boolean {
    const record = demoSandboxes.get(sessionId);
    if (!record || record.expiresAt <= Date.now()) { demoSandboxes.delete(sessionId); return false; }
    record.expiresAt = Date.now() + ttlMs;
    demoContext.run({ sessionId, store: record.store }, fn);
    return true;
  },
};

/*
 * اللقطة التي يحفظها العامل الدوري. تقرأ من `baseStore` صراحةً لا من الوكيل `db`:
 * الوكيل يتحوّل إلى صندوق الزائر التجريبي داخل طلبه، وقراءة منه هنا كانت ستكتب
 * بيانات تجريبية مكان بيانات المؤسسة.
 */
export function snapshotState(): Record<string, unknown> {
  return {
    organization: baseStore.organization,
    users: baseStore.users,
    currentUserId: baseStore.currentUserId,
    knowledgeSources: baseStore.knowledgeSources,
    policies: baseStore.policies,
    skills: baseStore.skills,
    learningProposals: baseStore.learningProposals,
    learningSessions: baseStore.learningSessions,
    workItems: baseStore.workItems,
    approvalRequests: baseStore.approvalRequests,
    auditEvents: baseStore.auditEvents,
    connectors: baseStore.connectors,
    testCases: baseStore.testCases,
    shadowComparisons: baseStore.shadowComparisons,
    simulatorState: baseStore.simulatorState,
  };
}

export const persistence = startPersistenceWorker(snapshotState);

// Non-blocking background sync to Firebase project nahj-a27a4 after boot
setTimeout(() => {
  void baseStore.syncAllToFirebase().catch((err) => {
    console.warn("[Firebase] Background initial sync handled:", err);
  });
}, 8000);
