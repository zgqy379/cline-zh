import { isRecord, normalizeValue } from "./parsers.js";

export type ToolAggregate = {
	key: string;
	count: number;
	noun: string;
	pluralNoun?: string;
	completedVerb: string;
	progressVerb: string;
};

export type TeamSummaryResult = {
	label: string;
	details: string[];
	aggregate?: ToolAggregate;
};

/**
 * `${count} ${noun}`。
 *
 * ⚠️ 中文名词没有复数变化，原实现默认给 plural 加 "s"，
 *    导致「2 文件s」这种错误输出。这里在名词含中日韩字符时
 *    跳过复数后缀，直接复用原词。
 */
export function pluralize(
	count: number,
	singular: string,
	plural = `${singular}s`,
): string {
	const hasCjk = /[㐀-鿿぀-ヿ]/.test(singular);
	const noun = count === 1 || hasCjk ? singular : plural;
	return `${count} ${noun}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return isRecord(value) ? value : null;
}

function resultRecords(result: unknown): Record<string, unknown>[] {
	const normalized = normalizeValue(result);
	if (Array.isArray(normalized)) {
		return normalized
			.map(asRecord)
			.filter((item): item is Record<string, unknown> => item !== null);
	}
	const record = asRecord(normalized);
	return record ? [record] : [];
}

function recordString(
	record: Record<string, unknown> | null | undefined,
	key: string,
	fallback = "",
): string {
	const value = record?.[key];
	return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function teamSummary(
	toolName: string,
	input: unknown,
	result: unknown,
	inProgress: boolean,
	isError: boolean,
): TeamSummaryResult | null {
	if (!toolName.startsWith("team_")) return null;
	if (isError) {
		const failureLabels: Record<string, string> = {
			team_attach_outcome_fragment: "未能附加成果片段",
			team_await_runs: "等待队友时失败",
			team_broadcast: "向队友广播消息失败",
			team_cancel_run: "取消队友运行失败",
			team_cleanup: "清理团队失败",
			team_create_outcome: "创建团队成果失败",
			team_finalize_outcome: "确定团队成果失败",
			team_list_outcomes: "列出团队成果失败",
			team_list_runs: "列出队友运行失败",
			team_mission_log: "更新任务日志失败",
			team_read_mailbox: "读取团队邮箱失败",
			team_review_outcome_fragment: "复核成果片段失败",
			team_run_task: "分配团队任务失败",
			team_send_message: "发送消息失败",
			team_shutdown_teammate: "停止队友失败",
			team_spawn_teammate: "生成队友失败",
			team_status: "检查团队状态失败",
			team_task: "更新团队任务失败",
		};
		return {
			label: failureLabels[toolName] ?? `${toolName} 失败`,
			details: [],
		};
	}
	const inputRecord = asRecord(normalizeValue(input));
	const records = resultRecords(result);
	const resultRecord = records[0];
	const aggregate = (
		key: string,
		noun: string,
		completedVerb: string,
		progressVerb: string,
		details: string[],
		pluralNoun?: string,
		count = 1,
	): TeamSummaryResult => ({
		label: `${inProgress ? progressVerb : completedVerb} ${pluralize(
			count,
			noun,
			pluralNoun,
		)}`,
		aggregate: {
			key,
			count,
			noun,
			pluralNoun,
			completedVerb,
			progressVerb,
		},
		details,
	});
	const agentId = recordString(
		resultRecord,
		"agentId",
		recordString(inputRecord, "agentId"),
	);

	switch (toolName) {
		case "team_spawn_teammate":
			return aggregate(
				"team-spawn",
				"名队友",
				"已生成",
				"正在生成",
				agentId ? [agentId] : [],
				"名队友",
			);
		case "team_run_task": {
			const mode = recordString(
				resultRecord,
				"mode",
				recordString(inputRecord, "runMode", "sync"),
			);
			const status = inProgress
				? "assigning"
				: recordString(resultRecord, "status", "assigned");
			return aggregate(
				"team-run-task",
				"项团队任务",
				"已分配",
				"正在分配",
				[mode, agentId, status].filter(Boolean).join(" ")
				? [[mode, agentId, status].filter(Boolean).join(" ")]
				: [],
				"项团队任务",
			);
		}
		case "team_await_runs": {
			const details = records.map((run) =>
				[
					recordString(run, "agentId", recordString(run, "id")),
					recordString(run, "status"),
				]
					.filter(Boolean)
					.join(" "),
			);
			return {
				label: inProgress ? "正在等待队友" : "已等待队友",
				details,
			};
		}
		case "team_shutdown_teammate":
			return aggregate(
				"team-shutdown",
				"名队友",
				"已停止",
				"正在停止",
				agentId ? [agentId] : [],
				"名队友",
			);
		case "team_status": {
			const members = Array.isArray(resultRecord?.members)
				? resultRecord.members
						.map(asRecord)
						.filter((item): item is Record<string, unknown> => item !== null)
				: [];
			return {
				label: inProgress ? "正在检查团队状态" : "已检查团队状态",
				details: members.map((member) =>
					[recordString(member, "agentId"), recordString(member, "status")]
						.filter(Boolean)
						.join(" "),
				),
			};
		}
		case "team_task": {
			const action = recordString(
				inputRecord,
				"action",
				recordString(resultRecord, "action", "update"),
			);
			const verbs: Record<string, [string, string]> = {
				create: ["已创建", "正在创建"],
				list: ["已列出", "正在列出"],
				claim: ["已认领", "正在认领"],
				complete: ["已完成", "正在完成"],
				block: ["已阻塞", "正在阻塞"],
			};
			const [completedVerb, progressVerb] = verbs[action] ?? [
				"已更新",
				"正在更新",
			];
			const tasks = Array.isArray(resultRecord?.tasks)
				? resultRecord.tasks
						.map(asRecord)
						.filter((item): item is Record<string, unknown> => item !== null)
				: records;
			const details = tasks.map((task) =>
				[
					recordString(
						task,
						"taskId",
						recordString(task, "id", recordString(inputRecord, "taskId")),
					),
					recordString(task, "title", recordString(inputRecord, "title")),
					recordString(task, "status"),
				]
					.filter(Boolean)
					.join(" "),
			);
			return aggregate(
				`team-task-${action}`,
				"项团队任务",
				completedVerb,
				progressVerb,
				details,
				"项团队任务",
				action === "list" ? tasks.length : 1,
			);
		}
		case "team_list_runs":
			return {
				label: inProgress
					? "正在列出队友运行"
					: `已列出 ${pluralize(records.length, "次队友运行", "次队友运行")}`,
				details: records.map((run) =>
					[recordString(run, "agentId"), recordString(run, "status")]
						.filter(Boolean)
						.join(" "),
				),
			};
		case "team_cancel_run":
			return {
				label: inProgress
					? "正在取消队友运行"
					: "已取消队友运行",
				details: [
					[
						recordString(
							resultRecord,
							"runId",
							recordString(inputRecord, "runId"),
						),
						recordString(resultRecord, "status"),
					]
						.filter(Boolean)
						.join(" "),
				].filter(Boolean),
			};
		case "team_send_message": {
			const recipient = recordString(
				resultRecord,
				"toAgentId",
				recordString(inputRecord, "toAgentId"),
			);
			return aggregate(
				"team-send-message",
				"条消息",
				"已发送",
				"正在发送",
				[recipient, recordString(inputRecord, "subject")].filter(Boolean).length
				? [
					[recipient, recordString(inputRecord, "subject")]
						.filter(Boolean)
						.join(" "),
					]
				: [],
				"条消息",
			);
		}
		case "team_broadcast": {
			const delivered = resultRecord?.delivered;
			return {
				label: inProgress
					? "正在向队友广播消息"
					: `已向 ${pluralize(typeof delivered === "number" ? delivered : 0, "名队友", "名队友")} 广播消息`,
				details: recordString(inputRecord, "subject")
					? [recordString(inputRecord, "subject")]
					: [],
			};
		}
		case "team_read_mailbox":
			return {
				label: inProgress
					? "正在读取团队邮箱"
					: `已读取 ${pluralize(records.length, "条团队消息", "条团队消息")}`,
				details: records.map((message) =>
					[
						recordString(message, "fromAgentId"),
						recordString(message, "subject"),
					]
						.filter(Boolean)
						.join(" "),
				),
			};
		case "team_mission_log":
			return {
				label: inProgress ? "正在更新任务日志" : "已更新任务日志",
				details: [
					[
						recordString(inputRecord, "kind"),
						recordString(inputRecord, "summary"),
					]
						.filter(Boolean)
						.join(" "),
				].filter(Boolean),
			};
		case "team_cleanup":
			return {
				label: inProgress ? "正在清理团队" : "已清理团队",
				details: recordString(resultRecord, "status")
					? [recordString(resultRecord, "status")]
					: [],
			};
		case "team_create_outcome":
			return {
				label: inProgress ? "正在创建团队成果" : "已创建团队成果",
				details: [
					[
						recordString(resultRecord, "outcomeId"),
						recordString(inputRecord, "title"),
						recordString(resultRecord, "status"),
					]
						.filter(Boolean)
						.join(" "),
				].filter(Boolean),
			};
		case "team_attach_outcome_fragment":
			return {
				label: inProgress
					? "正在附加成果片段"
					: "已附加成果片段",
				details: [
					[
						recordString(inputRecord, "section"),
						recordString(resultRecord, "status"),
					]
						.filter(Boolean)
						.join(" "),
				].filter(Boolean),
			};
		case "team_review_outcome_fragment":
			return {
				label: inProgress
					? "正在复核成果片段"
					: "已复核成果片段",
				details: [
					[
						recordString(inputRecord, "fragmentId"),
						typeof inputRecord?.approved === "boolean"
							? inputRecord.approved
								? "已批准"
								: "已拒绝"
							: recordString(resultRecord, "status"),
					]
						.filter(Boolean)
						.join(" "),
				].filter(Boolean),
			};
		case "team_finalize_outcome":
			return {
				label: inProgress
					? "正在确定团队成果"
					: "已确定团队成果",
				details: [
					[
						recordString(
							resultRecord,
							"outcomeId",
							recordString(inputRecord, "outcomeId"),
						),
						recordString(resultRecord, "status"),
					]
						.filter(Boolean)
						.join(" "),
				].filter(Boolean),
			};
		case "team_list_outcomes":
			return {
				label: inProgress
					? "正在列出团队成果"
					: `已列出 ${pluralize(records.length, "份团队成果", "份团队成果")}`,
				details: records.map((outcome) =>
					[
						recordString(outcome, "title", recordString(outcome, "id")),
						recordString(outcome, "status"),
					]
						.filter(Boolean)
						.join(" "),
				),
			};
		default:
			return null;
	}
}
