export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ReliabilityTier = 'low' | 'medium' | 'high' | 'verified';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type UserRole = 'owner' | 'admin' | 'manager' | 'employee' | 'auditor';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  avatar: string;
}

export interface Organization {
  id: string;
  name: string;
  nameEn: string;
  industry: string;
  tagline: string;
  logo: string;
  verifiedSkillsCount: number;
  hoursSavedMonth: number;
}

export interface KnowledgeSource {
  id: string;
  title: string;
  type: 'system_sis' | 'approved_policy' | 'document' | 'sop' | 'catalog';
  authorityLevel: 'live_authoritative' | 'approved_policy' | 'approved_data' | 'observed';
  lastVerified: string;
  owner: string;
  summary: string;
  status: 'active' | 'outdated' | 'review_required';
  referenceCount: number;
}

export interface PolicyRule {
  condition: string;
  action: string;
  explanation: string;
}

export interface Policy {
  id: string;
  code: string;
  title: string;
  titleEn: string;
  riskLevel: RiskLevel;
  version: number;
  effectiveFrom: string;
  effectiveTo?: string;
  approvedBy: string;
  summary: string;
  rules: PolicyRule[];
}

export interface SkillStep {
  id: string;
  order: number;
  title: string;
  description: string;
  system: string;
  actionRequired?: string;
  decisionRule?: string;
  isAutomated: boolean;
}

export interface SkillDecision {
  condition: string;
  outcome: string;
  risk: RiskLevel;
}

export interface SkillException {
  scenario: string;
  protocol: string;
}

export interface SkillVersion {
  version: number;
  createdAt: string;
  approvedBy: string;
  changeSummary: string;
  steps: SkillStep[];
  rules: string[];
  exceptions: SkillException[];
}

export interface Skill {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  category: string;
  purpose: string;
  department: string;
  autonomyLevel: AutonomyLevel;
  status: 'draft' | 'proposed' | 'approved' | 'practicing' | 'shadow' | 'active' | 'paused';
  reliabilityScore: number;
  reliabilityTier: ReliabilityTier;
  riskLevel: RiskLevel;
  activeVersion: number;
  ownerName: string;
  isSinglePointOfFailure: boolean;
  usageCount: number;
  successRate: number;
  humanTakeoverRate: number;
  avgDurationMinutes: number;
  hoursSavedTotal: number;
  steps: SkillStep[];
  decisions: SkillDecision[];
  exceptions: SkillException[];
  versions: SkillVersion[];
  allowedActions: string[];
  killSwitchActive: boolean;
}

export interface LearningProposal {
  id: string;
  type: 'new_skill' | 'conflict' | 'process_drift' | 'improvement' | 'single_person_risk' | 'outdated_source';
  title: string;
  titleEn: string;
  detectedAt: string;
  observedCasesCount: number;
  confidence: number;
  summary: string;
  status: 'pending' | 'resolved' | 'dismissed';
  evidence: {
    methodA?: { name: string; percentage: number; durationMin: number; errorRate: number };
    methodB?: { name: string; percentage: number; durationMin: number; errorRate: number };
    details?: string;
  };
  clarifications?: {
    id: string;
    question: string;
    options: string[];
    selectedAnswer?: string;
  }[];
}

export interface TeachEvent {
  id: string;
  timestamp: string;
  action: string;
  system: string;
  inputValue?: string;
  voiceNote?: string;
  screenshotLabel?: string;
}

export interface LearningSession {
  id: string;
  title: string;
  startedAt: string;
  status: 'recording' | 'synthesized' | 'approved';
  teacherName: string;
  events: TeachEvent[];
  discoveredSteps: SkillStep[];
  discoveredRules: string[];
  clarificationQuestions: { id: string; question: string; answered: boolean; answer?: string }[];
}

export interface WorkItem {
  id: string;
  code: string;
  title: string;
  skillId: string;
  skillName: string;
  contactName: string;
  contactPhone: string;
  state: 'queued' | 'collecting_data' | 'waiting_documents' | 'waiting_approval' | 'executing' | 'completed' | 'escalated';
  riskLevel: RiskLevel;
  assignedMode: 'ai' | 'human_takeover';
  createdAt: string;
  updatedAt: string;
  progressPercent: number;
  currentStepTitle: string;
  details: Record<string, any>;
  timeline: {
    time: string;
    actor: 'ai' | 'human' | 'system';
    title: string;
    details: string;
    badge?: string;
  }[];
}

