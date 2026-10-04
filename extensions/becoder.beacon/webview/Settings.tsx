/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';
import { providers, type ConnectionState, type ModelParameterName } from '../src/connection';
import { Icon } from './Icon';
import { resolveCapabilities, type CapabilityField, type ModelCapabilities } from '../src/models';

const zh = document.documentElement.lang.startsWith('zh');
const t = (en: string, cn: string) => zh ? cn : en;
export function providerName(id: string): string {
	return ({ deepseek: t('DeepSeek', '深度求索'), bailian: t('Alibaba Cloud Bailian', '阿里云百炼'), moonshot: t('Moonshot', '月之暗面'), ollama: 'Ollama' } as Record<string, string>)[id] ?? id;
}

export function capabilitySummary(capabilities: ModelCapabilities): string {
	const label = (value: string) => value === 'supported' ? t('Supported', '支持') : value === 'unsupported' ? t('Unsupported', '不支持') : t('Unknown', '未知');
	return `${t('Vision', '视觉')}: ${label(capabilities.vision)} · ${t('Thinking', '推理')}: ${label(capabilities.reasoning)} · ${t('Tools', '工具')}: ${label(capabilities.tools)}`;
}

function CapabilitySettings({ connection, disabled, post }: { connection: ConnectionState; disabled: boolean; post: (message: unknown) => void }) {
	const settings = connection.modelSettings ?? {};
	const capabilities = connection.capabilities ?? resolveCapabilities(connection.provider, connection.baseURL, connection.model, undefined, settings);
	const update = (field: string, value: unknown) => post({ type: 'updateCapability', provider: connection.provider, baseURL: connection.baseURL, model: connection.model, field, value });
	const labels: Record<CapabilityField, string> = { purpose: t('Model type', '模型用途'), vision: t('Vision input', '视觉输入'), reasoning: t('Thinking', '推理'), tools: t('Tool calling', '工具调用'), contextWindow: t('Declared context window', '声明的上下文窗口'), maxOutputTokens: t('Maximum model output', '模型最大输出') };
	const source = ({ unknown: t('Unknown', '未知'), catalog: t('Built-in catalog', '内置目录'), service: t('Service metadata', '服务元数据'), manual: t('Manual override', '手动修正') })[capabilities.source];
	return <section className="model-capabilities" aria-labelledby="model-capabilities-title">
		<h2 id="model-capabilities-title">{t('Model capabilities', '模型能力')}</h2>
		<p className="configuration-hint">{t('Source', '来源')}：{source}。{t('Overrides are saved for this provider, endpoint and model.', '修正按服务商、接口地址和模型保存。')}</p>
		<div className="capability-badges" aria-label={t('Current model capabilities', '当前模型能力')}>{(['vision', 'reasoning', 'tools'] as const).map(field => <span key={field} data-support={capabilities[field]}>{labels[field]} · {capabilities[field] === 'supported' ? t('Supported', '支持') : capabilities[field] === 'unsupported' ? t('Unsupported', '不支持') : t('Unknown', '未知')}</span>)}</div>
		{(['purpose', 'vision', 'reasoning', 'tools'] as const).map(field => <label className="connection-field" key={field}>{labels[field]}<select disabled={disabled} value={settings.overrides?.[field] ?? ''} onChange={event => update(field, event.target.value || null)}>
			<option value="">{t('Automatic', '自动识别')} · {field === 'purpose' ? ({ chat: t('Chat', '聊天'), embedding: t('Embedding', '嵌入'), rerank: t('Reranking', '重排'), image: t('Image generation', '图像生成'), unknown: t('Unknown', '未知') })[capabilities.purpose] : capabilities[field] === 'supported' ? t('Supported', '支持') : capabilities[field] === 'unsupported' ? t('Unsupported', '不支持') : t('Unknown', '未知')}</option>
			{field === 'purpose' ? <><option value="chat">{t('Chat', '聊天')}</option><option value="embedding">{t('Embedding', '嵌入')}</option><option value="rerank">{t('Reranking', '重排')}</option><option value="image">{t('Image generation', '图像生成')}</option><option value="unknown">{t('Unknown', '未知')}</option></> : <><option value="supported">{t('Supported', '支持')}</option><option value="unsupported">{t('Unsupported', '不支持')}</option><option value="unknown">{t('Unknown', '未知')}</option></>}
		</select></label>)}
		{(['contextWindow', 'maxOutputTokens'] as const).map(field => <label className="connection-field" key={`${connection.provider}:${connection.baseURL}:${connection.model}:${field}:${settings.overrides?.[field]}`}>{labels[field]}<input type="number" min={1} max={10000000} step={1} disabled={disabled} defaultValue={settings.overrides?.[field] ?? ''} placeholder={capabilities[field]?.toString() ?? t('Unknown', '未知')} onBlur={event => { if (event.currentTarget.checkValidity()) { update(field, event.currentTarget.value ? Number(event.currentTarget.value) : null); } }} /></label>)}
		<p className="configuration-hint">{t('Context windows are declared model limits; Ollama runtime settings may be smaller. This does not change runtime settings or truncate history.', '上下文窗口为模型声明上限；Ollama 实际运行窗口可能更小。这里不会修改运行设置或截断历史。')}</p>
		<label className="connection-field">{t('Thinking mode', '思考模式')}<select value={settings.thinking ?? ''} disabled={disabled || capabilities.reasoning !== 'supported' || /-(thinking|instruct)($|-)/.test(connection.model)} onChange={event => update('thinking', event.target.value || null)}><option value="">{t('Model default', '模型默认')}</option><option value="enabled">{t('Enabled', '开启')}</option><option value="disabled">{t('Disabled', '关闭')}</option></select></label>
		{connection.provider === 'deepseek' && /^deepseek-(flash|pro|v4)/.test(connection.model) && capabilities.reasoning === 'supported' && <label className="connection-field">{t('Thinking effort', '思考强度')}<select value={settings.effort ?? ''} disabled={disabled || settings.thinking === 'disabled'} onChange={event => update('effort', event.target.value || null)}><option value="">{t('Model default', '模型默认')}</option><option value="low">{t('Low', '低')}</option><option value="high">{t('High', '高')}</option><option value="max">{t('Maximum', '最高')}</option></select></label>}
		{capabilities.tools !== 'supported' && <p className="configuration-hint">{t('File tools require confirmed tool support, even when file permission is enabled.', '即使开启文件权限，也只有确认支持工具调用后才提供文件工具。')}</p>}
		<button className="connection-secondary" disabled={disabled || !Object.keys(settings).length} onClick={() => update('reset', null)}>{t('Restore model defaults', '恢复模型默认')}</button>
	</section>;
}

