/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { normalizeBaseURL, type ModelParameterName, type ProviderId } from '../src/connection';
import { resolveCapabilities, type CapabilityField, type ModelCapabilities, type ModelSettings } from '../src/models';
import { modelParameterIssues, parameterPolicy, type ConfiguredModel, type SettingsCommand, type SettingsResult, type SettingsSnapshot } from '../src/modelConfiguration';
import { ModelDiscoveryDialog, SettingsDialog } from './SettingsDialogs';
import deepseekLogo from '../resources/deepseek.svg';
import { Icon } from './Icon';

const zh = document.documentElement.lang.startsWith('zh');
const t = (en: string, cn: string) => zh ? cn : en;
const capabilityName = (value: ModelCapabilities['purpose' | 'vision']) => ({ chat: t('Chat', '对话'), embedding: t('Embedding', '嵌入'), rerank: t('Reranking', '重排'), image: t('Image generation', '图像生成'), supported: t('Supported', '支持'), unsupported: t('Unsupported', '不支持'), unknown: t('Unknown', '未知') })[value];
const sourceName = (source: ModelCapabilities['source']) => ({ unknown: t('Unknown', '未知'), catalog: t('Unknown', '未知'), service: t('Provider metadata', '服务商元数据'), manual: t('Manual correction', '手动校正') })[source];
export function capabilitySummary(capabilities: ModelCapabilities): string {
	const support = (value: string) => ({ supported: t('Supported', '支持'), unsupported: t('Unsupported', '不支持'), unknown: t('Unknown', '未知') } as Record<string, string>)[value];
	return [t('Vision', '视觉') + ': ' + support(capabilities.vision), t('Reasoning', '推理') + ': ' + support(capabilities.reasoning), t('Tools', '工具') + ': ' + support(capabilities.tools)].join(' · ');
}
type Run = (command: Omit<SettingsCommand, 'requestId' | 'provider' | 'revision'>, revision?: number) => Promise<boolean>;
function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange(value: boolean): void }) {
	return <button type="button" className="settings-switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
	return <label className="settings-field"><span>{label}</span><span className="settings-field-control">{Children.map(children, child => isValidElement(child) && (child.type === 'input' || child.type === 'select') ? cloneElement(child as ReactElement<{ 'aria-label': string }>, { 'aria-label': label }) : child)}</span></label>;
}
function ModelCapabilityIcons({ capabilities }: { capabilities: ModelCapabilities }) {
	return <span className="settings-model-capabilities">{(['vision', 'reasoning', 'tools'] as const).filter(field => capabilities[field] !== 'unsupported').map(field => {
		const label = ({ vision: t('Vision input', '视觉输入'), reasoning: t('Reasoning', '推理'), tools: t('Tool calls', '工具调用') })[field] + ': ' + capabilityName(capabilities[field]);
		return <span key={field} className={'settings-capability ' + field + (capabilities[field] === 'unknown' ? ' unknown' : '')} aria-label={label} data-becoder-tooltip={label}><Icon name={field === 'vision' ? 'eye' : field === 'reasoning' ? 'reasoning' : 'tools'} />{capabilities[field] === 'unknown' && <small>?</small>}</span>;
	})}</span>;
}