export interface ApprovalRequest {
  id: string;
  workItemId: string;
  workTitle: string;
  actionName: string;
  payload: Record<string, any>;
  reasonCode: string;
  reasonDescription: string;
  riskLevel: RiskLevel;
  requiredRole: UserRole;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
}

export interface AuditEvent {
  id: string;
  /** نصّ العرض («اليوم، 10:14 ص»). للقراءة البشرية وحدها. */
  timestamp: string;
  /**
   * الطابع الحقيقي بصيغة ISO.
   *
   * `timestamp` نصٌّ للعرض لا يصلح للحساب، وبدون هذا الحقل لا تُشتق أي سلسلة
   * زمنية — وهو ما دفع الشيفرة سابقاً إلى كتابة منحنى الأسبوع بيدها. اختياري
   * لأن سجلات البذرة القديمة لا تحمله، ويُقرأ لها من نصّ العرض عند الحاجة.
   */
  at?: string;
  actorType: 'ai' | 'human' | 'system';
  actorName: string;
  action: string;
  policyCode?: string;
  provenance: string;
  risk: RiskLevel;
  latencyMs: number;
  details: string;
  status: 'success' | 'warning' | 'intercepted';
}

export interface Connector {
  id: string;
  name: string;
  type: 'sis' | 'calendar' | 'payment' | 'crm' | 'storage' | 'whatsapp' | 'database' | 'cloud';
  status: 'healthy' | 'degraded' | 'disconnected';
  lastSync: string;
  permissions: string[];
  stats: { callsToday: number; successRate: number; avgLatency: string };
}

export interface TestCase {
  id: string;
  name: string;
  scenario: string;
  expectedAction: string;
  expectedStatus: 'pass' | 'fail';
  resultStatus?: 'pass' | 'fail';
  executionTimeMs?: number;
  discrepancy?: string;
}

export interface ShadowComparison {
  id: string;
  caseTitle: string;
  timestamp: string;
  humanAction: string;
  humanReason: string;
  aiAction: string;
  aiReason: string;
  matched: boolean;
  driftDetected: boolean;
  workItemId?: string;
  title?: string;
  humanActor?: string;
  humanDecision?: string;
  aiDecision?: string;
  confidence?: number;
  divergenceReason?: string;
}

export type WorkStatus = 'queued' | 'collecting_data' | 'waiting_documents' | 'waiting_approval' | 'executing' | 'completed' | 'escalated' | 'needs_human_decision' | 'human_takeover' | 'in_progress';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  workItemId: string;
  action: string;
  latencyMs: number;
  policyApplied?: string;
  provenanceSource?: string;
  riskLevel: RiskLevel;
}

export interface SystemConnector {
  id: string;
  name: string;
  provider: string;
  type: string;
  status: string;
  latencyMs: number;
  authType: string;
  lastSync: string;
  operationsAllowed: string[];
}

export interface PracticeCase {
  id: string;
  title: string;
  type: string;
  inputDescription: string;
  expectedOutcome: string;
  actualOutcome?: string;
  status: 'passed' | 'failed' | 'pending';
  score: number;
  durationMs: number;
}

// Model Context Protocol (MCP) Standard Entities
export interface McpServerInfo {
  id: string;
  name: string;
  description: string;
  transport: 'sse' | 'http' | 'stdio' | 'in_memory';
  endpointUrl: string;
  status: 'connected' | 'healthy' | 'degraded' | 'disconnected';
  protocolVersion: string;
  latencyMs: number;
  toolsCount: number;
  resourcesCount: number;
  promptsCount: number;
  isExternal?: boolean;
  lastPing: string;
  authType: string;
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
}

export interface McpToolDefinition {
  name: string;
  serverId: string;
  serverName: string;
  description: string;
  descriptionAr: string;
  category: 'sis' | 'finance' | 'documents' | 'calendar' | 'brain' | 'external';
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[]; default?: any }>;
    required?: string[];
  };
  requiresPolicyCheck?: boolean;
  idempotent?: boolean;
  exampleParams?: Record<string, any>;
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  serverId: string;
  mimeType: string;
  description: string;
  previewContent?: string;
}

export interface McpPromptDefinition {
  name: string;
  serverId: string;
  description: string;
  arguments?: { name: string; description: string; required?: boolean }[];
  templatePreview?: string;
}

export interface McpToolExecutionRecord {
  id: string;
  timestamp: string;
  toolName: string;
  serverName: string;
  parameters: Record<string, any>;
  result: any;
  latencyMs: number;
  status: 'success' | 'error';
  idempotencyKey: string;
  policyCode?: string;
  requiresApproval?: boolean;
}

