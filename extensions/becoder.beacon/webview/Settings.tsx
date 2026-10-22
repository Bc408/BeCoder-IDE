/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

import { Children, cloneElement, isValidElement, useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { normalizeBaseURL, type ModelParameterName, type ProviderId } from '../src/connection';
import { resolveCapabilities, type CapabilityField, type ModelCapabilities, type ModelSettings } from '../src/models';
import { modelParameterIssues, parameterPolicy, type ConfiguredModel, type SettingsCommand, type SettingsResult, type SettingsSnapshot } from '../src/modelConfiguration';
import { ModelDiscoveryDialog, ModelSelect, ProviderSelector, SettingsDialog } from './SettingsDialogs';
import { Notifications, type Notification } from './Notifications';
import { ApiKeyDialog, ProviderTestResults, SavedApiKey } from './ApiKeyControls';
import deepseekLogo from '../resources/deepseek.svg';
import { Icon } from './Icon';

const zh = document.documentElement.lang.startsWith('zh');
const t = (en: string, cn: string) => zh ? cn : en;
const supportName = (value: boolean) => value ? t('Supported', '支持') : t('Unsupported', '不支持');
export function capabilitySummary(capabilities: ModelCapabilities): string {
	return [t('Vision', '视觉') + ': ' + supportName(capabilities.vision), t('Reasoning', '推理') + ': ' + supportName(capabilities.reasoning), t('Tools', '工具') + ': ' + supportName(capabilities.tools)].join(', ');
}


type Run = (command: Omit<SettingsCommand, 'requestId' | 'provider' | 'revision'>, revision?: number) => Promise<boolean>;
function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange(value: boolean): void }) {
	return <button type="button" className="settings-switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
	return <label className="settings-field"><span>{label}</span><span className="settings-field-control">{Children.map(children, child => isValidElement(child) && (child.type === 'input' || child.type === 'select') ? cloneElement(child as ReactElement<{ 'aria-label': string }>, { 'aria-label': label }) : child)}</span></label>;
}
function ModelCapabilityIcons({ capabilities }: { capabilities: ModelCapabilities }) {
	return <span className="settings-model-capabilities">{(['vision', 'reasoning', 'tools'] as const).filter(field => capabilities[field]).map(field => {
		const label = ({ vision: t('Vision input', '视觉输入'), reasoning: t('Reasoning', '推理'), tools: t('Tool calls', '工具调用') })[field] + ': ' + supportName(capabilities[field]);
		return <span key={field} className={'settings-capability ' + field} aria-label={label} data-becoder-tooltip={label}><Icon name={field === 'vision' ? 'eye' : field === 'reasoning' ? 'reasoning' : 'tools'} /></span>;
	})}</span>;
}

