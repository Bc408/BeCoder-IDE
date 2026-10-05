/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { normalizeBaseURL, providers, type ModelParameterName, type ProviderId } from '../src/connection';
import { resolveCapabilities, type CapabilityField, type ModelCapabilities, type ModelSettings } from '../src/models';
import { parameterPolicy, type ConfiguredModel, type SettingsCommand, type SettingsResult, type SettingsSnapshot } from '../src/modelConfiguration';
import { Icon } from './Icon';

const zh = document.documentElement.lang.startsWith('zh');
const t = (en: string, cn: string) => zh ? cn : en;
const capabilityName = (value: ModelCapabilities['purpose' | 'vision']) => ({ chat: t('Chat', '对话'), embedding: t('Embedding', '嵌入'), rerank: t('Reranking', '重排'), image: t('Image generation', '图像生成'), supported: t('Supported', '支持'), unsupported: t('Unsupported', '不支持'), unknown: t('Unknown', '未知') })[value];
const sourceName = (source: ModelCapabilities['source']) => ({ unknown: t('Unknown', '未知'), catalog: t('Built-in catalog', '内置目录'), service: t('Provider metadata', '服务商元数据'), manual: t('Manual correction', '手动校正') })[source];
export function capabilitySummary(capabilities: ModelCapabilities): string {
	const support = (value: string) => ({ supported: t('Supported', '支持'), unsupported: t('Unsupported', '不支持'), unknown: t('Unknown', '未知') } as Record<string, string>)[value];
	return [t('Vision', '视觉') + ': ' + support(capabilities.vision), t('Reasoning', '推理') + ': ' + support(capabilities.reasoning), t('Tools', '工具') + ': ' + support(capabilities.tools)].join(' · ');
}
type Run = (command: Omit<SettingsCommand, 'requestId' | 'provider' | 'revision'>, revision?: number) => Promise<boolean>;
function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange(value: boolean): void }) {
	return <button type="button" className="settings-switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
	return <label className="settings-field"><span>{label}</span>{Children.map(children, child => isValidElement(child) && (child.type === 'input' || child.type === 'select') ? cloneElement(child as ReactElement<{ 'aria-label': string }>, { 'aria-label': label }) : child)}</label>;
}
function Badges({ capabilities }: { capabilities: ModelCapabilities }) {
	return <span className="capability-badges">{(['vision', 'reasoning', 'tools'] as const).filter(field => capabilities[field] === 'supported').map(field => <span key={field} className={`capability-badge ${field}`} title={field === 'vision' ? t('Vision input', '视觉输入') : field === 'reasoning' ? t('Reasoning', '推理') : t('Tool calls', '工具调用')}><Icon name={field === 'vision' ? 'image' : field === 'reasoning' ? 'reasoning' : 'tools'} /></span>)}</span>;
}

function ConnectionForm({ provider, snapshot, run, dirtyChanged }: { provider: ProviderId; snapshot: SettingsSnapshot; run: Run; dirtyChanged(value: boolean): void }) {
	const saved = snapshot.providers[provider].baseURL;
	const [baseURL, setBaseURL] = useState(saved);
	const [key, setKey] = useState('');
	const [clearKey, setClearKey] = useState(false);
	const revision = useRef(snapshot.revision);
	const latestRevision = useRef(snapshot.revision); latestRevision.current = snapshot.revision;
	const dirty = baseURL !== saved || !!key || clearKey;
	const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
	useEffect(() => { dirtyChanged(dirty); }, [dirty, dirtyChanged]);
	useEffect(() => {
		if (!dirtyRef.current) { setBaseURL(saved); revision.current = snapshot.revision; }
	}, [saved, snapshot.revision]);
	const cancel = () => { setBaseURL(saved); setKey(''); setClearKey(false); revision.current = snapshot.revision; };
	return <form className="connection-form settings-card" onSubmit={async event => {
		event.preventDefault();
		if (await run({ type: 'saveConnection', baseURL, key, clearKey }, revision.current)) { setBaseURL(normalizeBaseURL(baseURL, provider)); setKey(''); setClearKey(false); revision.current = latestRevision.current; }
	}}>
		<h2>{t('Connection', '连接')}</h2>
		<Field label={t('API address', 'API 地址')}><input required type="url" value={baseURL} disabled={snapshot.pending} onChange={event => setBaseURL(event.target.value)} spellCheck={false} autoComplete="off" /></Field>
		<Field label="API Key"><input type="password" value={key} maxLength={4096} disabled={snapshot.pending || clearKey} onChange={event => setKey(event.target.value)} autoComplete="new-password" placeholder={snapshot.keyConfigured[provider] ? t('Saved securely · leave blank to keep', '已安全保存 · 留空保留') : provider === 'ollama' ? t('Optional for local Ollama', '本地 Ollama 可留空') : t('Enter a new API key', '输入新的 API 密钥')} /></Field>
		<div className="connection-hint"><span>{t('Keys are stored securely and are never displayed again.', '密钥安全保存，页面不会回显已保存的密钥。')}</span>{snapshot.keyConfigured[provider] && <label><input type="checkbox" checked={clearKey} disabled={snapshot.pending} onChange={event => { setClearKey(event.target.checked); setKey(''); }} />{t('Remove key', '移除密钥')}</label>}</div>
		<div className="settings-form-actions"><button type="button" disabled={snapshot.pending || !dirty} onClick={cancel}>{t('Cancel', '取消')}</button><button className="settings-primary" disabled={snapshot.pending || !dirty} type="submit">{t('Save connection', '保存连接')}</button></div>
	</form>;
}

