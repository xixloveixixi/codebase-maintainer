/**
 * TerminalTool - 终端命令执行工具
 * 安全只读命令执行
 */

import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

const ALLOWED_COMMANDS = new Set([
  'ls', 'dir', 'tree',
  'cat', 'head', 'tail', 'find', 'grep', 'egrep', 'fgrep',
  'wc', 'sort', 'uniq', 'cut', 'awk', 'sed',
  'pwd', 'file', 'stat', 'du', 'df', 'echo', 'which',
]);

export interface TerminalToolOptions {
  workspace?: string;
  timeout?: number;
}

export class TerminalTool {
  private workspace: string;
  private currentDir: string;
  private timeout: number;

  constructor(options: TerminalToolOptions = {}) {
    this.workspace = options.workspace || process.cwd();
    this.currentDir = this.workspace;
    this.timeout = options.timeout || 30000;
  }

  async execute(command: string): Promise<string> {
    if (!command) return '[Terminal] 请提供命令';

    const cmdName = command.trim().split(/\s+/)[0].toLowerCase();

    if (!ALLOWED_COMMANDS.has(cmdName)) {
      return `[Terminal] 不允许: ${cmdName}`;
    }

    if (cmdName === 'cd') return this.handleCd(command);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.currentDir,
        timeout: this.timeout,
        windowsHide: true,
      });

      let output = stdout;
      if (stderr) output += `\n[stderr] ${stderr}`;
      return output || '[Terminal] 执行成功（无输出）';
    } catch (error: any) {
      if (error.killed) return `[Terminal] 超时 (${this.timeout / 1000}s)`;
      return `[Terminal] 错误: ${error.message}`;
    }
  }

  private handleCd(command: string): string {
    const parts = command.trim().split(/\s+/);
    if (parts.length < 2) return `[Terminal] 当前: ${this.currentDir}`;

    const target = parts[1];
    let newDir: string;

    try {
      if (target === '..') newDir = path.resolve(this.currentDir, '..');
      else if (target === '.') newDir = this.currentDir;
      else if (target === '~') newDir = this.workspace;
      else newDir = path.resolve(this.currentDir, target);

      newDir = path.normalize(newDir);
      const relative = path.relative(this.workspace, newDir);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return `[Terminal] 禁止访问: ${newDir}`;
      }

      if (!fs.existsSync(newDir) || !fs.statSync(newDir).isDirectory()) {
        return `[Terminal] 无效目录: ${newDir}`;
      }

      this.currentDir = newDir;
      return `[Terminal] 切换: ${this.currentDir}`;
    } catch (error: any) {
      return `[Terminal] 错误: ${error.message}`;
    }
  }

  getCurrentDir(): string {
    return this.currentDir;
  }

  reset(): void {
    this.currentDir = this.workspace;
  }

  // 便捷方法
  async listFiles(pattern: string = '*'): Promise<string> {
    return this.execute(process.platform === 'win32' ? `dir ${pattern}` : `ls ${pattern}`);
  }

  async tree(depth: number = 2): Promise<string> {
    return this.execute(process.platform === 'win32' ? `tree /f /a` : `tree -L ${depth}`);
  }

  async searchInFiles(pattern: string, extensions: string[] = ['ts', 'js', 'tsx', 'jsx']): Promise<string> {
    const exts = extensions.map(e => `*.${e}`).join(' ');
    return this.execute(`grep -r "${pattern}" --include="${exts}" .`);
  }

  async getFileInfo(filePath: string): Promise<string> {
    return this.execute(process.platform === 'win32' ? `dir "${filePath}"` : `ls -la "${filePath}"`);
  }
}