function ConnectionForm({ provider, snapshot, run, dirtyChanged, post, enabled, toggle, test, testDisabled }: { provider: ProviderId; snapshot: SettingsSnapshot; run: Run; dirtyChanged(value: boolean): void; post(message: unknown): void; enabled: boolean; toggle(value: boolean): void; test(): void; testDisabled: boolean }) {
	const saved = snapshot.providers[provider].baseURL;
	const [baseURL, setBaseURL] = useState(saved);
	const [key, setKey] = useState('');
	const [editingKey, setEditingKey] = useState(false);
	const [keyChanged, setKeyChanged] = useState(false);
	const [shown, setShown] = useState(false);
	const [clearKey, setClearKey] = useState(false);
	const [keyError, setKeyError] = useState('');
	const revision = useRef(snapshot.revision);
	const latestRevision = useRef(snapshot.revision); latestRevision.current = snapshot.revision;
	const keyRequest = useRef<{ id: number; revision: number; edit: boolean } | undefined>(undefined);
	const requestCounter = useRef(0);
	const keyInput = useRef<HTMLInputElement>(null);
	const dirty = baseURL !== saved || keyChanged || clearKey;
	const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
	const clearTransient = () => { setKey(''); setShown(false); setEditingKey(false); keyRequest.current = undefined; };
	const clearTransientRef = useRef(clearTransient); clearTransientRef.current = clearTransient;
	useEffect(() => { dirtyChanged(dirty); }, [dirty, dirtyChanged]);
	useEffect(() => {
		if (!dirtyRef.current) { setBaseURL(saved); revision.current = snapshot.revision; clearTransientRef.current(); }
	}, [saved, snapshot.revision]);
	useEffect(() => {
		const listener = (event: MessageEvent) => {
			const input = event.data;
			const pending = keyRequest.current;
			if (input?.type !== 'connectionKey' || !pending || pending.id !== input.requestId || pending.revision !== input.revision || latestRevision.current !== input.revision) { return; }
			keyRequest.current = undefined;
			if (input.error) { setKeyError(input.error); return; }
			if (typeof input.key !== 'string') { return; }
			setKey(input.key); setShown(!pending.edit); setEditingKey(pending.edit); setKeyError('');
			if (pending.edit) { requestAnimationFrame(() => { keyInput.current?.focus(); keyInput.current?.select(); }); }
		};
		const visibility = () => { if (document.hidden) { clearTransientRef.current(); setKeyChanged(false); setClearKey(false); } };
		window.addEventListener('message', listener); document.addEventListener('visibilitychange', visibility);
		return () => { keyRequest.current = undefined; window.removeEventListener('message', listener); document.removeEventListener('visibilitychange', visibility); };
	}, []);
	const access = (action: 'copy' | 'reveal', edit = false) => {
		if (action === 'copy' && (editingKey || shown)) { void navigator.clipboard.writeText(key).catch(() => setKeyError(t('Could not copy the key.', '无法复制密钥。'))); return; }
		if (action === 'reveal' && (editingKey || shown)) { if (!edit && shown && !editingKey) { clearTransient(); return; } setEditingKey(edit || editingKey); setShown(edit ? false : !shown); if (edit) { keyInput.current?.focus(); } return; }
		if (!snapshot.keyConfigured[provider] || clearKey) { if (edit) { setEditingKey(true); setKey(''); requestAnimationFrame(() => keyInput.current?.focus()); } return; }
		const id = ++requestCounter.current;
		keyRequest.current = { id, revision: snapshot.revision, edit };
		post({ type: 'connectionKey', requestId: id, revision: snapshot.revision, action });
	};
	const cancel = () => { setBaseURL(saved); clearTransient(); setKeyChanged(false); setClearKey(false); setKeyError(''); revision.current = snapshot.revision; };
	const keyAvailable = !clearKey && (!!key || !!snapshot.keyConfigured[provider]);
	return <form className="connection-form settings-card settings-connection" onSubmit={async event => {
		event.preventDefault();
		if (await run({ type: 'saveConnection', baseURL, ...(keyChanged ? { key } : {}), clearKey }, revision.current)) { setBaseURL(normalizeBaseURL(baseURL, provider)); clearTransient(); setKeyChanged(false); setClearKey(false); revision.current = latestRevision.current; }
	}}>
		<div className="settings-row"><span className="settings-row-title">{t('Enable provider', '启用服务商')}</span><div className="settings-row-control"><Switch checked={enabled} disabled={snapshot.pending || dirty} label={t('Enable DeepSeek', '启用 DeepSeek')} onChange={toggle} /></div></div>
		<div className="settings-row"><label className="settings-row-title" htmlFor="connection-address">{t('API address', 'API 地址')}</label><div className="settings-row-control"><input id="connection-address" aria-label={t('API address', 'API 地址')} required type="url" value={baseURL} disabled={snapshot.pending} onChange={event => setBaseURL(event.target.value)} spellCheck={false} autoComplete="off" /></div></div>
		<div className="settings-row"><label className="settings-row-title" htmlFor="connection-key">{t('API key', 'API 密钥')}</label><div className="settings-row-control key-test-line"><div className="connection-key-field"><input ref={keyInput} id="connection-key" aria-label={t('API key', 'API 密钥')} type={shown ? 'text' : 'password'} readOnly={!editingKey} value={editingKey || shown ? key : keyAvailable ? '••••••••' : ''} maxLength={4096} disabled={snapshot.pending} onChange={event => { setKey(event.target.value); setKeyChanged(true); setClearKey(false); }} autoComplete="new-password" placeholder={t('Enter an API key', '输入 API 密钥')} />
		<div className="connection-key-actions">{([{ action: 'copy', icon: 'copy', label: t('Copy key', '复制密钥') }, { action: 'edit', icon: 'edit', label: t('Edit key', '编辑密钥') }, { action: 'delete', icon: 'trash', label: t('Delete key', '删除密钥') }, { action: 'show', icon: 'eye', label: shown ? t('Hide key', '隐藏密钥') : t('Show key', '显示密钥') }] as const).map(item => <button type="button" key={item.action} className="settings-icon" aria-label={item.label} data-key-action={item.action} data-becoder-tooltip={item.label} disabled={snapshot.pending || ((item.action === 'copy' || item.action === 'show' || item.action === 'delete') && !keyAvailable)} onClick={() => { if (item.action === 'delete') { clearTransient(); setClearKey(true); setKeyChanged(false); } else { access(item.action === 'copy' ? 'copy' : 'reveal', item.action === 'edit'); } }}><Icon name={item.icon} /></button>)}</div></div>
		<button type="button" className="connection-test" aria-busy={snapshot.providerTest?.running || undefined} disabled={testDisabled || dirty} data-becoder-tooltip={t('Test all ' + snapshot.providers[provider].models.length + ' added models. May use credits; checks default text generation only.', '测试全部 ' + snapshot.providers[provider].models.length + ' 个已添加模型，可能消耗少量额度，仅检查默认参数下的文本连通性。')} onClick={test}>{snapshot.providerTest?.running ? t('Testing…', '测试中…') : t('Test', '测试')}</button></div></div>
		{keyError && <p role="alert" className="settings-warning">{keyError}</p>}
		{dirty && <div className="settings-form-actions"><button type="button" disabled={snapshot.pending} onClick={cancel}>{t('Cancel', '取消')}</button><button className="settings-primary" disabled={snapshot.pending} type="submit">{snapshot.pending ? t('Saving…', '保存中…') : t('Save connection', '保存连接')}</button></div>}
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
	const issues = modelParameterIssues(provider, snapshot.providers[provider].baseURL, draft);
	const setting = (settings: ModelSettings) => setDraft({ ...draft, settings });
	const override = (field: CapabilityField, value: unknown) => {
		const overrides = { ...draft.settings.overrides };
		if (value === undefined) { delete overrides[field]; } else { Object.assign(overrides, { [field]: value }); }
		setting({ ...draft.settings, overrides });
	};
	return <form className="model-form settings-card" onSubmit={async event => { event.preventDefault(); if (await run({ type: 'saveModel', model: draft, originalId: model?.id }, initialRevision)) { close(); } }}>
		<div className="settings-section-title"><h2>{model ? t('Edit model', '编辑模型') : t('Add model', '添加模型')}</h2><button type="button" className="settings-icon" aria-label={t('Cancel editing', '取消编辑')} disabled={pending} onClick={close}><Icon name="close" /></button></div>
		<div className="model-form-body"><section className="model-identity">
		<Field label={t('Model ID', '模型 ID')}><input readOnly required maxLength={256} value={draft.id} disabled={pending} spellCheck={false} onChange={event => setDraft({ ...draft, id: event.target.value, name: draft.name === draft.id ? event.target.value : draft.name, discovered: undefined })} /></Field>
		<Field label={t('Display name', '显示名称')}><input required maxLength={120} value={draft.name} disabled={pending} onChange={event => setDraft({ ...draft, name: event.target.value })} /></Field>
		</section><section className="model-capability-section"><h3>{t('Capabilities', '模型能力')}</h3>
		<dl className="capability-overview" aria-label={capabilitySummary(capabilities)}>{(['vision', 'reasoning', 'tools'] as const).map(field => <div key={field}><dt><Icon name={field === 'vision' ? 'eye' : field === 'reasoning' ? 'reasoning' : 'tools'} />{({ vision: t('Vision input', '视觉输入'), reasoning: t('Reasoning', '推理'), tools: t('Tool calls', '工具调用') })[field]}</dt><dd>{capabilityName(capabilities[field])}</dd></div>)}</dl>
		<details><summary>{t('Manually correct capabilities', '手动修正能力')}</summary><p className="settings-note">{t('Only correct confirmed capabilities. A confirmed refresh replaces these corrections.', '仅修正已确认的能力。重新获取并确认后覆盖这些修正。')}</p>
		{(['purpose', 'vision', 'reasoning', 'tools'] as const).map(field => <Field key={field} label={{ purpose: t('Model type', '模型类型'), vision: t('Vision input', '视觉输入'), reasoning: t('Reasoning', '推理'), tools: t('Tool calls', '工具调用') }[field]}><select disabled={pending} value={draft.settings.overrides?.[field] ?? 'auto'} onChange={event => override(field, event.target.value === 'auto' ? undefined : event.target.value)}><option value="auto">{t('Automatic', '自动')} · {capabilityName(automatic[field])}</option>{(field === 'purpose' ? ['chat', 'embedding', 'rerank', 'image', 'unknown'] as const : ['supported', 'unsupported', 'unknown'] as const).map(value => <option key={value} value={value}>{capabilityName(value)}</option>)}</select><small>{sourceName(draft.settings.overrides?.[field] === undefined ? automatic.source : 'manual')}</small></Field>)}
		{(['contextWindow', 'maxOutputTokens'] as const).map(field => <Field key={field} label={field === 'contextWindow' ? t('Context window (tokens)', '上下文窗口（Token）') : t('Model output limit (tokens)', '模型输出上限（Token）')}><input type="number" min={1} max={10000000} step={1} disabled={pending} value={draft.settings.overrides?.[field] ?? ''} placeholder={String(automatic[field] ?? t('Automatic · unknown', '自动 · 未知'))} onChange={event => override(field, event.target.value === '' ? undefined : event.target.valueAsNumber)} /><small>{sourceName(draft.settings.overrides?.[field] === undefined ? automatic.source : 'manual')}</small></Field>)}
		<button type="button" className="settings-text-action" disabled={pending} onClick={() => { const settings = { ...draft.settings }; delete settings.overrides; setting(settings); }}>{t('Restore automatic capabilities', '恢复自动能力')}</button>
		</details></section><section className="model-parameter-section"><h3>{t('Generation parameters', '生成参数')}</h3>
		{(policy.thinking || draft.settings.thinking) && <Field label={t('Thinking mode', '思考模式')}><select disabled={pending} value={draft.settings.thinking ?? 'default'} onChange={event => { const settings = { ...draft.settings }; if (event.target.value === 'default') { delete settings.thinking; } else { settings.thinking = event.target.value as ModelSettings['thinking']; } setting(settings); }}><option value="default">{t('Model default', '模型默认')}</option><option value="enabled">{t('Enabled', '开启')}</option>{!policy.fixedThinking && <option value="disabled">{t('Disabled', '关闭')}</option>}</select></Field>}
		{(!!policy.efforts.length || !!draft.settings.effort) && <Field label={t('Reasoning effort', '推理强度')}><select disabled={pending} value={draft.settings.effort ?? 'default'} onChange={event => { const settings = { ...draft.settings }; if (event.target.value === 'default') { delete settings.effort; } else { settings.effort = event.target.value as ModelSettings['effort']; } setting(settings); }}><option value="default">{t('Model default', '模型默认')}</option>{draft.settings.effort && !policy.efforts.includes(draft.settings.effort) && <option value={draft.settings.effort}>{draft.settings.effort + t(' (not supported)', '（不支持）')}</option>}{policy.efforts.map(value => <option key={value} value={value}>{({ low: t('Low', '低'), high: t('High', '高'), max: t('Maximum', '最高') })[value]}</option>)}</select></Field>}
		{!policy.sampling && <p className="settings-note">{t('This thinking mode uses model-default sampling parameters.', '当前思考模式使用模型默认的采样参数。')}</p>}
		<Parameter name="temperature" label={t('Temperature', '温度')} maximum={2} disabled={pending} unsupported={!policy.sampling} draft={draft} setDraft={setDraft} />
		<Parameter name="topP" label="Top-P" maximum={1} disabled={pending} unsupported={!policy.sampling} draft={draft} setDraft={setDraft} />
		<Parameter name="maxOutputTokens" label={t('Response token budget', '本次回复 Token 预算')} maximum={policy.outputMaximum} disabled={pending} draft={draft} setDraft={setDraft} />
		{issues.length > 0 && <p className="settings-warning" role="alert">{t('Adjust conflicting parameters: ', '请调整冲突参数：') + issues.map(issue => issue.field).join(', ')}</p>}
		<p className="settings-note">{t('Streaming is always enabled. Leaving a parameter at model default omits it from the request.', '始终使用流式输出。保留模型默认时，请求不携带该参数。')}</p>
		</section></div>
		<div className="settings-form-actions"><button type="button" disabled={pending} onClick={close}>{t('Cancel', '取消')}</button><button type="submit" className="settings-primary" disabled={pending || !!issues.length}>{pending ? t('Saving…', '保存中…') : t('Save model', '保存模型')}</button></div>
	</form>;
}