function Parameter({ name, label, maximum, disabled, unsupported, draft, setDraft }: { name: ModelParameterName; label: string; maximum: number; disabled?: boolean; unsupported?: boolean; draft: ConfiguredModel; setDraft(value: ConfiguredModel): void }) {
	const value = draft.parameters[name];
	const enabled = value !== undefined;
	const minimum = name === 'maxOutputTokens' ? 1 : 0;
	const step = name === 'maxOutputTokens' ? 1 : 0.05;
	const change = (value: number | undefined) => { const parameters = { ...draft.parameters }; if (value === undefined) { delete parameters[name]; } else { parameters[name] = value; } setDraft({ ...draft, parameters }); };
	return <div className="parameter-row"><div className="parameter-heading"><label htmlFor={`parameter-${name}`}>{label}</label><span>{enabled ? value : t('Model default', '模型默认')}</span><Switch label={t(`Customize ${label}`, `自定义${label}`)} checked={enabled} disabled={disabled || (unsupported && !enabled)} onChange={checked => change(checked ? name === 'temperature' ? 1 : name === 'topP' ? 1 : Math.min(4096, maximum) : undefined)} /></div>
		{enabled && <div className="parameter-value">{name !== 'maxOutputTokens' && <input type="range" aria-label={label + t(' slider', '滑块')} disabled={disabled || unsupported} min={minimum} max={maximum} step={step} value={value} onChange={event => change(Number(event.target.value))} />}<input id={`parameter-${name}`} aria-label={label} type="number" required disabled={disabled || unsupported} min={minimum} max={maximum} step={step} value={Number.isNaN(value) ? '' : value} onChange={event => change(event.target.valueAsNumber)} /></div>}
	</div>;
}

