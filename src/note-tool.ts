/**
 * NoteTool - 笔记工具
 * 轻量级持久笔记管理
 */

import * as fs from 'fs';
import * as path from 'path';

export type NoteType = 'task_state' | 'conclusion' | 'blocker' | 'action' | 'reference' | 'general';

export interface NoteMetadata {
  id: string;
  title: string;
  type: NoteType;
  tags: string[];
  created_at: string;
  updated_at: string;
  session_id?: string;
}

export class NoteTool {
  private workspace: string;
  private indexPath: string;
  private index: Record<string, NoteMetadata> = {};

  constructor(workspace: string = './notes') {
    this.workspace = workspace;
    this.indexPath = path.join(workspace, '.note-index.json');
    this.ensureWorkspace();
    this.loadIndex();
  }

  private ensureWorkspace(): void {
    if (!fs.existsSync(this.workspace)) {
      fs.mkdirSync(this.workspace, { recursive: true });
    }
  }

  private loadIndex(): void {
    try {
      if (fs.existsSync(this.indexPath)) {
        this.index = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
      }
    } catch {
      this.index = {};
    }
  }

  private saveIndex(): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
  }

  private generateId(): string {
    return `note_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  create(title: string, content: string, noteType: NoteType = 'general', tags: string[] = [], sessionId?: string): string {
    if (!title || !content) return '需要 title 和 content';

    const noteId = this.generateId();
    const now = new Date().toISOString();

    const metadata: NoteMetadata = {
      id: noteId,
      title,
      type: noteType,
      tags,
      created_at: now,
      updated_at: now,
      session_id: sessionId,
    };

    const filePath = path.join(this.workspace, `${noteId}.md`);
    const mdContent = `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n${content}`;

    fs.writeFileSync(filePath, mdContent, 'utf-8');
    this.index[noteId] = metadata;
    this.saveIndex();

    return `[Note] 创建: ${title} (${noteId})`;
  }

  read(noteId: string): string {
    const meta = this.index[noteId];
    if (!meta) return `[Note] 不存在: ${noteId}`;

    const filePath = path.join(this.workspace, `${noteId}.md`);
    if (!fs.existsSync(filePath)) return `[Note] 文件丢失: ${noteId}`;

    const content = fs.readFileSync(filePath, 'utf-8').split('---\n\n').slice(1).join('\n\n');
    return `[${meta.type}] ${meta.title}\n\n${content}`;
  }

  update(noteId: string, title?: string, content?: string, noteType?: NoteType, tags?: string[]): string {
    const meta = this.index[noteId];
    if (!meta) return `[Note] 不存在: ${noteId}`;

    const filePath = path.join(this.workspace, `${noteId}.md`);
    if (title) meta.title = title;
    if (noteType) meta.type = noteType;
    if (tags) meta.tags = tags;
    meta.updated_at = new Date().toISOString();

    let mdContent = content;
    if (content === undefined) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      mdContent = raw.split('---\n\n').slice(1).join('\n\n');
    }

    const newContent = `---\n${JSON.stringify(meta, null, 2)}\n---\n\n${mdContent}`;
    fs.writeFileSync(filePath, newContent, 'utf-8');
    this.saveIndex();

    return `[Note] 更新: ${meta.title}`;
  }

  list(noteType?: NoteType, sessionId?: string): NoteMetadata[] {
    let results = Object.values(this.index);

    if (noteType) results = results.filter(n => n.type === noteType);
    if (sessionId) results = results.filter(n => n.session_id === sessionId);

    return results.sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  search(query: string, limit: number = 10): NoteMetadata[] {
    const q = query.toLowerCase();
    const results: NoteMetadata[] = [];

    for (const meta of Object.values(this.index)) {
      if (meta.title.toLowerCase().includes(q)) {
        results.push(meta);
      }
    }

    return results.slice(0, limit);
  }

  delete(noteId: string): string {
    const meta = this.index[noteId];
    if (!meta) return `[Note] 不存在: ${noteId}`;

    const filePath = path.join(this.workspace, `${noteId}.md`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    delete this.index[noteId];
    this.saveIndex();

    return `[Note] 删除: ${meta.title}`;
  }

  getSummary(): string {
    const total = Object.keys(this.index).length;
    const byType: Record<string, number> = {};
    for (const meta of Object.values(this.index)) {
      byType[meta.type] = (byType[meta.type] || 0) + 1;
    }
    return `[Note] 总计: ${total} | ${JSON.stringify(byType)}`;
  }
}
