/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';
import { providers, type ConnectionState, type ModelParameterName } from '../src/connection';
import { Icon } from './Icon';

const zh = document.documentElement.lang.startsWith('zh');
const t = (en: string, cn: string) => zh ? cn : en;
export function providerName(id: string): string {
	return ({ deepseek: t('DeepSeek', '深度求索'), bailian: t('Alibaba Cloud Bailian', '阿里云百炼'), moonshot: t('Moonshot', '月之暗面'), ollama: 'Ollama' } as Record<string, string>)[id] ?? id;
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
	const updateParameter = (field: ModelParameterName, value: number | null) => post({ type: 'updateParameter', field, value, provider: connection.provider, model: connection.model });
	const models = [...new Set([connection.model, ...connection.models.map(model => model.id)])].filter(Boolean);
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
		<select className="model-select" aria-label={t('Chat model', '聊天模型')} value={connection.model} disabled={disabled} onChange={event => update('model', event.target.value)}><option value="">{t('Select a model', '选择模型')}</option>{models.map(model => <option key={model} value={model}>{model}</option>)}</select>
		<p className="configuration-hint">{t('Beacon supports text chat. Availability depends on your account and service. You can also enter a model ID in Settings.', 'Beacon 支持文本聊天，模型可用性以账户和服务为准。也可在设置中输入模型 ID。')}</p>
		<section className="model-parameters" aria-labelledby="model-parameters-title">
			<h2 id="model-parameters-title">{t('Model parameters', '模型参数')}</h2>
			<p className="configuration-hint">{connection.model ? t('Saved for this provider and model. Disabled parameters use the model default.', '按当前服务商和模型保存。未启用的参数跟随模型默认值。') : t('Select a model before customizing parameters.', '选择模型后可自定义参数。')}</p>
			<ParameterField name="temperature" label={t('Temperature', '模型温度')} hint={t('Higher values make responses more varied.', '数值越高，回答越多样。')} value={connection.parameters?.temperature} defaultValue={1} minimum={0} maximum={2} step={0.1} disabled={disabled || !connection.model} update={updateParameter} />
			<ParameterField name="topP" label="Top-P" hint={t('Controls probability-based token sampling.', '控制基于概率的 Token 采样范围。')} value={connection.parameters?.topP} defaultValue={1} minimum={0} maximum={1} step={0.05} disabled={disabled || !connection.model} update={updateParameter} />
			<ParameterField name="maxOutputTokens" label={t('Maximum output tokens', '最大输出 Token 数')} hint={t('Caps the length of one response.', '限制单次回答的最大长度。')} value={connection.parameters?.maxOutputTokens} defaultValue={8192} minimum={1} maximum={131072} step={1} disabled={disabled || !connection.model} update={updateParameter} />
			<div className="parameter-fixed"><span>{t('Streaming output', '流式输出')}</span><strong>{t('Enabled', '已开启')}</strong></div>
		</section>
		{connection.error && <p className="error" role="alert">{connection.error}</p>}
		{busy && <p role="status">{t('Stop the current response before changing the connection.', '请先停止当前回答，再修改连接。')}</p>}
		<button className="open-chat" disabled={!ready} onClick={() => post({ type: 'openChat' })}><Icon name="chat" />{t('Open chat', '打开聊天')}</button>
		<button className="settings-link" onClick={() => post({ type: 'openSettings' })}>{t('Open Beacon settings', '打开 Beacon 设置')}</button>
	</section></main>;
}