function ParameterField({ name, label, hint, value, defaultValue, minimum, maximum, step, disabled, update }: { name: ModelParameterName; label: string; hint: string; value?: number; defaultValue: number; minimum: number; maximum: number; step: number; disabled: boolean; update: (name: ModelParameterName, value: number | null) => void }) {
	const [draft, setDraft] = useState(value?.toString() ?? '');
	useEffect(() => setDraft(value?.toString() ?? ''), [value]);
	const enabled = value !== undefined;
	const commit = (input: HTMLInputElement) => {
		if (!input.checkValidity()) { return; }
		const next = Number(input.value);
		if (next !== value) { update(name, next); }
	};
	return <div className="parameter-field">
		<div className="parameter-heading"><label htmlFor={`parameter-${name}`}>{label}</label><label className="parameter-toggle"><input type="checkbox" role="switch" checked={enabled} disabled={disabled} aria-label={t(`Customize ${label}`, `自定义${label}`)} onChange={event => update(name, event.target.checked ? defaultValue : null)} /><span>{enabled ? t('Custom', '自定义') : t('Model default', '模型默认')}</span></label></div>
		{enabled && <input id={`parameter-${name}`} className="parameter-input" type="number" min={minimum} max={maximum} step={step} value={draft} disabled={disabled} aria-describedby={`parameter-${name}-hint`} onChange={event => setDraft(event.target.value)} onBlur={event => commit(event.currentTarget)} onKeyDown={event => { if (event.key === 'Enter') { event.currentTarget.blur(); } }} />}
		<p id={`parameter-${name}-hint`} className="configuration-hint">{hint}</p>
	</div>;
}

