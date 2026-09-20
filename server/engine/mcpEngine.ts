import { db } from "../db.ts";
import { ConnectorLayer } from "./connectors.ts";
import { PolicyEngine } from "./policyEngine.ts";
import {
  McpServerInfo,
  McpToolDefinition,
  McpResourceDefinition,
  McpPromptDefinition,
  McpToolExecutionRecord,
} from "../../src/types/index.ts";

export class McpEngine {
  private static protocolVersion = "2024-11-05";

  /*
   * سجلّ خوادم MCP.
   *
   * واحدٌ منها حقيقي: نهج نفسه. مسار `/api/mcp/rpc` يستقبل JSON-RPC 2.0
   * ويجيب `initialize` و`tools/list` و`tools/call` فعلاً — فأي عميل MCP
   * يستطيع أن يتكلّم معه. والأربعة الباقية كانت تُعرض «connected» بعناوين
   * تشير إلى التطبيق نفسه (`0.0.0.0:3000`)، وبأنواع مصادقة (mTLS، JWT) لا
   * وجود لها، ووقت استجابةٍ يُولَّد بـ`Math.random`. فمن يقرأ الشاشة يظنّ
   * المؤسسة موصولةً بخمسة أنظمة، ولا خادم واحد منها قائم.
   *
   * فصارت تُعلن نفسها محاكاةً، وعناوينها لا تدّعي مساراً لا يستقبل شيئاً.
   */
  private static servers: McpServerInfo[] = [
    {
      id: "sis-mcp-server",
      name: "Future SIS Core MCP Server",
      description: "يوفر أدوات الاستعلام عن مقاعد الطلاب، تسجيل الشعب، والرسوم الدراسية المعتمدة عبر بروتوكول MCP.",
      transport: "sse",
      endpointUrl: "",
      status: "disconnected",
      mode: "simulated",
      protocolVersion: "2024-11-05",
      latencyMs: 0,
      toolsCount: 3,
      resourcesCount: 2,
      promptsCount: 1,
      lastPing: "",
      authType: "—",
      capabilities: {
        tools: true,
        resources: true,
        prompts: true,
        logging: true,
      },
    },
    {
      id: "docvault-ocr-mcp-server",
      name: "DocVault Vision & OCR MCP Server",
      description: "خادم MCP متخصص في قراءة وفحص البطاقات المدنية، استخراج تاريخ الميلاد، ومطابقة الهوية.",
      transport: "http",
      endpointUrl: "",
      status: "disconnected",
      mode: "simulated",
      protocolVersion: "2024-11-05",
      latencyMs: 0,
      toolsCount: 2,
      resourcesCount: 1,
      promptsCount: 1,
      lastPing: "",
      authType: "—",
      capabilities: {
        tools: true,
        resources: true,
        prompts: false,
        logging: true,
      },
    },
    {
      id: "knet-payment-mcp-server",
      name: "K-Net Payment Gateway MCP Server",
      description: "بوابة الدفع الإلكتروني K-Net المربوطة بمحرك الحوكمة والسياسات المالية الصارمة لمنع المعاملات دون اعتماد.",
      transport: "http",
      endpointUrl: "",
      status: "disconnected",
      mode: "simulated",
      protocolVersion: "2024-11-05",
      latencyMs: 0,
      toolsCount: 2,
      resourcesCount: 1,
      promptsCount: 0,
      lastPing: "",
      authType: "—",
      capabilities: {
        tools: true,
        resources: true,
        prompts: false,
        logging: true,
      },
    },
    {
      id: "calendar-mcp-server",
      name: "Campus Tour Calendar MCP Server",
      description: "إدارة مواعيد المقابلات والجولات التعريفية مع مديري المراحل وموظفي القبول.",
      transport: "sse",
      endpointUrl: "",
      status: "disconnected",
      mode: "simulated",
      protocolVersion: "2024-11-05",
      latencyMs: 0,
      toolsCount: 2,
      resourcesCount: 1,
      promptsCount: 1,
      lastPing: "",
      authType: "—",
      capabilities: {
        tools: true,
        resources: true,
        prompts: true,
        logging: true,
      },
    },
    {
      id: "company-brain-mcp-server",
      name: "نهج — خادم MCP (يستقبل JSON-RPC فعلاً)",
      description: "خادم الذاكرة المؤسسية واللوائح الإدارية المعتمدة وتحديد تضارب السياسات وسجل الحوكمة.",
      transport: "in_memory",
      endpointUrl: "/api/mcp/rpc",
      status: "connected",
      mode: "self",
      protocolVersion: "2024-11-05",
      latencyMs: 4,
      toolsCount: 3,
      resourcesCount: 3,
      promptsCount: 2,
      lastPing: "",
      authType: "جلسة نهج (نفس مصادقة الواجهة)",
      capabilities: {
        tools: true,
        resources: true,
        prompts: true,
        logging: true,
      },
    },
  ];

