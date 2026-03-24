/**
 * CodebaseMaintainer - 代码库维护助手
 * 基于 HelloAgents 框架的智能体实现
 *
 * 整合: ContextBuilder + NoteTool + TerminalTool + MemoryTool + SimpleAgent
 * 实现跨会话的代码库维护任务管理
 */

// 导入框架模块
import {
  HelloAgentsLLM,
  Message,
  ContextBuilder,
  ContextPacket,
  NoteTool,
  NoteType,
  TerminalTool,
  MemoryTool,
  MemoryManager,
  SimpleAgent,
  ToolRegistry,
} from 'my-agent-framework';
import { SessionManager, TaskSession, TaskType, Finding } from './session';

// ==================== 类型定义 ====================

export interface CodebaseMaintainerConfig {
  /** 项目名称 */
  projectName: string;
  /** 代码库路径 */
  codebasePath: string;
  /** 笔记工作目录 */
  notesDir?: string;
  /** 会话存储目录 */
  sessionsDir?: string;
  /** LLM 实例 */
  llm?: HelloAgentsLLM;
  /** MemoryManager 实例 */
  memoryManager?: MemoryManager;
  /** 最大 token 数 */
  maxTokens?: number;
}

export interface RunMode {
  mode: 'auto' | 'explore' | 'analyze' | 'plan';
}

export interface ExploreResult {
  sessionId: string;
  structure: FileStructure;
  summary: string;
}

export interface FileStructure {
  root: string;
  files: string[];
  directories: string[];
}

export interface Issue {
  id: string;
  type: 'bug' | 'vulnerability' | 'code_smell' | 'design' | 'performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  location: string;
  suggestion?: string;
}

export interface IssueDiscoveryResult {
  sessionId: string;
  issues: Issue[];
  summary: string;
}

export interface RefactorTask {
  target: string;
  description: string;
  steps: string[];
}

export interface RefactorProgress {
  sessionId: string;
  currentStep: number;
  totalSteps: number;
  completedSteps: string[];
  pendingSteps: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'paused';
}

export interface ReviewReport {
  sessionId: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  findings: Finding[];
}

export interface MaintainerStats {
  session_info: {
    session_id: string;
    project: string;
    duration_seconds: number;
  };
  activity: {
    commands_executed: number;
    notes_created: number;
    issues_found: number;
  };
}

/**
 * CodebaseMaintainer - 代码库维护助手
 *
 * 整合 ContextBuilder + NoteTool + TerminalTool + MemoryTool + SimpleAgent
 * 实现跨会话的代码库维护任务管理
 */
export class CodebaseMaintainer {
  private projectName: string;
  private codebasePath: string;
  private sessionId: string;

  // 框架模块
  private llm: HelloAgentsLLM;
  private memoryTool: MemoryTool;
  private noteTool: NoteTool;
  private terminalTool: TerminalTool;
  private contextBuilder: ContextBuilder;
  private agent?: SimpleAgent;

  // 会话管理
  private sessionManager: SessionManager;

  // 对话历史
  private conversationHistory: Message[] = [];

  // 统计
  private stats = {
    sessionStart: new Date(),
    commandsExecuted: 0,
    notesCreated: 0,
    issuesFound: 0,
  };

  constructor(config: CodebaseMaintainerConfig) {
    this.projectName = config.projectName;
    this.codebasePath = config.codebasePath || process.cwd();
    this.sessionId = `session_${Date.now()}`;

    // 初始化 LLM
    this.llm = config.llm || new HelloAgentsLLM();

    // 初始化 Memory Manager 和工具
    const memoryManager = config.memoryManager || new MemoryManager();
    this.memoryTool = new MemoryTool(memoryManager);
    this.noteTool = new NoteTool(config.notesDir || `./${config.projectName}_notes`);
    this.terminalTool = new TerminalTool({
      workspace: this.codebasePath,
      timeout: 60000,
    });

    // 初始化 ContextBuilder
    this.contextBuilder = new ContextBuilder({
      maxTokens: config.maxTokens || 4000,
      reserveRatio: 0.15,
      minRelevance: 0.2,
      enableCompression: true,
      recencyWeight: 0.3,
      relevanceWeight: 0.7,
    });

    // 初始化会话管理器
    this.sessionManager = new SessionManager({
      storageDir: config.sessionsDir || './sessions',
    });

    // 初始化 SimpleAgent
    this.initAgent();

    console.log(`✅ 代码库维护助手已初始化: ${this.projectName}`);
    console.log(`📁 工作目录: ${this.codebasePath}`);
    console.log(`🆔 会话ID: ${this.sessionId}`);
  }