function ModelForm({ provider, snapshot, model, run, close }: { provider: ProviderId; snapshot: SettingsSnapshot; model?: ConfiguredModel; run: Run; close(): void }) {
	const [draft, setDraft] = useState<ConfiguredModel>(() => structuredClone(model ?? { id: '', name: '', enabled: true, parameters: {}, settings: {} }));
	const [initialRevision] = useState(snapshot.revision);
	const capabilities = resolveCapabilities(provider, snapshot.providers[provider].baseURL, draft.id, draft.discovered, draft.settings);
	const automatic = resolveCapabilities(provider, snapshot.providers[provider].baseURL, draft.id, draft.discovered);
	const policy = parameterPolicy(provider, draft.id, capabilities, draft.settings);
	const pending = snapshot.pending;
	const setting = (settings: ModelSettings) => {
		const next = { ...draft, settings };
		const nextPolicy = parameterPolicy(provider, draft.id, resolveCapabilities(provider, snapshot.providers[provider].baseURL, draft.id, draft.discovered, settings), settings);
		if (!nextPolicy.sampling) { next.parameters = { ...draft.parameters }; delete next.parameters.temperature; delete next.parameters.topP; }
		if (!nextPolicy.thinking) { delete settings.thinking; delete settings.effort; }
		if (settings.thinking === 'disabled' || !nextPolicy.efforts.includes(settings.effort!)) { delete settings.effort; }
		setDraft(next);
	};
	const override = (field: CapabilityField, value: unknown) => {
		const overrides = { ...draft.settings.overrides };
		if (value === undefined) { delete overrides[field]; } else { Object.assign(overrides, { [field]: value }); }
		setting({ ...draft.settings, overrides });
	};
	return <form className="model-form settings-card" onSubmit={async event => { event.preventDefault(); if (await run({ type: 'saveModel', model: draft, originalId: model?.id }, initialRevision)) { close(); } }}>
		<div className="settings-section-title"><h2>{model ? t('Edit model', '编辑模型') : t('Add model', '添加模型')}</h2><button type="button" className="settings-icon" aria-label={t('Cancel editing', '取消编辑')} disabled={pending} onClick={close}><Icon name="close" /></button></div>
		<Field label={t('Model ID', '模型 ID')}><input autoFocus required maxLength={256} value={draft.id} disabled={pending} spellCheck={false} onChange={event => setDraft({ ...draft, id: event.target.value, name: draft.name === draft.id ? event.target.value : draft.name, discovered: undefined })} /></Field>
		<Field label={t('Display name', '显示名称')}><input required maxLength={120} value={draft.name} disabled={pending} onChange={event => setDraft({ ...draft, name: event.target.value })} /></Field>
		<div className="parameter-heading"><span>{t('Enabled', '启用')}</span><Switch checked={draft.enabled} disabled={pending} label={t('Enable model', '启用模型')} onChange={enabled => setDraft({ ...draft, enabled })} /></div>
		<h3>{t('Capabilities', '模型能力')}</h3><p className="settings-note">{t('Automatic values come from the built-in catalog or provider metadata. Correct only what you know.', '自动值来自内置目录或服务商元数据，请仅校正已确认的能力。')}</p>
		{(['purpose', 'vision', 'reasoning', 'tools'] as const).map(field => <Field key={field} label={{ purpose: t('Model type', '模型类型'), vision: t('Vision input', '视觉输入'), reasoning: t('Reasoning', '推理'), tools: t('Tool calls', '工具调用') }[field]}><select disabled={pending} value={draft.settings.overrides?.[field] ?? 'auto'} onChange={event => override(field, event.target.value === 'auto' ? undefined : event.target.value)}><option value="auto">{t('Automatic', '自动')} · {capabilityName(automatic[field])}</option>{(field === 'purpose' ? ['chat', 'embedding', 'rerank', 'image', 'unknown'] as const : ['supported', 'unsupported', 'unknown'] as const).map(value => <option key={value} value={value}>{capabilityName(value)}</option>)}</select><small>{sourceName(draft.settings.overrides?.[field] === undefined ? automatic.source : 'manual')}</small></Field>)}
		{(['contextWindow', 'maxOutputTokens'] as const).map(field => <Field key={field} label={field === 'contextWindow' ? t('Context window (tokens)', '上下文窗口（Token）') : t('Model output limit (tokens)', '模型输出上限（Token）')}><input type="number" min={1} max={10000000} step={1} disabled={pending} value={draft.settings.overrides?.[field] ?? ''} placeholder={String(automatic[field] ?? t('Automatic · unknown', '自动 · 未知'))} onChange={event => override(field, event.target.value === '' ? undefined : event.target.valueAsNumber)} /><small>{sourceName(draft.settings.overrides?.[field] === undefined ? automatic.source : 'manual')}</small></Field>)}
		<button type="button" className="settings-text-action" disabled={pending} onClick={() => setting({})}>{t('Restore automatic capabilities', '恢复自动能力')}</button>
		<h3>{t('Generation parameters', '生成参数')}</h3>
		{policy.thinking && <Field label={t('Thinking mode', '思考模式')}><select disabled={pending} value={draft.settings.thinking ?? 'default'} onChange={event => { const settings = { ...draft.settings }; if (event.target.value === 'default') { delete settings.thinking; } else { settings.thinking = event.target.value as ModelSettings['thinking']; } setting(settings); }}><option value="default">{t('Model default', '模型默认')}</option><option value="enabled">{t('Enabled', '开启')}</option>{!policy.fixedThinking && <option value="disabled">{t('Disabled', '关闭')}</option>}</select></Field>}
		{!!policy.efforts.length && draft.settings.thinking !== 'disabled' && <Field label={t('Reasoning effort', '推理强度')}><select disabled={pending} value={draft.settings.effort ?? 'default'} onChange={event => { const settings = { ...draft.settings }; if (event.target.value === 'default') { delete settings.effort; } else { settings.effort = event.target.value as ModelSettings['effort']; } setting(settings); }}><option value="default">{t('Model default', '模型默认')}</option>{policy.efforts.map(value => <option key={value} value={value}>{({ low: t('Low', '低'), high: t('High', '高'), max: t('Maximum', '最高') })[value]}</option>)}</select></Field>}
		{!policy.sampling && <p className="settings-note">{t('This thinking mode uses model-default sampling parameters.', '当前思考模式使用模型默认的采样参数。')}</p>}
		<Parameter name="temperature" label={t('Temperature', '温度')} maximum={2} disabled={pending} unsupported={!policy.sampling} draft={draft} setDraft={setDraft} />
		<Parameter name="topP" label="Top-P" maximum={1} disabled={pending} unsupported={!policy.sampling} draft={draft} setDraft={setDraft} />
		<Parameter name="maxOutputTokens" label={t('Response token budget', '本次回复 Token 预算')} maximum={policy.outputMaximum} disabled={pending} draft={draft} setDraft={setDraft} />
		<p className="settings-note">{t('Streaming is always enabled. Leaving a parameter at model default omits it from the request.', '始终使用流式输出。保留模型默认时，请求不携带该参数。')}</p>
		<div className="settings-form-actions"><button type="button" disabled={pending} onClick={close}>{t('Cancel', '取消')}</button><button type="submit" className="settings-primary" disabled={pending}>{t('Save model', '保存模型')}</button></div>
	</form>;
}

