export interface SessionEntry {
  role: "user" | "assistant" | "summary";
  contentZh: string;
}

const MAX_FULL_ROUNDS = 10; // 保留最近 10 轮完整对话 = 20 条
const COMPRESS_THRESHOLD = 20; // 超过 20 条时触发压缩

export class SessionMemory {
  private entries: SessionEntry[] = [];

  pushUser(content: string) {
    this.entries.push({ role: "user", contentZh: content });
    this.maybeCompress();
  }

  pushAssistant(summary: string) {
    this.entries.push({ role: "assistant", contentZh: summary });
    this.maybeCompress();
  }

  private maybeCompress() {
    if (this.entries.length <= COMPRESS_THRESHOLD) return;

    // 超出部分：保留最后 10 轮（20 条），把更旧的内容压缩成摘要
    const oldEntries = this.entries.slice(0, this.entries.length - MAX_FULL_ROUNDS);
    const recentEntries = this.entries.slice(-MAX_FULL_ROUNDS);

    // 提取旧记录中的用户话题和系统结论
    const userTopics = oldEntries
      .filter((e) => e.role === "user")
      .map((e) => e.contentZh.slice(0, 30) + (e.contentZh.length > 30 ? "…" : ""))
      .join("；");

    const assistantConclusions = oldEntries
      .filter((e) => e.role === "assistant")
      .map((e) => e.contentZh.slice(0, 30) + (e.contentZh.length > 30 ? "…" : ""))
      .join("；");

    const summaryContent = `【历史摘要】此前对话涉及用户输入：${userTopics || "无"}；系统判定：${assistantConclusions || "无"}`;

    this.entries = [
      { role: "summary", contentZh: summaryContent },
      ...recentEntries,
    ];
  }

  formatContext(): string {
    if (this.entries.length === 0) return "";
    return this.entries
      .map((e) => {
        if (e.role === "user") return `用户: ${e.contentZh}`;
        if (e.role === "assistant") return `系统: ${e.contentZh}`;
        return e.contentZh;
      })
      .join("\n");
  }

  clear() {
    this.entries = [];
  }
}