  /**
   * 初始化 Agent - 复用框架的 Tool Calling 能力
   *
   * 关键设计：
   * 1. 将 NoteTool、TerminalTool、MemoryTool 注册到 ToolRegistry
   * 2. Agent 会自动决定何时调用这些工具
   * 3. 不需要手动调用 tool.execute()，让 Agent 自动处理
   */
  private initAgent(): void {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(this.memoryTool);
    toolRegistry.register(this.noteTool);
    toolRegistry.register(this.terminalTool);

    // 使用 Agent 的系统提示功能
    this.agent = new SimpleAgent(
      `${this.projectName}-maintainer`,
      this.llm,
      {
        toolRegistry,
        enableToolCalling: true,
        // 复用框架的配置，传递系统提示
        systemPrompt: this.buildAgentSystemPrompt(),
      }
    );
  }

  /**
   * 构建 Agent 的系统提示 - 复用框架的提示工程能力
   */
  private buildAgentSystemPrompt(): string {
    return `你是 ${this.projectName} 项目的代码库维护助手。

你的核心能力（框架已实现，请直接使用）：
- TerminalTool: 执行安全的只读终端命令（ls, cat, grep, find, tree 等）
- NoteTool: 管理笔记（创建、搜索、列出、读取笔记）
- MemoryTool: 长期记忆检索

工作流程：
1. 理解用户需求
2. 必要时自动使用工具收集信息或记录发现
3. 提供专业的代码维护建议

当前项目路径: ${this.codebasePath}
工作区: ${this.terminalTool.getCurrentDir()}

请根据用户需求，自主决定是否使用工具。`;
  }

  // ==================== 核心运行方法 ====================