  private static tools: McpToolDefinition[] = [
    {
      name: "sis_check_seats",
      serverId: "sis-mcp-server",
      serverName: "Future SIS Core MCP Server",
      description: "Query real-time available classroom capacity and open sections for a target academic grade.",
      descriptionAr: "الاستعلام اللحظي من نظام SIS عن المقاعد المتاحة والشعب المفتوحة للمرحلة الدراسية.",
      category: "sis",
      requiresPolicyCheck: false,
      idempotent: true,
      inputSchema: {
        type: "object",
        properties: {
          grade: {
            type: "string",
            description: "Academic grade level (e.g., 'KG1', 'KG2', 'Grade 1')",
            enum: ["KG1", "KG2", "Grade 1", "Grade 2"],
            default: "KG2",
          },
          academicYear: {
            type: "string",
            description: "Target academic year",
            default: "2025/2026",
          },
        },
        required: ["grade"],
      },
      exampleParams: { grade: "KG2", academicYear: "2025/2026" },
    },
    {
      name: "sis_get_tuition_fees",
      serverId: "sis-mcp-server",
      serverName: "Future SIS Core MCP Server",
      description: "Fetch authoritative tuition fees and installment schedules without AI hallucination.",
      descriptionAr: "جلب الرسوم الدراسية المعتمدة وجدول الأقساط مباشرة من المصدر الرسمي دون تخمين.",
      category: "sis",
      requiresPolicyCheck: false,
      idempotent: true,
      inputSchema: {
        type: "object",
        properties: {
          grade: {
            type: "string",
            description: "Academic grade code",
            default: "KG2",
          },
        },
        required: ["grade"],
      },
      exampleParams: { grade: "KG2" },
    },
    {
      name: "sis_reserve_seat",
      serverId: "sis-mcp-server",
      serverName: "Future SIS Core MCP Server",
      description: "Temporarily hold a seat reservation pending parent document completion.",
      descriptionAr: "حجز مقعد مؤقت للطالب ريثما تكتمل إجراءات التسجيل والمقابلة.",
      category: "sis",
      requiresPolicyCheck: true,
      idempotent: true,
      inputSchema: {
        type: "object",
        properties: {
          studentName: { type: "string", description: "Full student name in Arabic" },
          grade: { type: "string", description: "Grade level" },
          holdDurationHours: { type: "number", description: "Reservation hold window in hours", default: 48 },
        },
        required: ["studentName", "grade"],
      },
      exampleParams: { studentName: "يوسف أحمد الكندري", grade: "KG2", holdDurationHours: 48 },
    },
    {
      name: "ocr_verify_civil_id",
      serverId: "docvault-ocr-mcp-server",
      serverName: "DocVault Vision & OCR MCP Server",
      description: "Process Kuwait Civil ID image, extract birth date, calculate age, verify validity against ministry age cutoff.",
      descriptionAr: "فحص صورة البطاقة المدنية الكويتية، استخراج تاريخ الميلاد وحساب السن والتحقق من صلاحيتها.",
      category: "documents",
      requiresPolicyCheck: true,
      idempotent: true,
      inputSchema: {
        type: "object",
        properties: {
          civilIdNumber: { type: "string", description: "12-digit Kuwait Civil ID" },
          studentName: { type: "string", description: "Applicant student name" },
          documentImageRef: { type: "string", description: "Encrypted image storage reference" },
        },
        required: ["civilIdNumber"],
      },
      exampleParams: {
        civilIdNumber: "319081200192",
        studentName: "يوسف أحمد الكندري",
        documentImageRef: "vault://docs/civil-id-sample.png",
      },
    },
    {
      name: "calendar_book_tour",
      serverId: "calendar-mcp-server",
      serverName: "Campus Tour Calendar MCP Server",
      description: "Book an admission interview and school campus tour slot in Google Calendar.",
      descriptionAr: "حجز موعد المقابلة الشخصية والجولة المدرسية في تقويم لجان القبول.",
      category: "calendar",
      requiresPolicyCheck: false,
      idempotent: true,
      inputSchema: {
        type: "object",
        properties: {
          studentName: { type: "string", description: "Student Name" },
          preferredTime: { type: "string", description: "Slot time description", default: "الخميس القادم — 04:30 مساءً" },
          contactPhone: { type: "string", description: "Guardian mobile phone", default: "+965 99887766" },
        },
        required: ["studentName", "preferredTime"],
      },
      exampleParams: {
        studentName: "يوسف أحمد الكندري",
        preferredTime: "الخميس القادم — 04:30 مساءً",
        contactPhone: "+965 99887766",
      },
    },
    {
      name: "knet_create_invoice",
      serverId: "knet-payment-mcp-server",
      serverName: "K-Net Payment Gateway MCP Server",
      description: "Generate official K-Net payment invoice link. Gated by POL-FIN-02 (> 50 KWD requires Manager signoff).",
      descriptionAr: "إنشاء فاتورة ورابط دفع إلكتروني K-Net. محكومة بسياسة POL-FIN-02 (المبالغ فوق 50 د.ك تتطلب موافقة المدير).",
      category: "finance",
      requiresPolicyCheck: true,
      idempotent: true,
      inputSchema: {
        type: "object",
        properties: {
          studentName: { type: "string", description: "Student full name" },
          amountKwd: { type: "number", description: "Total amount in Kuwaiti Dinars", default: 1500 },
          feeType: { type: "string", description: "Tuition installment or seat deposit", default: "tuition_deposit" },
          approvalToken: { type: "string", description: "Manager approval token if amount > 50 KWD" },
        },
        required: ["studentName", "amountKwd"],
      },
      exampleParams: {
        studentName: "يوسف أحمد الكندري",
        amountKwd: 1500,
        feeType: "tuition_deposit",
        approvalToken: "APPR-MGR-NOURA-VALIDATED",
      },
    },
    {
      name: "brain_query_policies",
      serverId: "company-brain-mcp-server",
      serverName: "NAHJ Company Brain Knowledge MCP Server",
      description: "Query codified organizational policies and truth hierarchy in Company Brain.",
      descriptionAr: "الاستعلام من العقل التشغيلي عن السياسات المعتمدة وترتيب مراجع الحقيقة.",
      category: "brain",
      requiresPolicyCheck: false,
      idempotent: true,
      inputSchema: {
        type: "object",
        properties: {
          policyCodeOrTopic: { type: "string", description: "Policy code or query string", default: "POL-FIN-02" },
        },
        required: ["policyCodeOrTopic"],
      },
      exampleParams: { policyCodeOrTopic: "POL-FIN-02" },
    },
  ];