function ConnectionForm({ provider, snapshot, run, dirtyChanged, post, enabled, toggle, test, testDisabled, editKey, keyDisabled }: { provider: ProviderId; snapshot: SettingsSnapshot; run: Run; dirtyChanged(value: boolean): void; post(message: unknown): void; enabled: boolean; toggle(value: boolean): void; test(): void; testDisabled: boolean; editKey(): void; keyDisabled: boolean }) {
	const saved = snapshot.providers[provider].baseURL;
	const [baseURL, setBaseURL] = useState(saved);
	const revision = useRef(snapshot.revision);
	const originalAddress = useRef(saved);
	const dirty = baseURL !== saved;
	const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
	useEffect(() => { dirtyChanged(dirty); }, [dirty, dirtyChanged]);
	useEffect(() => {
		if (!dirtyRef.current) { setBaseURL(saved); originalAddress.current = saved; revision.current = snapshot.revision; }
		else if (saved === originalAddress.current) { revision.current = snapshot.revision; }
	}, [saved, snapshot.revision]);
	return <section className="connection-form settings-card settings-connection">
		<div className="settings-row"><div className="settings-row-copy"><span className="settings-row-title">{t('Enable provider', '启用服务商')}</span><small>{t('Use added models in chat', '在聊天中使用已添加的模型')}</small></div><div className="settings-row-control"><Switch checked={enabled} disabled={snapshot.pending || dirty} label={t('Enable DeepSeek', '启用 DeepSeek')} onChange={toggle} /></div></div>
		<form onSubmit={async event => { event.preventDefault(); if (await run({ type: 'saveConnection', baseURL }, revision.current)) { setBaseURL(normalizeBaseURL(baseURL, provider)); } }}>
			<div className="settings-row"><div className="settings-row-copy"><label className="settings-row-title" htmlFor="connection-address">{t('API address', 'API 地址')}</label><small>{t('Model request endpoint', '模型请求地址')}</small></div><div className="settings-row-control settings-address-control"><input id="connection-address" aria-label={t('API address', 'API 地址')} required type="url" value={baseURL} disabled={snapshot.pending} onChange={event => setBaseURL(event.target.value)} spellCheck={false} autoComplete="off" /></div></div>
			{dirty && <div className="settings-form-actions"><button type="button" disabled={snapshot.pending} onClick={() => { setBaseURL(saved); originalAddress.current = saved; revision.current = snapshot.revision; }}>{t('Cancel', '取消')}</button><button type="submit" className="settings-primary" disabled={snapshot.pending}>{snapshot.pending ? t('Saving…', '保存中…') : t('Save address', '保存地址')}</button></div>}
		</form>
		<div className="settings-row"><div className="settings-row-copy"><span id="connection-key-label" className="settings-row-title">{t('API key', 'API 密钥')}</span><small>{t('Model service credential', '模型服务凭据')}</small></div><div className="settings-row-control key-test-line"><SavedApiKey snapshot={snapshot} disabled={keyDisabled} post={post} edit={editKey} remove={() => { void run({ type: 'saveKey', clearKey: true }); }} />
		<button type="button" className="connection-test" aria-busy={snapshot.providerTest?.running || undefined} disabled={!snapshot.providerTest?.running && (testDisabled || dirty)} data-becoder-tooltip={snapshot.providerTest?.running ? t('Cancel tests', '取消测试') : t('Test all ' + snapshot.providers[provider].models.length + ' added models. May use credits; checks default text generation only.', '测试全部 ' + snapshot.providers[provider].models.length + ' 个已添加模型，可能消耗少量额度，仅检查默认参数下的文本连通性。')} onClick={test}>{snapshot.providerTest?.running ? t('Cancel tests', '取消测试') : t('Test', '测试')}</button></div></div>
	</section>;
}

function Parameter({ name, label, maximum, disabled, unsupported, draft, setDraft }: { name: ModelParameterName; label: string; maximum: number; disabled?: boolean; unsupported?: boolean; draft: ConfiguredModel; setDraft(value: ConfiguredModel): void }) {
	const value = draft.parameters[name];
	const enabled = value !== undefined;
	const minimum = name === 'maxOutputTokens' ? 1 : 0;
	const step = name === 'maxOutputTokens' ? 1 : 0.05;
	const change = (value: number | undefined) => { const parameters = { ...draft.parameters }; if (value === undefined) { delete parameters[name]; } else { parameters[name] = value; } setDraft({ ...draft, parameters }); };
	return <div className={'parameter-row' + (unsupported ? ' inapplicable' : '')} data-becoder-tooltip={unsupported ? t('This thinking mode uses model-default sampling parameters.', '当前思考模式使用模型默认的采样参数。') : undefined}><div className="parameter-heading"><label htmlFor={`parameter-${name}`}>{label}</label><span>{unsupported ? t('Not applicable', '不适用') : enabled ? value : t('Model default', '模型默认')}</span><Switch label={t(`Customize ${label}`, `自定义${label}`)} checked={enabled} disabled={disabled || (unsupported && !enabled)} onChange={checked => change(checked ? name === 'temperature' ? 1 : name === 'topP' ? 1 : Math.min(4096, maximum) : undefined)} /></div>
		{enabled && <div className="parameter-value">{name !== 'maxOutputTokens' && <input type="range" aria-label={label + t(' slider', '滑块')} disabled={disabled || unsupported} min={minimum} max={maximum} step={step} value={value} onChange={event => change(Number(event.target.value))} />}<input id={`parameter-${name}`} aria-label={label} type="number" required disabled={disabled || unsupported} min={minimum} max={maximum} step={step} value={Number.isNaN(value) ? '' : value} onChange={event => change(event.target.valueAsNumber)} /></div>}
	</div>;
}