export function Settings({ connection, ready, busy, post }: { connection: ConnectionState; ready: boolean; busy: boolean; post: (message: unknown) => void }) {
	const [address, setAddress] = useState(connection.baseURL);
	useEffect(() => setAddress(connection.baseURL), [connection.provider, connection.baseURL]);
	const disabled = !ready || busy || connection.loading;
	const update = (field: string, value: string) => post({ type: 'updateConnection', field, value, provider: connection.provider });
	const updateParameter = (field: ModelParameterName, value: number | null) => post({ type: 'updateParameter', field, value, provider: connection.provider, baseURL: connection.baseURL, model: connection.model });
	const models = [...new Set([connection.model, ...connection.models.map(model => model.id)])].filter(Boolean);
	const capabilities = connection.capabilities ?? resolveCapabilities(connection.provider, connection.baseURL, connection.model, undefined, connection.modelSettings);
	const thinking = capabilities.reasoning === 'supported' && (connection.modelSettings?.thinking === 'enabled' || (connection.modelSettings?.thinking !== 'disabled' && connection.provider === 'deepseek' && /^deepseek-(flash|pro|v4|reasoner)/.test(connection.model)));
	return <main className="configuration"><section className="configuration-content">
		<h1>{t('Connect Beacon', '连接 Beacon')}</h1>
		<p>{t('Choose a provider and model to start a conversation.', '选择服务商和模型，开始你的对话。')}</p>
		<label className="connection-field">{t('Provider', '服务商')}<select value={connection.provider} disabled={disabled} onChange={event => update('provider', event.target.value)}>{Object.keys(providers).map(id => <option value={id} key={id}>{providerName(id)}</option>)}</select></label>
		<label className="connection-field">{t('API base URL', 'API 基础地址')}<input type="url" value={address} disabled={disabled} spellCheck={false} onChange={event => setAddress(event.target.value)} /></label>
		<button className="connection-secondary" disabled={disabled || address === connection.baseURL} onClick={() => update('baseURL', address)}>{t('Save address', '保存地址')}</button>
		<p className="configuration-hint">{connection.provider === 'ollama' ? t('Start your Ollama service and install a chat model first. A local service does not require an API key.', '请先启动 Ollama 服务并安装聊天模型。本机服务无需 API Key。') : t('Use the endpoint for the same region as your API key. Do not include /chat/completions.', '请使用密钥所在地域的地址，不含 /chat/completions。')}</p>
		<div className="key-status" role="status">{!ready ? t('Loading…', '正在加载…') : connection.keyConfigured ? t('API key saved', 'API Key 已保存') : connection.provider === 'ollama' ? t('API key optional', 'API Key 可选') : t('No API key configured', '尚未配置 API Key')}</div>
		<button className="setup-key" disabled={disabled} onClick={() => post({ type: 'configure' })}>{connection.keyConfigured ? t('Update API Key', '更新 API Key') : t('Configure API Key', '配置 API Key')}</button>
		<p className="configuration-hint">{t('Stored securely for this provider. Leave the key input empty to remove it.', '按服务商安全保存，配置时留空可移除密钥。')}</p>
		<div className="model-heading"><span>{t('Chat model', '聊天模型')}</span><button disabled={disabled || address !== connection.baseURL || (connection.provider !== 'ollama' && !connection.keyConfigured)} onClick={() => post({ type: 'fetchModels' })}>{connection.loading ? t('Loading…', '正在加载…') : t('Fetch models', '获取模型')}</button></div>
		<select className="model-select" aria-label={t('Chat model', '聊天模型')} value={connection.model} disabled={disabled} onChange={event => update('model', event.target.value)}><option value="">{t('Select a model', '选择模型')}</option>{models.map(model => {
			const details = resolveCapabilities(connection.provider, connection.baseURL, model, connection.models.find(item => item.id === model)?.capabilities, model === connection.model ? connection.modelSettings : undefined);
			const nonChat = !['chat', 'unknown'].includes(details.purpose);
			return <option key={model} value={model} disabled={nonChat}>{model}{nonChat ? t(' · Non-chat model', ' · 非聊天模型') : details.purpose === 'unknown' ? t(' · Unknown capabilities', ' · 能力未知') : ''}</option>;
		})}</select>
		<p className="configuration-hint">{t('Availability depends on your account and service. Unknown models allow text chat; confirm capabilities before using tools or images.', '可用性以账户和服务为准。未知模型可尝试文本聊天；使用工具或图片前需确认能力。')}</p>
		{connection.model && <CapabilitySettings connection={connection} disabled={disabled} post={post} />}
		<section className="model-parameters" aria-labelledby="model-parameters-title">
			<h2 id="model-parameters-title">{t('Model parameters', '模型参数')}</h2>
			<p className="configuration-hint">{connection.model ? t('Saved for this provider, endpoint and model. Disabled parameters use the model default.', '按当前服务商、接口地址和模型保存。未启用的参数跟随模型默认值。') : t('Select a model before customizing parameters.', '选择模型后可自定义参数。')}</p>
			<ParameterField name="temperature" label={t('Temperature', '模型温度')} hint={thinking && connection.provider === 'deepseek' ? t('Ignored by DeepSeek while thinking is enabled.', 'DeepSeek 开启思考时忽略温度。') : t('Higher values make responses more varied.', '数值越高，回答越多样。')} value={connection.parameters?.temperature} defaultValue={1} minimum={0} maximum={2} step={0.1} disabled={disabled || !connection.model || (thinking && connection.provider === 'deepseek')} update={updateParameter} />
			<ParameterField name="topP" label="Top-P" hint={thinking && connection.provider === 'deepseek' ? t('Managed by the DeepSeek adapter in thinking mode.', '思考模式下由 DeepSeek 适配器处理。') : t('Controls probability-based token sampling.', '控制基于概率的 Token 采样范围。')} value={connection.parameters?.topP} defaultValue={1} minimum={0} maximum={1} step={0.05} disabled={disabled || !connection.model || (thinking && connection.provider === 'deepseek')} update={updateParameter} />
			<ParameterField name="maxOutputTokens" label={t('Maximum output tokens', '最大输出 Token 数')} hint={t('Caps the length of one response.', '限制单次回答的最大长度。')} value={connection.parameters?.maxOutputTokens} defaultValue={Math.min(8192, capabilities.maxOutputTokens ?? 131072)} minimum={1} maximum={Math.min(capabilities.maxOutputTokens ?? 131072, 131072)} step={1} disabled={disabled || !connection.model} update={updateParameter} />
			<div className="parameter-fixed"><span>{t('Streaming output', '流式输出')}</span><strong>{t('Enabled', '已开启')}</strong></div>
		</section>
		{connection.error && <p className="error" role="alert">{connection.error}</p>}
		{busy && <p role="status">{t('Stop the current response before changing the connection.', '请先停止当前回答，再修改连接。')}</p>}
		<button className="open-chat" disabled={!ready} onClick={() => post({ type: 'openChat' })}><Icon name="chat" />{t('Open chat', '打开聊天')}</button>
		<button className="settings-link" onClick={() => post({ type: 'openSettings' })}>{t('Open Beacon settings', '打开 Beacon 设置')}</button>
	</section></main>;
}