  private static resources: McpResourceDefinition[] = [
    {
      uri: "nahj://sis/capacity/kg2",
      name: "سعة مقاعد مرحلة الروضة الثانية KG2 (حي)",
      serverId: "sis-mcp-server",
      mimeType: "application/json",
      description: "بيانات حية محدثة فورياً من قاعدة بيانات SIS توضح إجمالي المقاعد (25) والمقاعد الشاغرة (4).",
      previewContent: JSON.stringify(
        {
          grade: "KG2",
          totalCapacity: 25,
          enrolledCount: 21,
          availableSeats: 4,
          waitlistCount: 2,
          lastSync: new Date().toISOString(),
        },
        null,
        2
      ),
    },
    {
      uri: "nahj://sis/tuition-catalog-2026",
      name: "جدول الرسوم الدراسية المعتمد 2025/2026",
      serverId: "sis-mcp-server",
      mimeType: "application/json",
      description: "الأسعار الرسمية المعتمدة لجميع المراحل الدراسية في أكاديمية المستقبل.",
      previewContent: JSON.stringify(
        {
          academicYear: "2025/2026",
          grades: {
            KG1: { tuition: 1400, deposit: 200 },
            KG2: { tuition: 1500, deposit: 250 },
            Grade1: { tuition: 1850, deposit: 300 },
          },
          discounts: {
            siblingsSecondChild: "10%",
            siblingsThirdChild: "15%",
            staffChildren: "50%",
          },
        },
        null,
        2
      ),
    },
    {
      uri: "nahj://brain/policies/POL-FIN-02",
      name: "سياسة الحوكمة المالية POL-FIN-02 (تحديد الصلاحيات)",
      serverId: "company-brain-mcp-server",
      mimeType: "text/markdown",
      description: "اللائحة المالية الصريحة: يحظر على الذكاء الاصطناعي إصدار فواتير أو دفعات أعلى من 50 د.ك دون توقيع بشري.",
      previewContent: `# لائحة الصلاحيات المالية 2026 (POL-FIN-02)
- الحد الأقصى للإجراء المالي التلقائي (Autopilot): 50 د.ك (فقط لفتح الملفات).
- أي فاتورة سداد، رسوم تسجيل، أو طلب استرجاع تتجاوز 50 د.ك تتطلب موافقة صريحة من (مديرة القبول نورة الصباح).
- لا يجوز التجاوز أو الاستثناء الودي بدون توقيع خطي موثق في سجل التدقيق.`,
    },
    {
      uri: "nahj://brain/hierarchy-of-truth",
      name: "هرمية الموثوقية ومصادر الحقيقة في المنظمة",
      serverId: "company-brain-mcp-server",
      mimeType: "text/plain",
      description: "ترتيب مصادر الحقيقة عند حدوث أي تضارب تشغيلي في المنظمة.",
      previewContent: `1. Live Authoritative System (SIS Billing API / Calendar DB)
2. Approved Institutional Policy (Admission Policy v2)
3. Approved Structured Data (Program Catalog)
4. Approved Current Document (Ministry Directive 2026)
5. Official Website Content
6. Historical Approved Communications
7. Observed / Unverified Employee Behavior (Lowest Authority)`,
    },
  ];

