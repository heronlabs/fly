import type {TranscriptSummary} from '../../core/domain/transcript';

export type TaskNotification = {
  taskId: string | null;
  toolUseId: string | null;
  status: string | null;
  result: string | null;
};

type Json = Record<string, unknown>;
type ToolResultBlock = Json & {tool_use_id: string};
type Phase = TranscriptSummary['phase'];
type Shell = {taskId: string; toolUseId: string; at: number};

const NOTIFICATION_OPEN = '<task-notification>';
const INTERRUPT_PREFIX = '[Request interrupted by user';
const META_FLAGS = ['isMeta', 'isCompactSummary', 'isVisibleInTranscriptOnly'];

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isToolResult = (block: Json): block is ToolResultBlock =>
  block.type === 'tool_result' && typeof block.tool_use_id === 'string';

const isInterrupt = (block: Json): boolean =>
  block.type === 'text' &&
  typeof block.text === 'string' &&
  block.text.startsWith(INTERRUPT_PREFIX);

const isMeta = (record: Json): boolean =>
  META_FLAGS.some(flag => record[flag] === true);

const readTimestamp = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

const readContent = (record: Json): unknown =>
  isRecord(record.message) ? record.message.content : undefined;

const readTag = (text: string, tag: string): string | null =>
  new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text)?.[1] ?? null;

export const parseTaskNotification = (
  text: string,
): TaskNotification | null => {
  if (!text.startsWith(NOTIFICATION_OPEN)) return null;
  return {
    taskId: readTag(text, 'task-id'),
    toolUseId: readTag(text, 'tool-use-id'),
    status: readTag(text, 'status'),
    result: readTag(text, 'result'),
  };
};

/**
 * Folds Claude Code transcript lines, in file order, into a TranscriptSummary
 * (spike "Reducer state" and "Line to event mapping").
 */
export class TranscriptParser {
  private readonly open = new Map<string, string>();
  private shells: Shell[] = [];
  private phase: Phase = 'none';
  private lastEventAt: number | null = null;
  private wakeupAt: number | null = null;
  private looping = false;
  private lastTurnEndAt: number | null = null;
  private backgroundAgents = 0;
  private launchCwd: string | null = null;
  private skippedLines = 0;

  get skipped(): number {
    return this.skippedLines;
  }

  push(line: string): void {
    if (line.trim() === '') return;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      this.skippedLines += 1;
      return;
    }
    if (!isRecord(record)) return;
    this.readCwd(record.cwd);
    const at = readTimestamp(record.timestamp);
    if (record.type === 'assistant') this.onAssistant(record, at);
    else if (record.type === 'user') this.onUser(record, at);
    else if (record.type === 'system') this.onSystem(record, at);
  }

  summary(): TranscriptSummary {
    return {
      phase: this.phase,
      asking: [...this.open.values()].includes('AskUserQuestion'),
      openTools: this.open.size,
      lastEventAt: this.lastEventAt,
      wakeupAt: this.wakeupAt,
      looping: this.looping,
      lastTurnEndAt: this.lastTurnEndAt,
      backgroundAgents: this.backgroundAgents,
      backgroundShells: this.shells.map(shell => shell.at),
      launchCwd: this.launchCwd,
    };
  }

  private event(phase: Phase, at: number | null): void {
    this.phase = phase;
    if (at !== null) this.lastEventAt = at;
  }

  private readCwd(cwd: unknown): void {
    if (typeof cwd === 'string' && this.launchCwd === null) {
      this.launchCwd = cwd;
    }
  }

  private onAssistant(record: Json, at: number | null): void {
    const content = readContent(record);
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (
        isRecord(block) &&
        block.type === 'tool_use' &&
        typeof block.id === 'string' &&
        typeof block.name === 'string'
      ) {
        this.open.set(block.id, block.name);
      }
    }
    this.event('mid-turn', at);
  }

  private onUser(record: Json, at: number | null): void {
    const content = readContent(record);
    if (typeof content === 'string') {
      const notification = parseTaskNotification(content);
      if (isMeta(record)) return;
      this.finishShells(notification);
      this.event('mid-turn', at);
      return;
    }
    if (!Array.isArray(content)) return;
    const blocks = content.filter(isRecord);
    const [result, ...otherResults] = blocks.filter(isToolResult);
    if (result !== undefined) {
      for (const other of otherResults) this.open.delete(other.tool_use_id);
      this.onToolResult(result, record.toolUseResult, at);
      this.event('mid-turn', at);
    } else if (blocks.some(isInterrupt)) {
      this.open.clear();
      this.event('turn-ended', at);
    } else if (!isMeta(record)) {
      this.event('mid-turn', at);
    }
  }

  private onToolResult(
    result: ToolResultBlock,
    toolUseResult: unknown,
    at: number | null,
  ): void {
    const toolUseId = result.tool_use_id;
    const tool = this.open.get(toolUseId);
    this.open.delete(toolUseId);
    // A string toolUseResult is an error result: the tool still closes.
    if (!isRecord(toolUseResult)) return;
    if (tool === 'ScheduleWakeup') {
      if (toolUseResult.stopped === true) {
        this.wakeupAt = null;
        this.looping = false;
      } else if (typeof toolUseResult.scheduledFor === 'number') {
        this.wakeupAt = toolUseResult.scheduledFor;
        this.looping = true;
      }
    }
    const taskId =
      typeof toolUseResult.backgroundTaskId === 'string'
        ? toolUseResult.backgroundTaskId
        : tool === 'Monitor' && typeof toolUseResult.taskId === 'string'
          ? toolUseResult.taskId
          : null;
    if (taskId !== null) {
      this.shells.push({taskId, toolUseId, at: at ?? this.lastEventAt ?? 0});
    }
  }

  private finishShells(notification: TaskNotification | null): void {
    if (notification === null || notification.status === null) return;
    this.shells = this.shells.filter(
      shell =>
        shell.toolUseId !== notification.toolUseId &&
        shell.taskId !== notification.taskId,
    );
  }

  private onSystem(record: Json, at: number | null): void {
    switch (record.subtype) {
      case 'turn_duration':
        this.backgroundAgents =
          typeof record.pendingBackgroundAgentCount === 'number'
            ? record.pendingBackgroundAgentCount
            : 0;
        if (at !== null) this.lastTurnEndAt = at;
        this.event('turn-ended', at);
        break;
      case 'local_command':
        this.event('turn-ended', at);
        break;
      case 'scheduled_task_fire':
        this.wakeupAt = null;
        this.looping = true;
        this.event('mid-turn', at);
        break;
      case 'agents_killed':
        this.backgroundAgents = 0;
        break;
    }
  }
}
