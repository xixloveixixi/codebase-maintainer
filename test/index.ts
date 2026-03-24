/**
 * CodebaseMaintainer 测试
 */

import { CodebaseMaintainer } from '../src/index';

async function main() {
  console.log('=== CodebaseMaintainer 测试 ===\n');

  // 初始化（使用当前目录作为工作区）
  const maintainer = new CodebaseMaintainer({
    projectName: 'test-project',
    codebasePath: process.cwd(),
    notesDir: './test_notes',
    sessionsDir: './test_sessions',
  });

  // 测试 1: 代码探索
  console.log('\n--- 测试 1: 代码探索 ---');
  const exploreResult = await maintainer.explore('./src');
  console.log('探索结果:', exploreResult.summary);

  // 测试 2: 问题发现
  console.log('\n--- 测试 2: 问题发现 ---');
  const issuesResult = await maintainer.discoverIssues('./src');
  console.log('发现:', issuesResult.issues.length, '个问题');

  // 测试 3: 列出会话
  console.log('\n--- 测试 3: 会话列表 ---');
  const sessions = maintainer.listSessions();
  console.log('会话数:', sessions.length);
  console.log(maintainer.getSessionsSummary());

  // 测试 4: 笔记搜索
  console.log('\n--- 测试 4: 笔记搜索 ---');
  const notes = await maintainer.searchNotes('explore');
  console.log('相关笔记:', notes);

  // 测试 5: 重构追踪
  console.log('\n--- 测试 5: 重构追踪 ---');
  const refactorResult = await maintainer.trackRefactor({
    target: './src/utils',
    description: '重构工具模块',
    steps: ['分析依赖', '提取公共函数', '添加单元测试', '更新文档'],
  });
  console.log('重构进度:', refactorResult.currentStep, '/', refactorResult.totalSteps);

  // 测试 6: 代码审查
  console.log('\n--- 测试 6: 代码审查 ---');
  const reviewResult = await maintainer.reviewCode('./src');
  console.log('审查结果:', reviewResult.summary);

  // 测试 7: 断点续做
  console.log('\n--- 测试 7: 断点续做 ---');
  const sessionId = sessions[0]?.id;
  if (sessionId) {
    const resumed = maintainer.resumeSession(sessionId);
    console.log('恢复会话:', resumed?.title);
  }

  // 测试 8: 运行助手
  console.log('\n--- 测试 8: 运行助手 ---');
  const response = await maintainer.run('请帮我探索这个项目的结构', 'explore');
  console.log('助手响应:', response.slice(0, 200), '...');

  // 测试 9: 获取统计
  console.log('\n--- 测试 9: 统计信息 ---');
  const stats = maintainer.getStats();
  console.log('统计:', JSON.stringify(stats, null, 2));

  console.log('\n=== 测试完成 ===');
}

main().catch(console.error);