  private static prompts: McpPromptDefinition[] = [
    {
      name: "guardian_admission_intake",
      serverId: "sis-mcp-server",
      description: "Workflow prompt guiding guardian conversational admission intake in Kuwaiti/Gulf tone.",
      arguments: [
        { name: "guardianName", description: "Guardian name", required: false },
        { name: "childName", description: "Child name", required: true },
        { name: "targetGrade", description: "Target Grade", required: true },
      ],
      templatePreview:
        "أنت موظف القبول الذكي في أكاديمية المستقبل. رحب بولي الأمر بلهجة كويتية مهذبة، استعلم فوراً عبر MCP عن مقاعد {{targetGrade}}، ووجهه لرفع البطاقة المدنية.",
    },
    {
      name: "policy_drift_check",
      serverId: "company-brain-mcp-server",
      description: "Prompt for analyzing differences between employee actions and approved policy.",
      arguments: [
        { name: "observedAction", description: "Observed action by employee", required: true },
        { name: "policyCode", description: "Policy code", required: true },
      ],
      templatePreview:
        "قارن بين التصرف المرصود '{{observedAction}}' والسياسة الرسمية '{{policyCode}}'. حدد هل هو تباين مقبول أم انحراف إجرائي يستوجب التنبيه.",
    },
  ];

  private static recentExecutions: McpToolExecutionRecord[] = [
    {
      id: "exec_mcp_1",
      timestamp: "10:15 AM",
      toolName: "sis_check_seats",
      serverName: "Future SIS Core MCP Server",
      parameters: { grade: "KG2", academicYear: "2025/2026" },
      result: { availableSeats: 4, maxCapacity: 25, openSections: ["الشعبة أ (الصباحية)", "الشعبة ب (المختلطة)"] },
      latencyMs: 18,
      status: "success",
      idempotencyKey: "idem_mcp_check_kg2_1015",
    },
    {
      id: "exec_mcp_2",
      timestamp: "10:16 AM",
      toolName: "ocr_verify_civil_id",
      serverName: "DocVault Vision & OCR MCP Server",
      parameters: { civilIdNumber: "319081200192", studentName: "يوسف أحمد الكندري" },
      result: { isValid: true, extractedAgeMonths: 65, determinedGrade: "KG2 - الروضة الثانية" },
      latencyMs: 115,
      status: "success",
      idempotencyKey: "idem_mcp_ocr_319081",
    },
    {
      id: "exec_mcp_3",
      timestamp: "10:16 AM",
      toolName: "knet_create_invoice",
      serverName: "K-Net Payment Gateway MCP Server",
      parameters: { studentName: "يوسف أحمد الكندري", amountKwd: 1500 },
      result: { requiresApproval: true, policyBlocked: "POL-FIN-02", reason: "1,500 KWD > 50 KWD limit" },
      latencyMs: 12,
      status: "success",
      idempotencyKey: "idem_mcp_knet_1500",
      policyCode: "POL-FIN-02",
      requiresApproval: true,
    },
  ];

