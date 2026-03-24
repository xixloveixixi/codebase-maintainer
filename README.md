# CodebaseMaintainer

基于 [HelloAgents](https://github.com/your-username/hello-agents) TypeScript 框架的代码库维护智能体。

## 特性

- **长程记忆** - 跨会话追踪任务进度，支持断点续做
- **代码探索** - 自动分析代码库结构，识别关键模块
- **问题发现** - 扫描代码问题（TODO、FIXME、代码异味）
- **重构追踪** - 跟踪重构任务进度
- **代码审查** - 评估代码质量，提供改进建议
- **笔记管理** - 自动记录发现和决策

## 架构

```
CodebaseMaintainer
├── SessionManager     # 会话持久化
├── ContextBuilder     # 上下文工程 (GSSC 管道)
├── ToolRegistry       # 工具系统
│   ├── TerminalTool  # 安全命令执行
│   ├── NoteTool      # 笔记管理
│   └── MemoryTool    # 长期记忆
└── HelloAgentsLLM    # LLM 集成
```

## 快速开始

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 开发模式
npm run dev
```

## 使用示例

```typescript
import { CodebaseMaintainer } from './src';

const maintainer = new CodebaseMaintainer({
  projectName: 'my-project',
  codebasePath: '/path/to/project',
  notesDir: './notes',
  sessionsDir: './sessions',
});

// 探索代码库
const result = await maintainer.explore('./src');

// 问题发现
const issues = await maintainer.discoverIssues('./src');

// 重构追踪
const progress = await maintainer.trackRefactor({
  target: './src/utils',
  description: '重构工具模块',
  steps: ['分析依赖', '提取公共函数', '添加单元测试'],
});

// 运行助手
const response = await maintainer.run('请帮我分析这个项目的代码质量');
```

## 运行模式

| 模式 | 说明 |
|------|------|
| `auto` | 自动决策 |
| `explore` | 侧重代码探索 |
| `analyze` | 侧重问题分析 |
| `plan` | 侧重任务规划 |

## 依赖框架

- [hello-agents](https://github.com/your-username/hello-agents) - TypeScript Agent Framework

## License

MIT