const capacityFields = ['contextWindow', 'maxInputTokens', 'maxOutputTokens'] as const;
const capacityValues = (capabilities: ModelCapabilities) => Object.fromEntries(capacityFields.map(field => [field, String(capabilities[field] ?? '')])) as Record<typeof capacityFields[number], string>;
function ModelForm({ provider, snapshot, model, run, close }: { provider: ProviderId; snapshot: SettingsSnapshot; model?: ConfiguredModel; run: Run; close(): void }) {
	const [draft, setDraft] = useState<ConfiguredModel>(() => {
		const value = structuredClone(model ?? { id: '', name: '', parameters: {}, settings: {} });
		if (!resolveCapabilities(provider, snapshot.providers[provider].baseURL, value.id, value.discovered, value.settings).reasoning) { delete value.settings.thinking; delete value.settings.effort; }
		return value;
	});
	const [initialRevision] = useState(snapshot.revision);
	const capabilities = resolveCapabilities(provider, snapshot.providers[provider].baseURL, draft.id, draft.discovered, draft.settings);
	const automatic = resolveCapabilities(provider, snapshot.providers[provider].baseURL, draft.id, draft.discovered);
	const [capacities, setCapacities] = useState(() => capacityValues(capabilities));
	const policy = parameterPolicy(provider, draft.id, capabilities, draft.settings);
	const pending = snapshot.pending;
	const issues = modelParameterIssues(provider, snapshot.providers[provider].baseURL, draft);
	const setting = (settings: ModelSettings) => setDraft({ ...draft, settings });
	const override = (field: CapabilityField, value: unknown) => {
		const overrides = { ...draft.settings.overrides };
		if (value === undefined) { delete overrides[field]; } else { Object.assign(overrides, { [field]: value }); }
		const settings = { ...draft.settings, overrides };
		if (field === 'reasoning' && value === false) { delete settings.thinking; delete settings.effort; }
		setting(settings);
		return settings;
	};
	const changeCapacity = (field: typeof capacityFields[number], value: string) => {
		const settings = override(field, value === '' ? undefined : Number(value));
		const next = { ...capacities, [field]: value };
		if (field === 'contextWindow' && value) {
			const resolved = resolveCapabilities(provider, snapshot.providers[provider].baseURL, draft.id, draft.discovered, settings);
			for (const sibling of ['maxInputTokens', 'maxOutputTokens'] as const) {
				if (settings.overrides?.[sibling] === undefined) { next[sibling] = String(resolved[sibling]); }
			}
		}
		setCapacities(next);
	};
	const capabilityButton = (field: 'reasoning' | 'tools' | 'vision') => {
		const label = ({ reasoning: t('Reasoning', '推理'), tools: t('Tools', '工具'), vision: t('Vision', '视觉') })[field];
		return <button type="button" className="model-capability-button" aria-label={label} aria-pressed={capabilities[field]} disabled={pending} onClick={() => override(field, !capabilities[field])}><Icon name={field === 'vision' ? 'eye' : field === 'reasoning' ? 'reasoning' : 'tools'} /><span>{label}</span><span className="model-capability-check"><Icon name="check" /></span></button>;
	};
	const restore = () => {
		const settings = { ...draft.settings }; delete settings.overrides;
		if (!automatic.reasoning) { delete settings.thinking; delete settings.effort; }
		setting(settings); setCapacities(capacityValues(automatic));
	};
	return <form className="model-form settings-card" onSubmit={async event => { event.preventDefault(); if (await run({ type: 'saveModel', model: draft, originalId: model?.id }, initialRevision)) { close(); } }}>
		<div className="model-form-body"><section className="model-identity">
		<h3>{t('Basic information', '基础信息')}</h3>
		<Field label={t('Model ID', '模型 ID')}><input readOnly value={draft.id} disabled={pending} spellCheck={false} /></Field>
		<Field label={t('Display name', '显示名称')}><input required maxLength={120} value={draft.name} disabled={pending} onChange={event => setDraft({ ...draft, name: event.target.value })} /></Field>
		</section><section className="model-capability-section">
		<div className="model-choice-row"><span>{t('Model capabilities', '模型能力')}</span><div>{capabilityButton('reasoning')}{capabilityButton('tools')}</div></div>
		<div className="model-choice-row"><span>{t('Input modalities', '输入模态')}</span><div>{capabilityButton('vision')}</div></div>
		</section><section className="model-capacity-section"><h3>{t('Model capacity', '模型容量')}</h3>
		{capacityFields.map(field => <Field key={field} label={({ contextWindow: t('Context window (tokens)', '上下文窗口（Token）'), maxInputTokens: t('Maximum input tokens', '最大输入 Token'), maxOutputTokens: t('Maximum output tokens', '最大输出 Token') })[field]}><input type="number" required min={1} max={10000000} step={1} disabled={pending} value={capacities[field]} onChange={event => changeCapacity(field, event.target.value)} /></Field>)}
		<button type="button" className="settings-text-action" disabled={pending} onClick={restore}>{t('Restore model defaults', '恢复模型默认')}</button>
		</section><section className="model-generation-section"><h3>{t('Generation parameters', '生成参数')}</h3>
		{policy.thinking ? <div className="model-thinking-settings"><Field label={t('Thinking mode', '思考模式')}><ModelSelect label={t('Thinking mode', '思考模式')} value={draft.settings.thinking ?? 'default'} disabled={pending} options={[{ value: 'default', label: t('Model default', '模型默认') }, { value: 'enabled', label: t('Enabled', '开启') }, { value: 'disabled', label: t('Disabled', '关闭') }]} onChange={value => { const settings = { ...draft.settings }; if (value === 'default') { delete settings.thinking; } else { settings.thinking = value as ModelSettings['thinking']; } if (settings.thinking === 'disabled') { delete settings.effort; } setting(settings); }} /></Field>
		{draft.settings.thinking !== 'disabled' && policy.efforts.length > 0 && <Field label={t('Reasoning effort', '推理强度')}><ModelSelect label={t('Reasoning effort', '推理强度')} value={draft.settings.effort ?? 'default'} disabled={pending} options={[{ value: 'default', label: t('Model default', '模型默认') }, ...policy.efforts.map(value => ({ value, label: ({ low: t('Low', '低'), high: t('High', '高'), max: t('Maximum', '最高') })[value] }))]} onChange={value => { const settings = { ...draft.settings }; if (value === 'default') { delete settings.effort; } else { settings.effort = value as ModelSettings['effort']; } setting(settings); }} /></Field>}</div> : <div className="model-inapplicable" data-becoder-tooltip={t('This model does not support reasoning.', '当前模型不支持推理。')}><span>{t('Thinking settings', '思考设置')}</span><small>{t('Not applicable', '不适用')}</small></div>}
		<Parameter name="temperature" label={t('Temperature', '温度')} maximum={2} disabled={pending} unsupported={!policy.sampling} draft={draft} setDraft={setDraft} />
		<Parameter name="topP" label="Top-P" maximum={1} disabled={pending} unsupported={!policy.sampling} draft={draft} setDraft={setDraft} />
		<Parameter name="maxOutputTokens" label={t('Response token budget', '本次回复 Token 预算')} maximum={policy.outputMaximum} disabled={pending} draft={draft} setDraft={setDraft} />
		{issues.length > 0 && <p className="settings-warning" role="alert">{t('Adjust conflicting parameters: ', '请调整冲突参数：') + issues.map(issue => issue.field).join(', ')}</p>}
		<p className="settings-note">{t('Streaming is always enabled. Model-default parameters are omitted from requests.', '始终使用流式输出；模型默认参数不随请求发送。')}</p>
		</section></div>
		<div className="settings-form-actions"><button type="button" disabled={pending} onClick={close}>{t('Cancel', '取消')}</button><button type="submit" className="settings-primary" disabled={pending || !!issues.length}>{pending ? t('Saving…', '保存中…') : t('Save model', '保存模型')}</button></div>
	</form>;
}