  // Public Getters
  public static getServers(): McpServerInfo[] {
    return this.servers;
  }

  public static getTools(): McpToolDefinition[] {
    return this.tools;
  }

  public static getResources(): McpResourceDefinition[] {
    return this.resources;
  }

  public static getPrompts(): McpPromptDefinition[] {
    return this.prompts;
  }

  public static getRecentExecutions(): McpToolExecutionRecord[] {
    return this.recentExecutions;
  }

  /**
   * يسجّل عنوان خادم MCP خارجي.
   *
   * تسجيلٌ لا وصل: نهج لا يفتح اتصالاً بعدُ بخوادم خارجية، فالعنوان يُحفظ
   * ويُعلَن «مسجَّل لم يُتصل به». وكان التسجيل يُعلن الخادم «connected» بوقت
   * استجابةٍ مكتوب، بل ويخترع له أداةً «مكتشفةً آلياً» لم تُكتشف من أحد —
   * فيُبنى على وهم الاكتشاف سلوكٌ يُنفَّذ.
   */
  public static registerServer(newServer: Partial<McpServerInfo>): McpServerInfo {
    const server: McpServerInfo = {
      id: newServer.id || `ext-mcp-${Date.now()}`,
      name: newServer.name || "External MCP Server",
      description: newServer.description || "External Model Context Protocol Server",
      transport: newServer.transport || "sse",
      endpointUrl: newServer.endpointUrl || "",
      mode: "declared",
      status: "disconnected",
      protocolVersion: "2024-11-05",
      latencyMs: 0,
      toolsCount: 0,
      resourcesCount: 0,
      promptsCount: 0,
      isExternal: true,
      lastPing: "",
      authType: newServer.authType || "—",
      capabilities: {
        tools: false,
        resources: false,
        prompts: false,
        logging: false,
      },
    };

    this.servers.push(server);

    db.logAudit({
      actorType: "human",
      actorName: db.getCurrentUser().name,
      action: "REGISTER_MCP_SERVER",
      policyCode: "MCP-GOV-01",
      provenance: server.endpointUrl,
      risk: "medium",
      latencyMs: 25,
      details: `تسجيل عنوان خادم MCP خارجي: ${server.name}. لم يُفتح اتصال ولم تُكتشف أدوات — التسجيل حفظُ عنوان.`,
      status: "success",
    });

    return server;
  }

  // Remove External Server
  public static removeServer(serverId: string): boolean {
    const idx = this.servers.findIndex((s) => s.id === serverId);
    if (idx !== -1) {
      const removed = this.servers[idx];
      this.servers.splice(idx, 1);
      this.tools = this.tools.filter((t) => t.serverId !== serverId);
      this.resources = this.resources.filter((r) => r.serverId !== serverId);
      return true;
    }
    return false;
  }

  /**
   * يفحص خادماً.
   *
   * وما يُفحص فعلاً واحد: نهج نفسه — يُنفَّذ عليه `initialize` ويُقاس زمنه
   * حقيقةً. وما عداه لا يُطرق: لا اتصال يُفتح، فلا يُخترع له وقت استجابة.
   *
   * وكان الفحص يكتب «connected» ووقتاً من `Math.random()` لأي خادم مهما كان —
   * رقمٌ يبدو قياساً وليس منه شيء.
   */
  public static async pingServer(serverId: string): Promise<{ status: string; latencyMs: number | null; mode: string }> {
    const server = this.servers.find((s) => s.id === serverId);
    if (!server) return { status: "not_found", latencyMs: null, mode: "" };

    if (server.mode !== "self") {
      server.lastPing = "";
      server.status = "disconnected";
      server.latencyMs = 0;
      return {
        status: server.mode === "declared" ? "declared_not_contacted" : "simulated",
        latencyMs: null,
        mode: server.mode,
      };
    }

    const start = Date.now();
    const response = await this.handleJsonRpc({ jsonrpc: "2.0", id: `ping_${start}`, method: "initialize", params: {} });
    const latencyMs = Math.max(1, Date.now() - start);
    const healthy = Boolean(response?.result?.protocolVersion);
    server.lastPing = new Date().toISOString();
    server.status = healthy ? "healthy" : "degraded";
    server.latencyMs = latencyMs;
    return { status: healthy ? "healthy" : "degraded", latencyMs, mode: "self" };
  }