export function Settings({ post }: { post(message: unknown): void }) {
	const [snapshot, setSnapshot] = useState<SettingsSnapshot>();
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<ConfiguredModel>();
	const [modelsOpen, setModelsOpen] = useState(true);
	const [discovering, setDiscovering] = useState(false);
	const [connectionDirty, setConnectionDirty] = useState(false);
	const [result, setResult] = useState<{ ok: boolean; text: string }>();
	const [localPending, setLocalPending] = useState(false);
	const counter = useRef(0);
	const requests = useRef(new Map<number, { type: string; done(ok: boolean): void }>());
	const lastCandidate = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (snapshot?.discovery) { lastCandidate.current = snapshot.discovery.id; }
		else if (discovering && lastCandidate.current && !snapshot?.pending && !localPending) {
			lastCandidate.current = undefined; setDiscovering(false);
			setResult({ ok: false, text: t('Settings changed. Fetch models again.', '设置已改变，请重新获取模型。') });
		}
	}, [snapshot?.discovery, snapshot?.pending, discovering, localPending]);
	useEffect(() => {
		const listener = (event: MessageEvent) => {
			if (event.data?.type === 'settingsSnapshot') { setSnapshot(event.data.settings); setBusy(event.data.busy); }
			if (event.data?.type !== 'settingsResult') { return; }
			const value = event.data as SettingsResult;
			const request = requests.current.get(value.requestId);
			if (!request) { return; }
			requests.current.delete(value.requestId); setLocalPending(false);
			setResult({ ok: value.ok, text: value.ok ? request.type === 'fetchModels' ? t('Choose models, then confirm.', '请选择模型后确认。') : request.type === 'testProvider' ? t('Connection tests finished.', '连接测试已结束。') : t('Saved. Changes apply to the next response.', '已保存，修改将在下一轮回复中生效。') : value.error ?? t('Operation failed. Your draft is preserved.', '操作失败，已保留草稿。') });
			request.done(value.ok);
		};
		window.addEventListener('message', listener); post({ type: 'ready' });
		const pending = requests.current;
		return () => { window.removeEventListener('message', listener); for (const request of pending.values()) { request.done(false); } pending.clear(); };
	}, [post]);
	if (!snapshot) { return <main className="settings-page"><p>{t('Loading settings…', '正在读取设置…')}</p></main>; }
	const testing = !!snapshot.providerTest?.running;
	const state = { ...snapshot, pending: snapshot.pending || localPending || testing };
	const run: Run = (command, revision = snapshot.revision) => {
		if (state.pending || requests.current.size) { return Promise.resolve(false); }
		const requestId = ++counter.current; setLocalPending(true); setResult(undefined);
		return new Promise(resolve => { requests.current.set(requestId, { type: command.type, done: resolve }); post({ ...command, provider: 'deepseek', revision, requestId }); });
	};
	const cancelDiscovery = () => { post({ type: 'cancelDiscovery', provider: 'deepseek', revision: snapshot.revision, requestId: ++counter.current, discoveryId: snapshot.discovery?.id }); lastCandidate.current = undefined; setDiscovering(false); };
	const profile = snapshot.providers.deepseek;
	const enabled = snapshot.supplierEnabled ?? profile.enabled ?? snapshot.selection?.provider === 'deepseek';
	const locked = state.pending || connectionDirty || !!editing || discovering;
	return <main className="settings-page settings-v3">
		<aside className="settings-navigation"><nav aria-label={t('Settings categories', '设置分类')}><button type="button" aria-current="page"><Icon name="settings" /><span>{t('Model configuration', '模型配置')}</span></button></nav></aside>
		<div className="settings-main-content"><header className="settings-header"><h1>{t('Model services', '模型服务')}</h1></header>
		<section className="settings-card settings-provider-selection"><div className="settings-row"><label className="settings-row-title" htmlFor="settings-provider">{t('Provider', '供应商')}</label><div className="settings-row-control"><select id="settings-provider" aria-label={t('Provider', '供应商')} value="deepseek" onChange={() => {}}><option value="deepseek">DeepSeek</option></select></div></div></section>
		{busy && <p className="settings-note">{t('A response is running. Changes apply next time.', '正在回复，修改下一轮生效。')}</p>}
		{snapshot.error && <div className="settings-feedback failure" role="alert">{snapshot.error}</div>}
		{result && !result.ok && <div className="settings-feedback failure" role="alert">{result.text}</div>}
		{connectionDirty && <p className="settings-note">{t('Save or cancel the connection draft before fetching or testing.', '请先保存或取消连接修改，再同步模型或测试。')}</p>}
		<ConnectionForm provider="deepseek" snapshot={{ ...state, pending: state.pending || !!editing || discovering }} run={run} dirtyChanged={setConnectionDirty} post={post} enabled={!!enabled} toggle={enabled => { void run({ type: 'toggleProvider', enabled }); }} test={() => { void run({ type: 'testProvider' }); }} testDisabled={locked || busy || !profile.models.length || !snapshot.keyConfigured.deepseek} />
		<section className="settings-models"><div className="settings-section-title"><h2>{t('Models', '模型')}</h2><button aria-busy={(discovering && !snapshot.discovery) || undefined} disabled={locked || !snapshot.keyConfigured.deepseek} onClick={() => { lastCandidate.current = undefined; setDiscovering(true); void run({ type: 'fetchModels' }).then(ok => { if (!ok) { setDiscovering(false); } }); }}><Icon name="retry" />{discovering && !snapshot.discovery ? t('Syncing…', '同步中…') : t('Sync models', '同步模型')}</button></div>
		<div className="settings-model-list"><div className="settings-model-group"><button type="button" aria-expanded={modelsOpen} onClick={() => setModelsOpen(!modelsOpen)}><span className={modelsOpen ? 'group-chevron expanded' : 'group-chevron'}><Icon name="chevron" /></span>deepseek</button><span>{profile.models.length} {t('models', '个模型')}</span></div>
		{modelsOpen && <div>{!profile.models.length && <p className="settings-empty">{t('No models added. Sync models to choose which to add.', '尚未添加模型，点击“同步模型”选择添加。')}</p>}{profile.models.map(model => <div className="settings-model-row" key={model.id}><span className="settings-model-logo"><img src={deepseekLogo} alt="" /></span><div className="model-name"><strong title={model.id}>{model.name}</strong>{!!snapshot.parameterIssues?.[model.id]?.length && <small className="settings-warning">{t('Adjust conflicting parameters', '请调整冲突参数')}</small>}</div><ModelCapabilityIcons capabilities={resolveCapabilities('deepseek', profile.baseURL, model.id, model.discovered, model.settings)} /><div className="model-actions"><button className="settings-icon" disabled={locked} aria-label={t('Edit ', '编辑 ') + model.name} onClick={() => { setResult(undefined); setEditing(model); }}><Icon name="settings" /></button><button className="settings-icon" disabled={locked} aria-label={t('Remove ', '移除 ') + model.name} onClick={() => { void run({ type: 'removeModel', id: model.id }); }}><Icon name="minus" /></button></div></div>)}</div>}</div></section>
		{snapshot.providerTest && <section className="settings-test-results" aria-live="polite"><div className="settings-section-title"><h2>{t('Connection tests', '连接测试')}</h2>{testing && <button onClick={() => post({ type: 'cancelProviderTest', provider: 'deepseek', requestId: ++counter.current, revision: snapshot.revision, testId: snapshot.providerTest!.id })}>{t('Cancel tests', '取消测试')}</button>}</div>{snapshot.providerTest.models.map(model => <div className="test-result" key={model.id}><span>{model.id}</span><span>{({ waiting: t('Waiting', '待测试'), running: t('Testing…', '测试中…'), success: t('Connected', '连接成功'), failure: t('Failed', '失败'), cancelled: t('Cancelled', '已取消') })[model.status]}{model.error && <small>{model.error}</small>}</span></div>)}</section>}
		{discovering && <ModelDiscoveryDialog discovery={snapshot.discovery} configuredIds={profile.models.map(model => model.id)} pending={state.pending} error={result && !result.ok ? result.text : undefined} cancel={cancelDiscovery} confirm={ids => { void run({ type: 'confirmModels', discoveryId: snapshot.discovery?.id, ids }).then(ok => { if (ok) { lastCandidate.current = undefined; setDiscovering(false); } }); }} />}
		{editing && <SettingsDialog title={t('Edit model', '编辑模型')} close={() => { if (!state.pending) { setEditing(undefined); } }}>{result && !result.ok && <p className="settings-feedback failure" role="alert">{result.text}</p>}<ModelForm provider="deepseek" snapshot={state} model={editing} run={run} close={() => setEditing(undefined)} /></SettingsDialog>}
		</div>
	</main>;
}