export function Settings({ post }: { post(message: unknown): void }) {
	const settingsPage = useRef<HTMLElement>(null);
	const [snapshot, setSnapshot] = useState<SettingsSnapshot>();
	const currentSnapshot = useRef<SettingsSnapshot | undefined>(undefined);
	const [keyFlow, setKeyFlow] = useState<'add' | 'replace' | 'models' | 'tests'>();
	const flowEpoch = useRef(0);
	const closeFlowRef = useRef<() => void>(() => {});
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<ConfiguredModel>();
	const [modelsOpen, setModelsOpen] = useState(true);
	const [discovering, setDiscovering] = useState(false);
	const [connectionDirty, setConnectionDirty] = useState(false);
	const [result, setResult] = useState<{ ok: boolean; text: string }>();
	const [notices, setNotices] = useState<Notification[]>([]);
	const [latestNotice, setLatestNotice] = useState<Notification>();
	const noticeId = useRef(0);
	const notify = useCallback((text: string) => {
		if (document.hidden) { return; }
		const notice = { id: ++noticeId.current, text };
		setLatestNotice(notice); setNotices(previous => [notice, ...previous].slice(0, 4));
	}, []);
	const dismissNotice = useCallback((id: number) => setNotices(previous => previous.filter(notice => notice.id !== id)), []);
	const [localPending, setLocalPending] = useState(false);
	const counter = useRef(0);
	const requests = useRef(new Map<number, { type: string; done(ok: boolean): void }>());
	const lastCandidate = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (snapshot?.discovery) { lastCandidate.current = snapshot.discovery.id; }
		else if (discovering && lastCandidate.current && !snapshot?.pending && !localPending) {
			lastCandidate.current = undefined; setDiscovering(false); flowEpoch.current++; setKeyFlow(undefined);
			const text = t('Settings changed. Fetch models again.', '设置已改变，请重新获取模型。');
			setResult({ ok: false, text }); notify(text);
		}
	}, [snapshot?.discovery, snapshot?.pending, discovering, localPending, notify]);
	useEffect(() => {
		const listener = (event: MessageEvent) => {
			if (event.data?.type === 'settingsSnapshot') { currentSnapshot.current = event.data.settings; setSnapshot(event.data.settings); setBusy(event.data.busy); }
			if (event.data?.type !== 'settingsResult') { return; }
			const value = event.data as SettingsResult;
			const request = requests.current.get(value.requestId);
			if (!request) { return; }
			requests.current.delete(value.requestId); setLocalPending(false);
			setResult({ ok: value.ok, text: value.ok ? request.type === 'fetchModels' ? t('Choose models, then confirm.', '请选择模型后确认。') : request.type === 'testProvider' ? t('Connection tests finished.', '连接测试已结束。') : t('Saved. Changes apply to the next response.', '已保存，修改将在下一轮回复中生效。') : value.error ?? t('Operation failed. Your draft is preserved.', '操作失败，已保留草稿。') });
			if (!value.ok) { notify(value.error ?? t('Operation failed. Your draft is preserved.', '操作失败，已保留草稿。')); }
			else if (request.type === 'testProvider') {
				const models = currentSnapshot.current?.providerTest?.models ?? [];
				const success = models.filter(model => model.status === 'success').length;
				const failures = models.filter(model => model.status === 'failure');
				const cancelled = models.filter(model => model.status === 'cancelled').length;
				notify(t(`Connection tests: ${success} connected, ${failures.length} failed, ${cancelled} cancelled.`, `连接测试：${success} 个成功，${failures.length} 个失败，${cancelled} 个取消。`) + failures.map(model => `\n${model.id}: ${model.error ?? t('Connection failed', '连接失败')}`).join(''));
			} else if (request.type !== 'fetchModels') { notify(t('Model settings saved.', '模型设置已保存。')); }
			request.done(value.ok);
		};
		window.addEventListener('message', listener); post({ type: 'ready' });
		const pending = requests.current;
		const visibility = () => { if (document.hidden) { closeFlowRef.current(); setNotices([]); setLatestNotice(undefined); } };
		document.addEventListener('visibilitychange', visibility);
		return () => { flowEpoch.current++; document.removeEventListener('visibilitychange', visibility); window.removeEventListener('message', listener); for (const request of pending.values()) { request.done(false); } pending.clear(); };
	}, [post, notify]);
	if (!snapshot) { return <main className="settings-page"><p>{t('Loading settings…', '正在读取设置…')}</p></main>; }
	const testing = !!snapshot.providerTest?.running;
	const state = { ...snapshot, pending: snapshot.pending || localPending || testing };
	const run: Run = (command, revision = currentSnapshot.current!.revision) => {
		if (currentSnapshot.current?.pending || currentSnapshot.current?.providerTest?.running || requests.current.size) { return Promise.resolve(false); }
		const requestId = ++counter.current; setLocalPending(true); setResult(undefined);
		return new Promise(resolve => { requests.current.set(requestId, { type: command.type, done: resolve }); post({ ...command, provider: 'deepseek', revision, requestId }); });
	};
	const cancelDiscovery = () => { post({ type: 'cancelDiscovery', provider: 'deepseek', revision: snapshot.revision, requestId: ++counter.current, discoveryId: snapshot.discovery?.id }); lastCandidate.current = undefined; setDiscovering(false); flowEpoch.current++; setKeyFlow(undefined); };
	const closeFlow = () => {
		flowEpoch.current++;
		if (currentSnapshot.current?.providerTest?.running || [...requests.current.values()].some(request => request.type === 'testProvider')) { post({ type: 'cancelProviderTest', provider: 'deepseek', revision: currentSnapshot.current?.revision, requestId: ++counter.current, testId: currentSnapshot.current?.providerTest?.id }); }
		if (keyFlow === 'models') { cancelDiscovery(); }
		setKeyFlow(undefined); setResult(undefined);
	};
	closeFlowRef.current = closeFlow;
	const startTests = () => { setKeyFlow('tests'); void run({ type: 'testProvider' }); };
	const fetchCandidates = () => { lastCandidate.current = undefined; setDiscovering(true); void run({ type: 'fetchModels' }); };
	const keySaved = () => { if (keyFlow === 'replace') { if (currentSnapshot.current?.providers.deepseek.models.length) { startTests(); } else { setKeyFlow('tests'); } } else { setKeyFlow('models'); fetchCandidates(); } };
	const confirmCandidates = async (ids: string[]) => {
		const epoch = flowEpoch.current;
		const setup = keyFlow === 'models';
		if (await run({ type: 'confirmModels', discoveryId: currentSnapshot.current?.discovery?.id, ids })) {
			if (epoch !== flowEpoch.current) { return; }
			lastCandidate.current = undefined; setDiscovering(false);
			if (setup) { if (ids.length) { startTests(); } else { setKeyFlow('tests'); } }
		}
	};
	const profile = snapshot.providers.deepseek;
	const enabled = snapshot.supplierEnabled ?? profile.enabled ?? snapshot.selection?.provider === 'deepseek';
	const locked = state.pending || connectionDirty || !!editing || discovering || !!keyFlow;
	return <main ref={settingsPage} className="settings-page settings-v3">
		<aside className="settings-navigation"><nav aria-label={t('Settings categories', '设置分类')}><button type="button" className="settings-category" aria-current="page" onClick={() => settingsPage.current?.scrollTo({ top: 0 })}><Icon name="settings" /><span>{t('Model configuration', '模型配置')}</span></button></nav></aside>
		<div className="settings-main-content"><header className="settings-header"><h1>{t('Model services', '模型服务')}</h1></header>
		<section className="settings-card settings-provider-selection"><div className="settings-row"><div className="settings-row-copy"><label className="settings-row-title" htmlFor="settings-provider">{t('Provider', '供应商')}</label><small>{t('Choose a model service', '选择模型服务')}</small></div><div className="settings-row-control"><ProviderSelector /></div></div></section>
		{busy && <p className="settings-note">{t('Busy. Changes apply next round.', '正在忙碌，修改下一轮生效')}</p>}
		{snapshot.error && <div className="settings-feedback failure" role="alert">{snapshot.error}</div>}
		{connectionDirty && <p className="settings-note">{t('Save or cancel the connection draft before fetching or testing.', '请先保存或取消连接修改，再同步模型或测试。')}</p>}
		<ConnectionForm provider="deepseek" snapshot={{ ...state, pending: state.pending || !!editing || discovering || !!keyFlow }} run={run} dirtyChanged={setConnectionDirty} post={post} enabled={!!enabled} toggle={enabled => { void run({ type: 'toggleProvider', enabled }); }} keyDisabled={state.pending || !!editing || discovering || !!keyFlow} editKey={() => { flowEpoch.current++; setResult(undefined); setKeyFlow(snapshot.keyConfigured.deepseek ? 'replace' : 'add'); }} test={() => { if (testing) { post({ type: 'cancelProviderTest', provider: 'deepseek', requestId: ++counter.current, revision: snapshot.revision, testId: snapshot.providerTest!.id }); } else { void run({ type: 'testProvider' }); } }} testDisabled={locked || busy || !profile.models.length || !snapshot.keyConfigured.deepseek} />
		<section className="settings-models"><div className="settings-section-title"><h2>{t('Models', '模型')}</h2><button aria-busy={(discovering && !snapshot.discovery) || undefined} disabled={locked || !snapshot.keyConfigured.deepseek} onClick={() => { lastCandidate.current = undefined; setDiscovering(true); void run({ type: 'fetchModels' }).then(ok => { if (!ok) { setDiscovering(false); } }); }}><Icon name="retry" />{discovering && !snapshot.discovery ? t('Syncing…', '同步中…') : t('Sync models', '同步模型')}</button></div>
		<div className="settings-model-list"><div className="settings-model-group"><button type="button" aria-expanded={modelsOpen} onClick={() => setModelsOpen(!modelsOpen)}><span className={modelsOpen ? 'group-chevron expanded' : 'group-chevron'}><Icon name="chevron" /></span>deepseek</button><span>{profile.models.length} {t('models', '个模型')}</span></div>
		{modelsOpen && <div>{!profile.models.length && <p className="settings-empty">{t('No models added. Sync models to choose which to add.', '尚未添加模型，点击“同步模型”选择添加。')}</p>}{profile.models.map(model => <div className="settings-model-row" key={model.id}><span className="settings-model-logo"><img src={deepseekLogo} alt="" /></span><div className="model-name"><strong title={model.id}>{model.name}</strong>{!!snapshot.parameterIssues?.[model.id]?.length && <small className="settings-warning">{t('Adjust conflicting parameters', '请调整冲突参数')}</small>}</div><ModelCapabilityIcons capabilities={resolveCapabilities('deepseek', profile.baseURL, model.id, model.discovered, model.settings)} /><div className="model-actions"><button className="settings-icon" disabled={locked} aria-label={t('Edit ', '编辑 ') + model.name} onClick={() => { setResult(undefined); setEditing(model); }}><Icon name="settings" /></button><button className="settings-icon" disabled={locked} aria-label={t('Remove ', '移除 ') + model.name} onClick={() => { void run({ type: 'removeModel', id: model.id }); }}><Icon name="minus" /></button></div></div>)}</div>}</div></section>
		{discovering && <ModelDiscoveryDialog discovery={snapshot.discovery} configuredIds={profile.models.map(model => model.id)} pending={state.pending} error={result && !result.ok ? result.text : undefined} setup={keyFlow === 'models'} retry={fetchCandidates} cancel={cancelDiscovery} confirm={ids => { void confirmCandidates(ids); }} />}
		{(keyFlow === 'add' || keyFlow === 'replace') && <ApiKeyDialog replace={keyFlow === 'replace'} revision={snapshot.revision} pending={state.pending} error={result && !result.ok ? result.text : undefined} run={async (command, revision) => { const epoch = flowEpoch.current; return await run(command, revision) && epoch === flowEpoch.current; }} saved={keySaved} close={() => { if (!state.pending) { closeFlow(); } }} />}
		{keyFlow === 'tests' && <SettingsDialog title={t('Check model connections', '检测模型连接')} close={closeFlow}><div className="settings-dialog-body setup-test-body">
			{(state.pending || !profile.models.length) && <p className="settings-note">{state.pending ? t('Testing added models…', '正在检测已添加模型…') : t('No models selected. Your key has been saved; sync models from this page when ready.', '尚未添加模型。密钥已保存，之后可在主页面同步模型。')}</p>}
			{result && !result.ok && <p className="settings-warning" role="alert">{result.text}</p>}<ProviderTestResults test={snapshot.providerTest} />
		</div><footer>{!state.pending && profile.models.length > 0 && <button disabled={busy} onClick={startTests}>{t('Test again', '重新检测')}</button>}<button className="settings-primary" onClick={closeFlow}>{state.pending ? t('Cancel tests', '取消检测') : t('Done', '完成')}</button></footer></SettingsDialog>}

		{editing && <SettingsDialog title={t('Edit model', '编辑模型')} close={() => { if (!state.pending) { setEditing(undefined); } }}>{result && !result.ok && <p className="settings-feedback failure" role="alert">{result.text}</p>}<ModelForm provider="deepseek" snapshot={state} model={editing} run={run} close={() => setEditing(undefined)} /></SettingsDialog>}
		</div><div className="settings-notifications"><Notifications notices={notices} latest={latestNotice} dismiss={dismissNotice} /></div>
	</main>;
}
