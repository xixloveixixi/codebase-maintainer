/**
 * Session Manager - 任务会话管理器
 * 支持会话持久化和断点续做
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * 任务类型
 */
export type TaskType = 'explore' | 'issue_discovery' | 'refactor' | 'review';

/**
 * 任务状态
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'paused';

/**
 * 发现项
 */
export interface Finding {
  id: string;
  type: 'issue' | 'improvement' | 'info' | 'blocker';
  title: string;
  description: string;
  location?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'resolved' | 'in_progress' | 'deferred';
  createdAt: string;
  updatedAt: string;
}

/**
 * 任务进度
 */
export interface TaskProgress {
  currentStep: number;
  totalSteps: number;
  completedSteps: string[];
  nextStep?: string;
}

/**
 * 任务会话
 */
export interface TaskSession {
  id: string;
  taskType: TaskType;
  status: TaskStatus;
  title: string;
  description: string;
  target: string;
  createdAt: string;
  updatedAt: string;
  progress: TaskProgress;
  findings: Finding[];
  notes: string[];
  context: Record<string, unknown>;
}

/**
 * 会话管理器配置
 */
export interface SessionManagerConfig {
  storageDir?: string;
  maxSessions?: number;
}

/**
 * 会话管理器
 */
export class SessionManager {
  private storageDir: string;
  private maxSessions: number;
  private currentSession: TaskSession | null = null;
  private sessions: Map<string, TaskSession> = new Map();

  constructor(config?: SessionManagerConfig) {
    this.storageDir = config?.storageDir || './sessions';
    this.maxSessions = config?.maxSessions || 50;
    this.ensureStorageDir();
    this.loadAllSessions();
  }

  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private loadAllSessions(): void {
    try {
      const files = fs.readdirSync(this.storageDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.storageDir, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const session = JSON.parse(data) as TaskSession;
          this.sessions.set(session.id, session);
        }
      }
      console.log(`[Session] 已加载 ${this.sessions.size} 个会话`);
    } catch (error) {
      console.warn('[Session] 加载失败:', error);
    }
  }

  createSession(
    taskType: TaskType,
    title: string,
    description: string,
    target: string,
    totalSteps: number = 5
  ): TaskSession {
    const now = new Date().toISOString();
    const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const session: TaskSession = {
      id,
      taskType,
      status: 'pending',
      title,
      description,
      target,
      createdAt: now,
      updatedAt: now,
      progress: { currentStep: 0, totalSteps, completedSteps: [] },
      findings: [],
      notes: [],
      context: {},
    };

    this.sessions.set(id, session);
    this.currentSession = session;
    this.saveSession(session);

    console.log(`[Session] 创建: ${id} (${taskType})`);
    return session;
  }

  private saveSession(session: TaskSession): void {
    const filePath = path.join(this.storageDir, `${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  getCurrentSession(): TaskSession | null {
    return this.currentSession;
  }

  setCurrentSession(sessionId: string): TaskSession | null {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.currentSession = session;
      return session;
    }
    return null;
  }

  resumeSession(sessionId: string): TaskSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.status === 'completed') return null;

    session.status = 'in_progress';
    session.updatedAt = new Date().toISOString();
    this.currentSession = session;
    this.saveSession(session);

    console.log(`[Session] 恢复: ${sessionId}`);
    return session;
  }

  updateProgress(step: number, stepName?: string): void {
    if (!this.currentSession) return;

    const prev = this.currentSession.progress.currentStep;
    this.currentSession.progress.currentStep = step;

    if (stepName && step > prev) {
      this.currentSession.progress.completedSteps.push(stepName);
      this.currentSession.progress.nextStep = stepName;
    }

    this.currentSession.updatedAt = new Date().toISOString();
    this.saveSession(this.currentSession);
  }

  addFinding(finding: Omit<Finding, 'id' | 'createdAt' | 'updatedAt'>): Finding {
    if (!this.currentSession) throw new Error('无当前会话');

    const now = new Date().toISOString();
    const newFinding: Finding = {
      ...finding,
      id: `finding_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      createdAt: now,
      updatedAt: now,
    };

    this.currentSession.findings.push(newFinding);
    this.currentSession.updatedAt = now;
    this.saveSession(this.currentSession);

    return newFinding;
  }

  addNote(note: string): void {
    if (!this.currentSession) return;
    this.currentSession.notes.push(note);
    this.currentSession.updatedAt = new Date().toISOString();
    this.saveSession(this.currentSession);
  }

  saveContext(key: string, value: unknown): void {
    if (!this.currentSession) return;
    this.currentSession.context[key] = value;
    this.currentSession.updatedAt = new Date().toISOString();
    this.saveSession(this.currentSession);
  }

  getContext<T>(key: string): T | undefined {
    return this.currentSession?.context[key] as T | undefined;
  }

  completeSession(): void {
    if (!this.currentSession) return;
    this.currentSession.status = 'completed';
    this.currentSession.progress.currentStep = this.currentSession.progress.totalSteps;
    this.currentSession.updatedAt = new Date().toISOString();
    this.saveSession(this.currentSession);
  }

  pauseSession(): void {
    if (!this.currentSession) return;
    this.currentSession.status = 'paused';
    this.currentSession.updatedAt = new Date().toISOString();
    this.saveSession(this.currentSession);
  }

  listSessions(status?: TaskStatus): TaskSession[] {
    let sessions = Array.from(this.sessions.values());
    if (status) sessions = sessions.filter(s => s.status === status);
    return sessions.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  getSummary(): string {
    const sessions = this.listSessions();
    const byStatus = { pending: 0, in_progress: 0, completed: 0, paused: 0 };
    const byType = { explore: 0, issue_discovery: 0, refactor: 0, review: 0 };

    for (const s of sessions) {
      byStatus[s.status]++;
      byType[s.taskType]++;
    }

    return `[Session] 总计: ${sessions.length} | 进行中: ${byStatus.in_progress} | 已完成: ${byStatus.completed}`;
  }

  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const filePath = path.join(this.storageDir, `${sessionId}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    this.sessions.delete(sessionId);
    if (this.currentSession?.id === sessionId) this.currentSession = null;
    return true;
  }
}