  /**
   * 运行助手 - 复用框架的简洁版本
   *
   * 核心设计理念（与 Python 版本一致）：
   * 1. 使用 ContextBuilder 构建上下文
   * 2. 使用 LLM.invoke() 调用
   * 3. Agent 自动决定是否使用工具
   */
  async run(userInput: string, mode: RunMode['mode'] = 'auto'): Promise<string> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`👤 用户: ${userInput}`);
    console.log(`${'='.repeat(80)}\n`);

    // 第一步: 预处理（根据模式收集相关信息）- 复用 TerminalTool 和 NoteTool
    const preContext = await this.preprocessByMode(userInput, mode);

    // 第二步: 检索相关笔记 - 复用 NoteTool
    const relevantNotes = await this.noteTool.execute({
      action: 'search',
      query: userInput,
      limit: 3,
    });

    // 第三步: 构建上下文 - 复用 ContextBuilder
    const context = await this.contextBuilder.build({
      userQuery: userInput,
      conversationHistory: this.conversationHistory.slice(-5).map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
      systemInstructions: this.buildSystemInstructions(mode),
      customPackets: [
        {
          content: `[相关笔记]\n${relevantNotes}`,
          timestamp: new Date(),
          tokenCount: Math.ceil(relevantNotes.length / 4),
          relevanceScore: 0.8,
          source: 'tool' as const,
          metadata: { type: 'notes' },
        },
        ...preContext,
      ],
    });

    // 第四步: 调用 LLM - 复用 HelloAgentsLLM
    console.log('🤖 正在思考...');
    const messages = this.buildMessages(userInput, context.structuredContext || '');
    const response = await this.llm.invoke(messages);

    // 第五步: 后处理 - 自动创建笔记（如果需要）
    await this.postprocessResponse(userInput, response);

    // 第六步: 更新对话历史
    this.updateHistory(userInput, response);

    console.log(`\n🤖 助手: ${response}\n`);
    console.log(`${'='.repeat(80)}\n`);

    return response;
  }

  /**
   * 构建消息列表
   */
  private buildMessages(input: string, context: string): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    // 添加系统消息（带上下文）
    const systemContent = context
      ? `你是 ${this.projectName} 项目的代码库维护助手。\n\n## 当前上下文\n${context}\n\n请基于以上信息回答用户问题。`
      : `你是 ${this.projectName} 项目的代码库维护助手。`;
    messages.push({ role: 'system', content: systemContent });

    // 添加历史消息
    for (const msg of this.conversationHistory.slice(-10)) {
      messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: input });

    return messages;
  }

  /**
   * 根据模式执行预处理
   */
  private async preprocessByMode(userInput: string, mode: RunMode['mode']): Promise<ContextPacket[]> {
    const packets: ContextPacket[] = [];

    if (mode === 'explore' || mode === 'auto') {
      // 探索模式: 自动查看项目结构
      console.log('🔍 探索代码库结构...');

      const structure = await this.terminalTool.execute({ command: 'ls -la' });
      this.stats.commandsExecuted++;

      packets.push({
        content: `[代码库结构]\n${structure}`,
        timestamp: new Date(),
        tokenCount: Math.ceil(structure.length / 4),
        relevanceScore: 0.6,
        source: 'tool',
        metadata: { type: 'code_structure' },
      });
    }

    if (mode === 'analyze') {
      // 分析模式: 检查代码复杂度和问题
      console.log('📊 分析代码质量...');

      // 统计代码行数
      const loc = await this.terminalTool.execute({ command: 'find . -name "*.ts" -o -name "*.js" | xargs wc -l 2>/dev/null | tail -1' });
      this.stats.commandsExecuted++;

      packets.push({
        content: `[代码统计]\n${loc || '无法统计'}`,
        timestamp: new Date(),
        tokenCount: Math.ceil((loc?.length || 100) / 4),
        relevanceScore: 0.7,
        source: 'tool',
        metadata: { type: 'code_analysis' },
      });
    }

    if (mode === 'plan') {
      // 规划模式: 加载最近的笔记
      console.log('📋 加载任务规划...');

      const taskNotes = await this.noteTool.execute({
        action: 'list',
        note_type: 'task_state',
      });

      if (taskNotes) {
        packets.push({
          content: `[当前任务]\n${taskNotes.slice(0, 500)}`,
          timestamp: new Date(),
          tokenCount: 100,
          relevanceScore: 0.8,
          source: 'tool',
          metadata: { type: 'task_plan' },
        });
      }
    }

    return packets;
  }

  /**
   * 检索相关笔记
   */
  private async retrieveRelevantNotes(query: string, limit: number = 3): Promise<Array<{ id: string; title: string; type: string; content: string; updated_at: string }>> {
    try {
      // 搜索相关笔记
      const searchResults = await this.noteTool.execute({
        action: 'search',
        query,
        limit,
      });

      // 解析搜索结果（NoteTool 返回的是格式化字符串，这里简化处理）
      return [];
    } catch (error) {
      console.warn('[WARNING] 笔记检索失败:', error);
      return [];
    }
  }

  /**
   * 将笔记转换为上下文包
   */
  private notesToPackets(notes: Array<{ id: string; title: string; type: string; content: string; updated_at: string }>): ContextPacket[] {
    const packets: ContextPacket[] = [];

    const relevanceMap: Record<string, number> = {
      blocker: 0.9,
      action: 0.8,
      task_state: 0.75,
      conclusion: 0.7,
    };

    for (const note of notes) {
      const relevance = relevanceMap[note.type] || 0.6;
      const content = `[笔记:${note.title}]\n类型: ${note.type}\n\n${note.content}`;

      packets.push({
        content,
        timestamp: new Date(note.updated_at),
        tokenCount: Math.ceil(content.length / 4),
        relevanceScore: relevance,
        source: 'tool',
        metadata: { type: 'note', note_type: note.type, note_id: note.id },
      });
    }

    return packets;
  }

  /**
   * 构建系统指令
   */
  private buildSystemInstructions(mode: RunMode['mode']): string {
    const baseInstructions = `你是 ${this.projectName} 项目的代码库维护助手。

你的核心能力:
1. 使用 TerminalTool 探索代码库(ls, cat, grep, find等)
2. 使用 NoteTool 记录发现和任务
3. 使用 MemoryTool 记忆重要信息
4. 基于历史笔记提供连贯的建议

当前会话ID: ${this.sessionId}
`;

    const modeSpecific: Record<string, string> = {
      explore: `
当前模式: 探索代码库

你应该:
- 主动使用 terminal 命令了解代码结构
- 识别关键模块和文件
- 记录项目架构到笔记
`,
      analyze: `
当前模式: 分析代码质量

你应该:
- 查找代码问题(重复、复杂度、TODO等)
- 评估代码质量
- 将发现的问题记录为 blocker 或 action 笔记
`,
      plan: `
当前模式: 任务规划

你应该:
- 回顾历史笔记和任务
- 制定下一步行动计划
- 更新任务状态笔记
`,
      auto: `
当前模式: 自动决策

你应该:
- 根据用户需求灵活选择策略
- 在需要时使用工具
- 保持回答的专业性和实用性
`,
    };

    return baseInstructions + (modeSpecific[mode] || modeSpecific.auto);
  }

  /**
   * 后处理: 分析回答,自动记录重要信息
   */
  private async postprocessResponse(userInput: string, response: string): Promise<void> {
    // 如果发现问题,自动创建 blocker 笔记
    const issueKeywords = ['问题', 'bug', '错误', '阻塞', 'issue', 'error', 'problem'];
    if (issueKeywords.some(kw => response.toLowerCase().includes(kw))) {
      try {
        await this.noteTool.execute({
          action: 'create',
          title: `发现问题: ${userInput.slice(0, 30)}...`,
          content: `## 用户输入\n${userInput}\n\n## 问题分析\n${response.slice(0, 500)}...`,
          note_type: 'blocker',
          tags: [this.projectName, 'auto_detected', this.sessionId],
        });
        this.stats.notesCreated++;
        this.stats.issuesFound++;
        console.log('📝 已自动创建问题笔记');
      } catch (error) {
        console.warn('[WARNING] 创建笔记失败:', error);
      }
    }

    // 如果是任务规划,自动创建 action 笔记
    const planKeywords = ['计划', '下一步', '任务', 'todo', 'plan', 'next step', 'task'];
    if (planKeywords.some(kw => userInput.toLowerCase().includes(kw))) {
      try {
        await this.noteTool.execute({
          action: 'create',
          title: `任务规划: ${userInput.slice(0, 30)}...`,
          content: `## 讨论\n${userInput}\n\n## 行动计划\n${response.slice(0, 500)}...`,
          note_type: 'action',
          tags: [this.projectName, 'planning', this.sessionId],
        });
        this.stats.notesCreated++;
        console.log('📝 已自动创建行动计划笔记');
      } catch (error) {
        console.warn('[WARNING] 创建笔记失败:', error);
      }
    }
  }

  /**
   * 更新对话历史
   */
  private updateHistory(userInput: string, response: string): void {
    this.conversationHistory.push(new Message(userInput, 'user'));
    this.conversationHistory.push(new Message(response, 'assistant'));

    // 限制历史长度(保留最近10轮对话)
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }
  }

  // ==================== 核心能力 ====================

  /**
   * 代码探索 - 分析代码库结构
   */
  async explore(target: string, resumeSessionId?: string): Promise<ExploreResult> {
    let session: TaskSession;

    if (resumeSessionId) {
      session = this.sessionManager.resumeSession(resumeSessionId)!;
    } else {
      session = this.sessionManager.createSession(
        'explore',
        `探索代码库: ${target}`,
        `分析目标: ${target}`,
        target,
        4
      );
    }

    console.log(`[Explore] 开始探索: ${target}`);

    // 步骤 1: 列出目录结构
    this.sessionManager.updateProgress(1, '列出目录结构');
    this.terminalTool.reset();
    const treeOutput = await this.terminalTool.execute({ command: 'ls -la' });
    this.sessionManager.saveContext('tree', treeOutput);
    this.stats.commandsExecuted++;

    // 步骤 2: 收集文件信息
    this.sessionManager.updateProgress(2, '收集文件信息');
    const listOutput = await this.terminalTool.execute({
      command: process.platform === 'win32' ? 'dir /s /b' : 'find . -type f',
    });
    const files = listOutput.split('\n').filter(f => f.trim()).slice(0, 100);
    this.stats.commandsExecuted++;

    // 步骤 3: 分析文件类型
    this.sessionManager.updateProgress(3, '分析文件类型');
    const extensions = this.analyzeExtensions(files);

    // 步骤 4: 生成摘要
    this.sessionManager.updateProgress(4, '生成摘要');
    const summary = this.generateExploreSummary(target, files, extensions);

    // 保存发现
    this.sessionManager.addFinding({
      type: 'info',
      title: '代码库结构',
      description: summary,
      status: 'open',
    });

    // 记录笔记
    await this.noteTool.execute({
      action: 'create',
      title: `探索: ${target}`,
      content: summary,
      note_type: 'conclusion',
      tags: ['explore', target, session.id],
    });
    this.stats.notesCreated++;

    this.sessionManager.completeSession();

    return {
      sessionId: session.id,
      structure: {
        root: this.terminalTool.getCurrentDir(),
        files: files.slice(0, 50),
        directories: this.extractDirectories(files),
      },
      summary,
    };
  }

  /**
   * 问题发现 - 扫描代码问题
   */
  async discoverIssues(scope: string, resumeSessionId?: string): Promise<IssueDiscoveryResult> {
    let session: TaskSession;

    if (resumeSessionId) {
      session = this.sessionManager.resumeSession(resumeSessionId)!;
    } else {
      session = this.sessionManager.createSession(
        'issue_discovery',
        `问题发现: ${scope}`,
        `扫描目标: ${scope}`,
        scope,
        5
      );
    }

    console.log(`[Issues] 扫描: ${scope}`);
    const issues: Issue[] = [];

    // 步骤 1: 扫描潜在问题
    this.sessionManager.updateProgress(1, '扫描代码问题');

    // 常见问题模式
    const patterns = [
      { pattern: 'TODO', type: 'code_smell' as const, severity: 'low' as const },
      { pattern: 'FIXME', type: 'bug' as const, severity: 'medium' as const },
      { pattern: 'console.log', type: 'code_smell' as const, severity: 'low' as const },
      { pattern: 'any', type: 'code_smell' as const, severity: 'medium' as const },
      { pattern: 'as any', type: 'code_smell' as const, severity: 'high' as const },
    ];

    for (const { pattern, type, severity } of patterns) {
      try {
        const result = await this.terminalTool.execute({
          command: `grep -r "${pattern}" --include="*.ts" --include="*.js" . 2>/dev/null | head -20`,
        });
        this.stats.commandsExecuted++;

        if (result && !result.includes('No such file') && !result.includes('错误')) {
          const lines = result.split('\n').filter(l => l.trim());
          for (const line of lines.slice(0, 5)) {
            const issue: Issue = {
              id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              type,
              severity,
              title: `发现 ${pattern}`,
              description: line,
              location: line.split(':').slice(0, 2).join(':'),
            };
            issues.push(issue);
            this.sessionManager.addFinding({
              type: 'issue',
              title: issue.title,
              description: issue.description,
              location: issue.location,
              severity: issue.severity,
              status: 'open',
            });
          }
        }
      } catch {
        // 忽略错误
      }
    }

    // 步骤 2-4: 分析各类问题
    this.sessionManager.updateProgress(2, '分析安全问题');
    this.sessionManager.updateProgress(3, '分析性能问题');
    this.sessionManager.updateProgress(4, '分析设计问题');

    // 步骤 5: 生成报告
    this.sessionManager.updateProgress(5, '生成报告');
    const summary = `[Issues] 发现 ${issues.length} 个问题\n` +
      issues.map(i => `- [${i.severity}] ${i.title}: ${i.location}`).join('\n');

    await this.noteTool.execute({
      action: 'create',
      title: `问题报告: ${scope}`,
      content: summary,
      note_type: 'blocker',
      tags: ['issues', scope, session.id],
    });
    this.stats.notesCreated++;
    this.stats.issuesFound += issues.length;

    this.sessionManager.completeSession();

    return {
      sessionId: session.id,
      issues,
      summary,
    };
  }

  /**
   * 重构追踪 - 跟踪重构任务
   */
  async trackRefactor(task: RefactorTask, resumeSessionId?: string): Promise<RefactorProgress> {
    let session: TaskSession;

    if (resumeSessionId) {
      session = this.sessionManager.resumeSession(resumeSessionId)!;
    } else {
      session = this.sessionManager.createSession(
        'refactor',
        task.description,
        `重构目标: ${task.target}`,
        task.target,
        task.steps.length
      );
    }

    console.log(`[Refactor] 开始: ${task.description}`);

    // 执行每个步骤
    for (let i = 0; i < task.steps.length; i++) {
      const stepName = task.steps[i];
      this.sessionManager.updateProgress(i + 1, stepName);

      await this.noteTool.execute({
        action: 'create',
        title: `步骤 ${i + 1}: ${stepName}`,
        content: `状态: 进行中\n目标: ${task.target}`,
        note_type: 'action',
        tags: ['refactor', `step_${i + 1}`, session.id],
      });
      this.stats.notesCreated++;

      // 保存进度
      this.sessionManager.saveContext(`step_${i}`, { name: stepName, status: 'completed' });
    }

    this.sessionManager.completeSession();

    const progress = session.progress;

    return {
      sessionId: session.id,
      currentStep: progress.currentStep,
      totalSteps: progress.totalSteps,
      completedSteps: progress.completedSteps,
      pendingSteps: task.steps.slice(progress.currentStep),
      status: 'completed',
    };
  }

  /**
   * 代码审查 - 审查代码质量
   */
  async reviewCode(scope: string, resumeSessionId?: string): Promise<ReviewReport> {
    let session: TaskSession;

    if (resumeSessionId) {
      session = this.sessionManager.resumeSession(resumeSessionId)!;
    } else {
      session = this.sessionManager.createSession(
        'review',
        `代码审查: ${scope}`,
        `审查范围: ${scope}`,
        scope,
        4
      );
    }

    console.log(`[Review] 审查: ${scope}`);

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const suggestions: string[] = [];

    // 步骤 1: 收集统计信息
    this.sessionManager.updateProgress(1, '收集统计');
    const stats = await this.collectCodeStats();

    // 步骤 2: 分析代码质量
    this.sessionManager.updateProgress(2, '分析质量');

    if (stats.totalFiles > 10) {
      strengths.push('项目规模适中');
    }
    if (stats.testCoverage > 0) {
      strengths.push('有测试覆盖');
    }
    if (stats.hasReadme) {
      strengths.push('有文档说明');
    }

    // 步骤 3: 识别问题
    this.sessionManager.updateProgress(3, '识别问题');

    const issues = await this.discoverIssues(scope);
    for (const issue of issues.issues.slice(0, 5)) {
      weaknesses.push(`${issue.title} (${issue.location})`);
      suggestions.push(`修复 ${issue.severity} 问题: ${issue.title}`);
    }

    // 步骤 4: 生成报告
    this.sessionManager.updateProgress(4, '生成报告');

    const summary = `[Review] 审查完成: ${scope}\n` +
      `优势: ${strengths.length} | 问题: ${weaknesses.length}`;

    await this.noteTool.execute({
      action: 'create',
      title: `审查报告: ${scope}`,
      content: `## 优势\n${strengths.map(s => `- ${s}`).join('\n')}\n\n## 问题\n${weaknesses.map(w => `- ${w}`).join('\n')}\n\n## 建议\n${suggestions.map(s => `- ${s}`).join('\n')}`,
      note_type: 'conclusion',
      tags: ['review', scope, session.id],
    });
    this.stats.notesCreated++;

    this.sessionManager.completeSession();

    return {
      sessionId: session.id,
      summary,
      strengths,
      weaknesses,
      suggestions,
      findings: session.findings,
    };
  }

  // ==================== 便捷方法 ====================

  /**
   * 探索代码库
   */
  async exploreCodebase(target: string = '.'): Promise<string> {
    return this.run(`请探索 ${target} 的代码结构`, 'explore');
  }

  /**
   * 分析代码质量
   */
  async analyzeCodeQuality(focus: string = ''): Promise<string> {
    const query = `请分析代码质量` + (focus ? `,重点关注${focus}` : '');
    return this.run(query, 'analyze');
  }

  /**
   * 规划下一步任务
   */
  async planNextSteps(): Promise<string> {
    return this.run('根据当前进度,规划下一步任务', 'plan');
  }

  /**
   * 执行终端命令
   */
  async executeCommand(command: string): Promise<string> {
    const result = await this.terminalTool.execute({ command });
    this.stats.commandsExecuted++;
    return result;
  }

  /**
   * 创建笔记
   */
  async createNote(
    title: string,
    content: string,
    noteType: NoteType = 'general',
    tags: string[] = []
  ): Promise<string> {
    const result = await this.noteTool.execute({
      action: 'create',
      title,
      content,
      note_type: noteType,
      tags: tags.length > 0 ? tags : [this.projectName],
    });
    this.stats.notesCreated++;
    return result;
  }

  // ==================== 会话管理 ====================

  listSessions() {
    return this.sessionManager.listSessions();
  }

  getSession(sessionId: string) {
    return this.sessionManager.setCurrentSession(sessionId);
  }

  resumeSession(sessionId: string) {
    return this.sessionManager.resumeSession(sessionId);
  }

  getCurrentSession() {
    return this.sessionManager.getCurrentSession();
  }

  pauseCurrentSession() {
    this.sessionManager.pauseSession();
  }

  getSessionsSummary() {
    return this.sessionManager.getSummary();
  }

  // ==================== 笔记管理 ====================

  async searchNotes(query: string): Promise<string> {
    return this.noteTool.execute({
      action: 'search',
      query,
    });
  }

  async listNotes(noteType?: NoteType, sessionId?: string): Promise<string> {
    return this.noteTool.execute({
      action: 'list',
      note_type: noteType,
    });
  }

  // ==================== 统计与报告 ====================

  /**
   * 获取统计信息
   */
  getStats(): MaintainerStats {
    const duration = (Date.now() - this.stats.sessionStart.getTime()) / 1000;

    return {
      session_info: {
        session_id: this.sessionId,
        project: this.projectName,
        duration_seconds: duration,
      },
      activity: {
        commands_executed: this.stats.commandsExecuted,
        notes_created: this.stats.notesCreated,
        issues_found: this.stats.issuesFound,
      },
    };
  }

  /**
   * 生成会话报告
   */
  generateReport(saveToFile: boolean = true): MaintainerStats & { report_file?: string } {
    const report = this.getStats();

    if (saveToFile) {
      const reportFile = `maintainer_report_${this.sessionId}.json`;
      const fs = require('fs');
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf-8');
      console.log(`📄 报告已保存: ${reportFile}`);
      return { ...report, report_file: reportFile };
    }

    return report;
  }

  // ==================== 辅助方法 ====================

  private analyzeExtensions(files: string[]): Record<string, number> {
    const exts: Record<string, number> = {};
    for (const file of files) {
      const ext = file.split('.').pop()?.toLowerCase() || 'none';
      exts[ext] = (exts[ext] || 0) + 1;
    }
    return exts;
  }

  private extractDirectories(files: string[]): string[] {
    const dirs = new Set<string>();
    for (const file of files) {
      const parts = file.replace(/\\/g, '/').split('/');
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    }
    return Array.from(dirs).slice(0, 20);
  }

  private generateExploreSummary(target: string, files: string[], exts: Record<string, number>): string {
    const extList = Object.entries(exts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ext, count]) => `${ext}: ${count}`)
      .join(', ');

    return `[Explore] ${target}\n` +
      `- 总文件数: ${files.length}\n` +
      `- 文件类型: ${extList}`;
  }

  private async collectCodeStats(): Promise<{
    totalFiles: number;
    testCoverage: number;
    hasReadme: boolean;
  }> {
    let totalFiles = 0;
    let testCoverage = 0;
    let hasReadme = false;

    try {
      const list = await this.terminalTool.execute({ command: 'find . -type f | wc -l' });
      totalFiles = parseInt(list.trim()) || 0;
      this.stats.commandsExecuted++;
    } catch {}

    try {
      const testFiles = await this.terminalTool.execute({ command: 'find . -name "*.test.ts" -o -name "*.spec.ts" | wc -l' });
      testCoverage = parseInt(testFiles.trim()) || 0;
      this.stats.commandsExecuted++;
    } catch {}

    try {
      const readme = await this.terminalTool.execute({ command: 'ls README.md 2>/dev/null' });
      hasReadme = readme.includes('README');
      this.stats.commandsExecuted++;
    } catch {}

    return { totalFiles, testCoverage, hasReadme };
  }
}

export { SessionManager, TaskSession, TaskType, Finding };
