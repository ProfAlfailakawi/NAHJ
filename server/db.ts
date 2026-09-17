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
 * يبدأ من الصفر عند كل إقلاع.
 */
function hydrate<T>(key: string, seed: T): T {
  const persisted = readState<T>(key);
  return persisted === undefined ? seed : persisted;
}

class Store {
  public organization: Organization = hydrate("organization", { ...initialOrganization });
  public users: User[] = hydrate("users", [...demoUsers]);
  public currentUserId: string = hydrate("currentUserId", "usr_noura");
  public knowledgeSources: KnowledgeSource[] = hydrate("knowledgeSources", [...initialKnowledgeSources]);
  public policies: Policy[] = hydrate("policies", [...initialPolicies]);
  public skills: Skill[] = hydrate("skills", JSON.parse(JSON.stringify(initialSkills)));
  public learningProposals: LearningProposal[] = hydrate("learningProposals", JSON.parse(JSON.stringify(initialLearningProposals)));
  public learningSessions: LearningSession[] = hydrate("learningSessions", [] as LearningSession[]);
  public workItems: WorkItem[] = hydrate("workItems", JSON.parse(JSON.stringify(initialWorkItems)));
  public approvalRequests: ApprovalRequest[] = hydrate("approvalRequests", JSON.parse(JSON.stringify(initialApprovalRequests)));
  public auditEvents: AuditEvent[] = hydrate("auditEvents", JSON.parse(JSON.stringify(initialAuditEvents)));
  public connectors: Connector[] = hydrate("connectors", JSON.parse(JSON.stringify(initialConnectors)));
  public testCases: TestCase[] = hydrate("testCases", JSON.parse(JSON.stringify(initialTestCases)));
  public shadowComparisons: ShadowComparison[] = hydrate("shadowComparisons", JSON.parse(JSON.stringify(initialShadowComparisons)));

  public simulatorState: SimulatorState = hydrate("simulatorState", {
    step: "initial" as const,
    messages: [
      {
        id: "msg_welcome",
        sender: "ai",
        text: "أهلاً بك في أكاديمية المستقبل الدولية! يسعدنا تواصلكم واستقبال استفساركم بشأن تسجيل طلاب جدد للعام الدراسي 2026/2027.",
        timestamp: "10:14 ص",
      },
    ],
  });

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
    void syncDocToFirestore("auditEvents", newEvent.id, newEvent);
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
    void syncDocToFirestore("simulator", "state", this.simulatorState);
  }

  /**
   * Synchronize entire operational memory to Firebase Firestore project nahj-a27a4
   */
  public async syncAllToFirebase(): Promise<{ success: boolean; count: number; status: any }> {
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

export const db = new Store();

/** اللقطة التي يحفظها العامل الدوري. كل مفتاح هنا يقابل مفتاحاً في hydrate أعلاه. */
export function snapshotState(): Record<string, unknown> {
  return {
    organization: db.organization,
    users: db.users,
    currentUserId: db.currentUserId,
    knowledgeSources: db.knowledgeSources,
    policies: db.policies,
    skills: db.skills,
    learningProposals: db.learningProposals,
    learningSessions: db.learningSessions,
    workItems: db.workItems,
    approvalRequests: db.approvalRequests,
    auditEvents: db.auditEvents,
    connectors: db.connectors,
    testCases: db.testCases,
    shadowComparisons: db.shadowComparisons,
    simulatorState: db.simulatorState,
  };
}

export const persistence = startPersistenceWorker(snapshotState);
