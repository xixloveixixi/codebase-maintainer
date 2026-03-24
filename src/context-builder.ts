/**
 * ContextBuilder - 上下文构建器
 * GSSC Pipeline: Gather → Select → Structure → Compress
 */

export interface ContextPacket {
  content: string;
  timestamp: Date;
  tokenCount: number;
  relevanceScore: number;
  source: 'memory' | 'note' | 'session' | 'system';
  metadata?: Record<string, unknown>;
}

export interface ContextConfig {
  maxTokens: number;
  reserveRatio: number;
  minRelevance: number;
}

export interface GatherParams {
  userQuery: string;
  sessionContext?: ContextPacket[];
  memoryResults?: ContextPacket[];
  noteResults?: ContextPacket[];
  systemInstructions?: string;
}

export interface ContextBuildResult {
  packets: ContextPacket[];
  totalTokens: number;
  utilization: number;
  structuredContext: string;
}

export class ContextBuilder {
  private config: ContextConfig;

  constructor(config: Partial<ContextConfig> = {}) {
    this.config = {
      maxTokens: config.maxTokens || 4000,
      reserveRatio: config.reserveRatio || 0.2,
      minRelevance: config.minRelevance || 0.1,
    };
  }

  async build(params: GatherParams): Promise<ContextBuildResult> {
    const packets = this.gather(params);
    const selected = this.select(packets, params.userQuery);
    const structured = this.structure(selected, params.userQuery);
    const final = this.compress(structured, this.config.maxTokens - Math.floor(this.config.maxTokens * this.config.reserveRatio));

    return {
      packets: selected,
      totalTokens: this.countTokens(final),
      utilization: this.countTokens(final) / (this.config.maxTokens * (1 - this.config.reserveRatio)),
      structuredContext: final,
    };
  }

  private gather(params: GatherParams): ContextPacket[] {
    const packets: ContextPacket[] = [];

    if (params.systemInstructions) {
      packets.push({
        content: params.systemInstructions,
        timestamp: new Date(),
        tokenCount: this.countTokens(params.systemInstructions),
        relevanceScore: 1.0,
        source: 'system',
        metadata: { type: 'system' },
      });
    }

    if (params.sessionContext) packets.push(...params.sessionContext);
    if (params.memoryResults) packets.push(...params.memoryResults);
    if (params.noteResults) packets.push(...params.noteResults);

    return packets;
  }

  private select(packets: ContextPacket[], query: string): ContextPacket[] {
    const availableTokens = this.config.maxTokens - Math.floor(this.config.maxTokens * this.config.reserveRatio);

    // 计算相关性
    for (const packet of packets) {
      if (packet.relevanceScore === 0.5) {
        packet.relevanceScore = this.calculateRelevance(packet.content, query);
      }
    }

    // 按相关性排序
    packets.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // 贪心选择
    const selected: ContextPacket[] = [];
    let currentTokens = 0;

    for (const packet of packets) {
      if (currentTokens + packet.tokenCount <= availableTokens) {
        selected.push(packet);
        currentTokens += packet.tokenCount;
      }
    }

    return selected;
  }

  private structure(packets: ContextPacket[], query: string): string {
    const sections: string[] = [];
    sections.push(`[Task]\n${query}\n`);

    const bySource: Record<string, string[]> = {};
    for (const packet of packets) {
      const src = packet.source;
      if (!bySource[src]) bySource[src] = [];
      bySource[src].push(packet.content);
    }

    for (const [source, contents] of Object.entries(bySource)) {
      sections.push(`[${source}]\n${contents.join('\n---\n')}`);
    }

    sections.push('[Output]\n请基于以上信息提供分析和建议。');
    return sections.join('\n\n');
  }

  private compress(context: string, maxTokens: number): string {
    const currentTokens = this.countTokens(context);
    if (currentTokens <= maxTokens) return context;

    const sections = context.split('\n\n');
    const compressed: string[] = [];
    let current = 0;

    for (const section of sections) {
      const sectionTokens = this.countTokens(section);
      if (current + sectionTokens <= maxTokens) {
        compressed.push(section);
        current += sectionTokens;
      } else {
        break;
      }
    }

    return compressed.join('\n\n') + '\n\n[... 内容已压缩 ...]';
  }

  private calculateRelevance(content: string, query: string): number {
    const contentWords = new Set(content.toLowerCase().split(/\s+/));
    const queryWords = new Set(query.toLowerCase().split(/\s+/));

    if (queryWords.size === 0) return 0;

    const intersection = new Set([...contentWords].filter(x => queryWords.has(x)));
    const union = new Set([...contentWords, ...queryWords]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private countTokens(text: string): number {
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const english = (text.match(/[a-zA-Z]+/g) || []).length;
    return Math.ceil(chinese + english * 1.3);
  }

  updateConfig(config: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ContextConfig {
    return { ...this.config };
  }
}