  // Standard JSON-RPC 2.0 Dispatcher (The Heart of Model Context Protocol)
  public static async handleJsonRpc(payload: any): Promise<any> {
    const { jsonrpc, id, method, params } = payload;
    if (jsonrpc !== "2.0") {
      return {
        jsonrpc: "2.0",
        id: id || null,
        error: { code: -32600, message: "Invalid Request: Only JSON-RPC 2.0 is supported" },
      };
    }

    const start = Date.now();

    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: this.protocolVersion,
            capabilities: {
              tools: { listChanged: true },
              resources: { subscribe: true, listChanged: true },
              prompts: { listChanged: true },
              logging: {},
            },
            serverInfo: {
              name: "NAHJ Model Context Protocol Enterprise Hub",
              version: "1.0.0",
              vendor: "NAHJ Technologies Kuwait",
            },
          },
        };

      case "ping":
        return {
          jsonrpc: "2.0",
          id,
          result: { status: "pong", timestamp: new Date().toISOString() },
        };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: this.tools.map((t) => ({
              name: t.name,
              description: `${t.description} (${t.descriptionAr})`,
              inputSchema: t.inputSchema,
            })),
          },
        };

      case "tools/call": {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const callResult = await this.executeTool(toolName, toolArgs);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(callResult.result, null, 2),
              },
            ],
            isError: callResult.status === "error",
            meta: {
              latencyMs: Date.now() - start,
              idempotencyKey: callResult.idempotencyKey,
              requiresApproval: callResult.requiresApproval,
              policyCode: callResult.policyCode,
            },
          },
        };
      }

      case "resources/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            resources: this.resources.map((r) => ({
              uri: r.uri,
              name: r.name,
              mimeType: r.mimeType,
              description: r.description,
            })),
          },
        };

      case "resources/read": {
        const uri = params?.uri;
        const res = this.resources.find((r) => r.uri === uri);
        if (!res) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `Resource not found: ${uri}` },
          };
        }
        return {
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri: res.uri,
                mimeType: res.mimeType,
                text: res.previewContent,
              },
            ],
          },
        };
      }

      case "prompts/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            prompts: this.prompts.map((p) => ({
              name: p.name,
              description: p.description,
              arguments: p.arguments,
            })),
          },
        };

      case "prompts/get": {
        const promptName = params?.name;
        const prompt = this.prompts.find((p) => p.name === promptName);
        if (!prompt) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `Prompt not found: ${promptName}` },
          };
        }
        return {
          jsonrpc: "2.0",
          id,
          result: {
            description: prompt.description,
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: prompt.templatePreview || "System Prompt",
                },
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  }

  // Execute MCP Tool directly
  public static async executeTool(
    toolName: string,
    args: Record<string, any>
  ): Promise<McpToolExecutionRecord> {
    const start = Date.now();
    const idempotencyKey = `idem_mcp_${toolName}_${Date.now()}`;
    const tool = this.tools.find((t) => t.name === toolName);

    let result: any = null;
    let status: "success" | "error" = "success";
    let policyCode: string | undefined = undefined;
    let requiresApproval = false;

    try {
      if (toolName === "sis_check_seats") {
        const grade = args.grade || "KG2";
        const connRes = await ConnectorLayer.checkSeatAvailability(grade, idempotencyKey);
        result = connRes.data;
      } else if (toolName === "sis_get_tuition_fees") {
        const grade = args.grade || "KG2";
        const connRes = await ConnectorLayer.getAuthoritativeTuition(grade, idempotencyKey);
        result = connRes.data;
      } else if (toolName === "sis_reserve_seat") {
        result = {
          status: "HELD_PENDING_DOCUMENTS",
          reservedGrade: args.grade || "KG2",
          studentName: args.studentName,
          expiresInHours: args.holdDurationHours || 48,
          reservationReference: `HOLD-${Math.floor(1000 + Math.random() * 9000)}`,
        };
      } else if (toolName === "ocr_verify_civil_id") {
        const connRes = await ConnectorLayer.verifyCivilId(args, idempotencyKey);
        result = connRes.data;
      } else if (toolName === "calendar_book_tour") {
        const connRes = await ConnectorLayer.bookCampusTour(
          { studentName: args.studentName, preferredTime: args.preferredTime },
          idempotencyKey
        );
        result = connRes.data;
      } else if (toolName === "knet_create_invoice") {
        const amount = Number(args.amountKwd) || 1500;
        // Evaluate deterministic policy
        const policyCheck = PolicyEngine.evaluateAction(
          "issuePaymentInvoice",
          { tuitionFee: amount },
          "employee"
        );

        if (policyCheck.requiresApproval && !args.approvalToken) {
          requiresApproval = true;
          policyCode = policyCheck.reasonCode;
          result = {
            status: "PAUSED_PENDING_APPROVAL",
            reason: `المبلغ (${amount} د.ك) يتجاوز حد العمل الذاتي (50 د.ك). يتطلب موافقة المدير المالي قبل استخراج رابط K-Net.`,
            policyApplied: policyCheck.reasonCode,
            requiredApprover: policyCheck.requiredRole,
          };
        } else {
          const connRes = await ConnectorLayer.createApplicationRecord(args, idempotencyKey);
          result = connRes.data;
        }
      } else if (toolName === "brain_query_policies") {
        const code = args.policyCodeOrTopic || "POL-FIN-02";
        result = {
          code,
          title: "سياسة الحوكمة المالية والصلاحيات (Financial Approval Limits)",
          riskLevel: "medium",
          effectiveDate: "2025-09-01",
          rules: [
            "المعاملات حتى 50 د.ك: عمل ذاتي بالكامل (Autopilot)",
            "المعاملات أكثر من 50 د.ك: موافقة صريحة من نورة الصباح (مديرة القبول)",
            "أي خصم إضافي غير أشقاء: موافقة المدير العام",
          ],
          provenance: "لائحة أكاديمية المستقبل المعتمدة 2026",
        };
      } else {
        // Fallback for custom or external MCP tools
        result = {
          message: `External MCP tool ${toolName} executed successfully in sandbox container.`,
          receivedArguments: args,
          status: "executed",
        };
      }
    } catch (err: any) {
      status = "error";
      result = { error: err.message || "Execution error" };
    }

    const latencyMs = Date.now() - start;

    const record: McpToolExecutionRecord = {
      id: `exec_mcp_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      toolName,
      serverName: tool?.serverName || "MCP Server",
      parameters: args,
      result,
      latencyMs,
      status,
      idempotencyKey,
      policyCode,
      requiresApproval,
      /*
       * التنفيذ يمرّ بطبقة الموصلات، وهي محاكاة لا تُخرج طلب شبكة. والسجلّ
       * يقولها: سطرٌ لا يذكرها يُقرأ بعد شهر إثباتاً أن النظام فعل شيئاً في
       * الخارج — وهو أخطر ما يُترك في سجلٍّ يُراجَع.
       */
      simulated: true,
    };

    // Keep last 30 executions
    this.recentExecutions.unshift(record);
    if (this.recentExecutions.length > 30) {
      this.recentExecutions.pop();
    }

    // Log to immutable audit log
    db.logAudit({
      actorType: "ai",
      actorName: `MCP Client (${toolName})`,
      action: `MCP_TOOL_CALL: ${toolName}`,
      policyCode: policyCode || "MCP-PROTOCOL-CALL",
      provenance: tool?.serverName || "MCP Host",
      risk: requiresApproval ? "high" : "low",
      latencyMs,
      details: `استدعاء أداة بروتوكول سياق النماذج (MCP Tool Call) [${toolName}] بمفتاح عدم تكرار ${idempotencyKey}. النتيجة: ${status}`,
      status: status === "error" ? "intercepted" : requiresApproval ? "warning" : "success",
    });

    return record;
  }
}
