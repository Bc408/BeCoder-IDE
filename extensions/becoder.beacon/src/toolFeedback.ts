/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

// Only these application-owned codes cross into activity UI. Never display raw exceptions.
const messages = {
	'unavailable': ['The operation did not complete. Try again when the service or resource is available.', '操作未完成，请在服务或资源可用后重试。'],
	'rate-limit': ['Search service rate limited. Try again later.', '搜索服务暂时限流，请稍后再试。'],
	'timeout': ['The operation timed out. Try again later.', '操作超时，请稍后重试。'],
	'invalid-response': ['The service returned an unreadable result.', '服务返回的结果无法读取。'],
	'invalid-input': ['The requested target or parameters are invalid.', '请求的目标或参数无效。'],
	'budget': ['The reading limit for this response was reached.', '已达本轮读取上限。'],
	'context-changed': ['The workspace, mode or conversation changed. Read again in the current context.', '工作区、模式或会话已变化，请在当前上下文重新读取。'],
	'page-changed': ['The page changed. Request its current version again.', '页面已变化，请重新读取当前版本。'],
	'page-closed': ['The page is closed. Open it again to read its contents.', '页面已关闭，请重新打开后读取。'],
	'record-changed': ['The run has new observations. Request its current revision again.', '运行记录已有新信息，请重新读取当前版本。'],
	'material-missing': ['The requested evidence is unavailable. Use other available material.', '所需证据已不可用，请使用其他现有材料。'],
	'protected': ['This target is outside the allowed access scope.', '该目标不在允许的访问范围内。'],
	'workspace-unavailable': ['A usable Beacon workspace is required for this material.', '读取该材料需要可用的 Beacon 工作区。'],
	'owner': ['This material or edit handle does not belong to the current conversation.', '该材料或编辑句柄不属于当前会话。'],
	'not-ready': ['The open page is loading or has no readable provider yet.', '打开的页面正在加载或暂时没有可读内容。'],
	'too-large': ['The material exceeds the reading capacity.', '材料超过可读取的容量。'],
	'busy': ['The Notebook is running or being edited. Wait for it to finish and retry.', '笔记正在运行或改写，请等待结束后重试。'],
	'conflict': ['The target changed or has unsaved edits in another window. Check it before retrying.', '目标已变化或其他窗口有未保存编辑，请检查后重试。'],
	'target-exists': ['The target already exists. Choose the intended existing Notebook or a new filename.', '目标已存在，请选择要修改的已有笔记或新的文件名。'],
	'backup-failed': ['The pre-edit backup failed. The rewrite did not start.', '改写前备份失败，未开始改写。'],
	'save-failed': ['The edits were applied but not saved. Check the native Notebook editor.', '修改已应用但未保存，请查看原生笔记编辑器。'],
	'release-failed': ['The operation could not finish releasing the Notebook. Cleanup will be attempted when the request ends.', '笔记操作未能完成释放，将在本轮请求结束时尝试清理。']
} as const;

export type ToolError = keyof typeof messages;
export function isToolError(value: unknown): value is ToolError { return typeof value === 'string' && Object.hasOwn(messages, value); }
export function toolErrorMessage(code: ToolError, zh: boolean): string { return messages[code][zh ? 1 : 0]; }

const nativeCodes: Record<string, ToolError> = {
	'beacon-context-changed': 'context-changed', 'beacon-record-changed': 'record-changed', 'beacon-record-evicted': 'material-missing',
	'beacon-page-closed': 'page-closed', 'beacon-page-changed': 'page-changed', 'beacon-page-provider-unavailable': 'not-ready', 'beacon-page-not-ready': 'not-ready',
	'beacon-protected-page': 'protected', 'beacon-conversation-owner': 'owner', 'beacon-workspace-unavailable': 'workspace-unavailable', 'beacon-material-missing': 'material-missing',
	'beacon-invalid-context-input': 'invalid-input', 'beacon-context-budget': 'budget', 'beacon-page-timeout': 'timeout', 'beacon-page-too-large': 'too-large',
	'notebook-write-denied': 'protected', 'notebook-outside-workspace': 'protected', 'notebook-owner': 'owner', 'notebook-closed': 'page-closed',
	'notebook-invalid-range': 'invalid-input', 'notebook-invalid-edit': 'invalid-input', 'notebook-invalid-target': 'invalid-input', 'notebook-invalid-type': 'invalid-input',
	'notebook-context-budget': 'budget', 'notebook-busy': 'busy', 'notebook-other-window-dirty': 'conflict', 'notebook-editor-roots-changed': 'context-changed',
	'notebook-parent-changed': 'conflict', 'notebook-target-exists': 'target-exists', 'notebook-backup-conflict': 'backup-failed', 'notebook-backup-parent-changed': 'backup-failed',
	'notebook-save-failed': 'save-failed', 'notebook-release-failed': 'release-failed',
	'files-disabled': 'protected', 'no-workspace': 'workspace-unavailable', 'beacon-assets': 'protected', 'not-supplied-file': 'protected',
	'invalid-file-path': 'invalid-input', 'workspace-folder-required': 'invalid-input', 'outside-workspace': 'protected', 'protected-file': 'protected',
	'file-changed': 'conflict', 'file-budget': 'budget', 'image-too-large': 'too-large', 'invalid-file-input': 'invalid-input', 'not-ordinary-file': 'invalid-input'
};

/** Recognize only exact owned codes; diagnostic suffixes never become visible feedback. */
export function toolErrorCode(value: unknown): ToolError {
	if (typeof value !== 'string') { return 'unavailable'; }
	const code = value.replace(/^Error: /, '').split(';', 1)[0];
	return Object.hasOwn(nativeCodes, code) ? nativeCodes[code] : isToolError(code) ? code : 'unavailable';
}