export function Settings({ post }: { post(message: unknown): void }) {
	const [snapshot, setSnapshot] = useState<SettingsSnapshot>();
	const [busy, setBusy] = useState(false);
	const [provider, setProvider] = useState<ProviderId>('deepseek');
	const [editing, setEditing] = useState<{ model?: ConfiguredModel }>();
	const [connectionDirty, setConnectionDirty] = useState(false);
	const [query, setQuery] = useState('');
	const [confirm, setConfirm] = useState<string>();
	const [result, setResult] = useState<{ ok: boolean; text: string }>();
	const [localPending, setLocalPending] = useState(false);
	const requests = useRef(new Map<number, (result: boolean) => void>());
	const counter = useRef(0);
	useEffect(() => {
		const listener = (event: MessageEvent) => {
			if (event.data?.type === 'settingsSnapshot') { setSnapshot(event.data.settings); setBusy(event.data.busy); }
			if (event.data?.type === 'settingsResult') {
				const value = event.data as SettingsResult;
				const callback = requests.current.get(value.requestId);
				if (!callback) { return; }
				requests.current.delete(value.requestId); setLocalPending(false);
				setResult({ ok: value.ok, text: value.ok ? t('Saved. Changes apply to the next response.', '已保存，修改将在下一轮回复中生效。') : value.error ?? t('Could not save. Your draft is preserved.', '无法保存，已保留草稿。') });
				callback(value.ok);
			}
		};
		window.addEventListener('message', listener); post({ type: 'ready' });
		const pending = requests.current;
		return () => { window.removeEventListener('message', listener); for (const callback of pending.values()) { callback(false); } pending.clear(); };
	}, [post]);
	if (!snapshot) { return <main className="settings-page"><p>{t('Loading settings…', '正在读取设置…')}</p></main>; }
	const state = { ...snapshot, pending: snapshot.pending || localPending };
	const run: Run = (command, revision = snapshot.revision) => {
		if (state.pending || requests.current.size) { return Promise.resolve(false); }
		const requestId = ++counter.current;
		setLocalPending(true); setResult(undefined);
		return new Promise(resolve => { requests.current.set(requestId, resolve); post({ ...command, provider, revision, requestId }); });
	};
	const profile = state.providers[provider];
	const locked = state.pending || connectionDirty || !!editing;
	return <main className="settings-page">
		<header className="settings-header"><div><h1>{t('Beacon Settings', 'Beacon 设置')}</h1><p>{t('Providers, models and generation parameters', '服务商、模型与生成参数')}</p></div><button className="settings-icon" aria-label={t('Open chat', '打开聊天')} onClick={() => post({ type: 'openChat' })}><Icon name="chat" /></button></header>
		<div className="settings-layout"><nav className="provider-list" aria-label={t('Providers', '服务商')}>{(Object.keys(providers) as ProviderId[]).map(id => <button key={id} aria-current={provider === id ? 'page' : undefined} disabled={locked} onClick={() => { setProvider(id); setQuery(''); setConfirm(undefined); setResult(undefined); }}><span className="provider-initial">{providers[id].name[0]}</span><span>{providers[id].name}<small>{state.providers[id].models.length} {t('models', '个模型')}</small></span><span className={`provider-status ${id === 'ollama' || state.keyConfigured[id] ? 'configured' : ''}`} /></button>)}</nav>
		<div className="settings-content"><div className="settings-provider-title"><h2>{providers[provider].name}</h2>{busy && <span>{t('A response is running · changes apply next time', '正在回复 · 修改下一轮生效')}</span>}</div>
		{state.error && <div className="settings-feedback failure" role="alert">{state.error}</div>}
		{result && <div className={`settings-feedback ${result.ok ? 'success' : 'failure'}`} role={result.ok ? 'status' : 'alert'}>{result.text}</div>}
		<ConnectionForm key={provider} provider={provider} snapshot={{ ...state, pending: state.pending || !!editing }} run={run} dirtyChanged={setConnectionDirty} />
		<div className={`models-layout ${editing ? 'with-editor' : ''}`}><section className="settings-card model-list"><div className="settings-section-title"><h2>{t('Models', '模型')}</h2><div><button type="button" disabled={locked} onClick={() => { void run({ type: 'fetchModels' }); }}>{t('Fetch models', '获取模型')}</button><button className="settings-icon" aria-label={t('Add model', '添加模型')} disabled={locked} onClick={() => { setEditing({}); setResult(undefined); }}><Icon name="plus" /></button></div></div>
		<input type="search" className="model-filter" value={query} onChange={event => setQuery(event.target.value)} aria-label={t('Search models', '搜索模型')} placeholder={t('Search models…', '搜索模型…')} />
		{!profile.models.length && <p className="settings-empty">{t('Save the connection, then fetch models or add one manually. No model is selected automatically.', '保存连接后获取模型，或手动添加。不会自动选择模型。')}</p>}
		{profile.models.filter(model => (model.name + ' ' + model.id).toLowerCase().includes(query.toLowerCase())).map(model => {
			const capabilities = resolveCapabilities(provider, profile.baseURL, model.id, model.discovered, model.settings);
			const selected = state.selection?.provider === provider && state.selection.model === model.id;
			const usable = model.enabled && ['chat', 'unknown'].includes(capabilities.purpose) && (provider === 'ollama' || state.keyConfigured[provider]);
			return <div className={`settings-model-row ${selected ? 'selected' : ''}`} key={model.id} onMouseLeave={() => setConfirm(undefined)}><button className="model-name" disabled={locked || !usable} onClick={() => { void run({ type: 'selectModel', id: model.id }); }} title={selected ? t('Current chat model', '当前聊天模型') : t('Use for chat', '用于聊天')}><strong>{model.name}{selected && <Icon name="check" />}</strong><small>{model.id}</small></button><Badges capabilities={capabilities} /><Switch checked={model.enabled} disabled={locked} label={t('Enable ', '启用 ') + model.name} onChange={enabled => { void run({ type: 'toggleModel', id: model.id, enabled }); }} /><button className="settings-icon" disabled={locked} aria-label={t('Edit ', '编辑 ') + model.name} onClick={() => { setEditing({ model }); setResult(undefined); }}><Icon name="settings" /></button><button className="settings-icon" disabled={locked} aria-label={(confirm === model.id ? t('Confirm removal of ', '确认移除 ') : t('Remove ', '移除 ')) + model.name} onClick={() => { if (confirm === model.id) { setConfirm(undefined); void run({ type: 'removeModel', id: model.id }); } else { setConfirm(model.id); } }}><Icon name={confirm === model.id ? 'check' : 'trash'} /></button></div>;
		})}</section>
		{editing && <ModelForm provider={provider} snapshot={state} model={editing.model} run={run} close={() => setEditing(undefined)} />}</div>
		</div></div>
	</main>;
}
